# 地图标注渲染优化与亮暗主题设计

## 概述

解决旅行地图的四个问题：

1. **Bug** — 切换 Tab 后标注消失（AMap 初始化和标注重建的异步时序未协调）
2. **性能** — 100+ 标注全量渲染无聚类，每次数据变化全量重建
3. **样式** — 所有标注统一红钉，已打卡/待打卡无法在地图上区分
4. **主题** — 地图不跟随系统亮暗模式

## 方案

**AMap 实例随组件生命周期正常重建**，不引入跨路由 Context 保活。修复异步时序、增量更新、聚类、主题跟随。

---

## Bug 根因与修复

### 根因

`TripMap` 现有两个 `useEffect`：

1. 第一个：加载 AMap SDK → 创建地图实例 → 绑定事件（依赖 `[]`，仅挂载时执行，异步）
2. 第二个：清空旧标注 → 遍历 `locations` → 新建标注（依赖 `[locations, onMarkerClick]`）

**竞态**：当 `locations` 数据先就绪（从 Context 拿到），但 AMap SDK 或地图实例还未创建完成时，第二个 effect 发现 `mapRef.current` 为空 → 静默跳过。之后地图实例就绪，但 `locations` 未变 → 不会再触发标注重建 → 标注消失。

### 修复

引入 `mapReady` 状态标志，地图实例初始化成功后置 `true`。标注渲染 effect 将 `mapReady` 加入依赖：

```
useEffect（地图初始化）:
  加载 SDK → new AMap.Map() → setMapReady(true)

useEffect（标注渲染）:
  依赖 [locations, mapReady]
  if (!mapReady || !mapRef.current) return  ← 双重守卫
  MarkerEngine.update(locations)
```

保证标注渲染**一定在地图实例就绪之后**执行。

---

## 架构

### 组件树（无需改动）

```
layout.tsx
  <TravelContext.Provider>
    <Shell>
      {children}              ← Next.js 路由切换：TripMap (page.tsx) | LocationList (list/page.tsx)
    </Shell>
  </TravelContext.Provider>
```

TripMap 保持路由级挂载，不加 MapProvider。

### 模块

| 模块 | 文件 | 职责 |
|------|------|------|
| `MarkerEngine` | `app/travel/services/marker-engine.ts` | 标注渲染引擎，增量 diff + map.add/map.remove 直接管理 |
| `useMapTheme` | `app/travel/hooks/use-map-theme.ts` | 监听系统主题变化，切换 AMap 暗色/亮色样式 |
| `marker-style` | `app/travel/services/marker-style.ts` | 按状态生成标注图标配置，引用 antd-mobile 语义色 |

---

## 数据流

```
COS (locations.json)
  │
  ▼
useLocations Hook (TravelContext)
  │ sortedLocations[]
  │
  ├──▶ TripMap ──▶ MarkerEngine.update(locations)
  │       │
  │       ├─ diff: 新增 → map.add(marker)
  │       ├─ diff: 更新（checked 变化）→ marker.setIcon() 原地替换
  │       └─ diff: 删除 → map.remove(marker)
  │
  └──▶ LocationList
```

### 增量更新

- `MarkerEngine` 内部持有上次 `locations` 的 Map（`id → Location`）
- `update(newLocations)` 对比新旧：
  - **新增**：id 在新不在旧 → 创建 Marker，`map.add(marker)` 添加到地图
  - **更新**：id 相同但 `checked` 不同 → 调用 `marker.setIcon()` 替换图标
  - **删除**：id 在旧不在新 → `map.remove(marker)` 从地图移除
- 首次调用（旧集合为空）：全部视为新增

---

## 标注样式

### 颜色对齐 antd-mobile 语义色

| 状态 | antd-mobile token | 色值 | CSS 变量 |
|------|-------------------|------|----------|
| 已打卡 | `success` | `#00b578` | `--adm-color-success` |
| 待打卡 | `primary` | `#1677ff` | `--adm-color-primary` |

### 图标设计

圆形标记（直径 24px）+ 白色中心圆点（直径 8px）。通过 data URL SVG 绘制，不产生额外网络请求。
标注不显示文字标签（`label` 已移除），仅显示圆点，鼠标悬停时通过 `title` 属性显示地点名称。

`marker-style.ts` 暴露 `createMarkerIcon(status: 'visited' | 'unvisited')`：
- 从 DOM 读取 `--adm-color-success` / `--adm-color-primary` computed value
- 回退策略：若 DOM 不可用（SSR/测试），使用硬编码回退色值
- SVG data URL 格式：`data:image/svg+xml;charset=utf-8,...`，颜色值中的 `#` 编码为 `%23` 防止被误解析为 URL fragment
- 返回的配置直接传给 `new AMap.Icon()`，仅包含 `image`、`size`、`imageSize` 三个有效属性

---

## 标注管理

### MarkerEngine 接口

```typescript
interface IMarkerEngine {
  update(locations: Location[]): void;   // 增量 diff + 渲染
  destroy(): void;                        // 清理所有标注
}
```

### 直接渲染（不使用 MarkerClusterer）

**决策**：经浏览器运行时验证，`AMap.MarkerClusterer.prototype.setMarkers` 源码为空操作（仅返回 `length`，不渲染任何标注）。`setData()` 需要 `{lnglat, weight}[]` 格式而非 `AMap.Marker[]`，与现有 Marker 对象体系不兼容。因此移除 MarkerClusterer，改为直接 `map.add(marker)` / `map.remove(marker)` 管理标注。

- 标注通过 `map.add()` 直接添加到地图，`map.remove()` 移除
- 生命周期完全由 `markerMap`（`locationId → AMap.Marker`）管理
- 插件 `AMap.MarkerClusterer` 已从预加载列表中移除（`amap.ts`）

---

## 亮暗主题

### 检测

- 读取 `document.documentElement.dataset.prefersColorScheme`（由 `app/layout.tsx` 内联脚本设置）
- 监听 `data-prefers-color-scheme` 属性变化（`MutationObserver`）

### 切换

| 系统主题 | AMap 地图样式 |
|---------|-------------|
| light | `amap://styles/light`（默认） |
| dark | `amap://styles/dark` |

- **构造时传入** `mapStyle: STYLE_MAP[readTheme()]`，地图首帧即用正确样式，避免 `setMapStyle` 滞后导致先白后黑闪烁
- 系统主题变化时通过 `useMapTheme` 的 `useEffect` 调用 `map.setMapStyle()` 跟随切换

### 防闪烁三层机制

AMap JSAPI v2 使用 canvas 渲染，canvas 初始化到首帧绘制之间存在透明间隙。为此建立三层防护：

1. **AMap 构造层** — `new AMap.Map()` 传入 `mapStyle: STYLE_MAP[readTheme()]`，地图 tile 首帧即暗色
2. **容器层** — 容器 div 设 `bg-[var(--background)]`（CSS 变量，由 `@media (prefers-color-scheme)` 驱动），AMap 接管前容器不透明
3. **Canvas 层** — `globals.css` 覆盖 `.amap-container canvas` 等 AMap 内部元素 `background-color: var(--background) !important`，canvas 透明时不透白

### 集成方式

`useMapTheme(mapInstance)` 在 `TripMap` 中调用，地图就绪后激活：

```typescript
const theme = useMapTheme(mapRef.current); // 返回 'light' | 'dark'，null 表示未就绪
```

内部使用 `useSyncExternalStore` 订阅 `data-prefers-color-scheme` 属性变化（MutationObserver），避免 effect 中 setState 导致的级联渲染。

同时导出 `readTheme()` 和 `STYLE_MAP`，供地图构造函数同步读取初始主题。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| AMap SDK 加载失败 | `TripMap` 显示 antd-mobile `ErrorBlock`（`status="default"`），重试 < 3 次时附带 `Button`（`color="primary" fill="outline"`），≥ 3 次仅显示错误信息，引导刷新页面 |
| 暗色样式设置失败（不支持的 key、网络问题） | WARN 日志 + 降级默认亮色样式，不影响地图功能 |
| MarkerClusterer API 不可用（setMarkers 空操作） | 已移除，统一使用 map.add/map.remove 直接管理 |
| DOM 容器被意外移除 | `map.destroy()` 安全清理，ERROR 日志 |

---

## 测试

| 层级 | 覆盖点 | 工具 |
|------|--------|------|
| 单元测试 | `marker-style.ts` 颜色生成、回退逻辑 | vitest + node |
| 单元测试 | `marker-engine.ts` diff 逻辑（增/删/更新）| vitest + node |
| 单元测试 | `useMapTheme.ts` MutationObserver 回调逻辑 | vitest + jsdom |
| 组件测试 | `TripMap` mapReady 状态流转、降级 UI | vitest + jsdom |
| E2E | 切 Tab 回地图标注仍在；打卡标注变色；系统亮暗切换地图跟随 | Playwright |

### Mock

- `__tests__/__mocks__/amap.ts` — mock `window.AMap`（Map, Marker, MarkerClusterer, Icon, Pixel, event）
- 读取 `--adm-color-*` CSS 变量的测试需注入 mock computed style

---

## 影响范围

| 文件 | 变更 | 说明 |
|------|------|------|
| `app/travel/services/marker-engine.ts` | 新增 | 标注引擎（增量 diff + map.add/remove 直接管理） |
| `app/travel/services/marker-style.ts` | 新增 | 标注图标生成（antd-mobile 语义色 SVG data URL） |
| `app/travel/hooks/use-map-theme.ts` | 新增 | 系统主题跟随 |
| `app/travel/components/trip-map.tsx` | 重构 | 加 `mapReady` 状态，引入 MarkerEngine + useMapTheme，移除手动标注逻辑 |
| `app/travel/services/amap.ts` | 修改 | plugins 移除 `AMap.MarkerClusterer`（setMarkers 经实测为空操作） |
| `app/travel/types/amap.d.ts` | 修改 | IconOptions 修正：`imageOffset` → `imageSize`，`size: Pixel` → `[number, number]` |
| `__tests__/__mocks__/amap.ts` | 新增 | AMap SDK mock |
