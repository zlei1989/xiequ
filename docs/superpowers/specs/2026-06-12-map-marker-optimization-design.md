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
| `MarkerEngine` | `app/travel/services/marker-engine.ts` | 标注渲染引擎，增量 diff + AMap.MarkerClusterer 聚类 |
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
  │       ├─ diff: 新增 → add()  → Clusterer.addMarker()
  │       ├─ diff: 更新（checked 变化）→ update() → 原地替换 icon
  │       └─ diff: 删除 → remove() → Clusterer.removeMarker()
  │
  └──▶ LocationList
```

### 增量更新

- `MarkerEngine` 内部持有上次 `locations` 的 Map（`id → Location`）
- `update(newLocations)` 对比新旧：
  - **新增**：id 在新不在旧 → 创建 Marker，加入 Clusterer
  - **更新**：id 相同但 `checked` 不同 → 调用 `marker.setIcon()` 替换图标
  - **删除**：id 在旧不在新 → 从 Clusterer 移除，销毁 Marker
- 首次调用（旧集合为空）：全部视为新增

---

## 标注样式

### 颜色对齐 antd-mobile 语义色

| 状态 | antd-mobile token | 色值 | CSS 变量 |
|------|-------------------|------|----------|
| 已打卡 | `success` | `#00b578` | `--adm-color-success` |
| 待打卡 | `primary` | `#1677ff` | `--adm-color-primary` |

### 图标设计

圆形标记（直径 24px）+ 白色中心圆点（直径 8px）。通过 Canvas 绘制 data URL SVG，不产生额外网络请求。

`marker-style.ts` 暴露 `createMarkerIcon(status: 'visited' | 'unvisited'): AMap.Icon`：
- 从 DOM 读取 `--adm-color-success` / `--adm-color-primary` computed value
- 回退策略：若 DOM 不可用（SSR/测试），使用硬编码回退色值
- SVG data URL 格式：`data:image/svg+xml;charset=utf-8,...`

---

## 标注聚类

### MarkerEngine 接口

```typescript
interface IMarkerEngine {
  update(locations: Location[]): void;   // 增量 diff + 渲染
  destroy(): void;                        // 清理所有标注和聚类器
}
```

### ClusterEngine

- 基于 `AMap.MarkerClusterer`
- 插件通过 `@amap/amap-jsapi-loader` 的 plugins 参数加载（`AMap.MarkerClusterer`）
- 聚合半径：80px
- 聚合点图标：圆形，显示数量，颜色为 `primary` 色
- 点击聚合点自动展开；同级标注 >50 且位置重叠时，spiderfy 扇形展开
- `TripMap` 挂载时创建 ClusterEngine 实例，卸载时调 `destroy()`

### 降级

Clusterer 插件加载失败 → WARN 日志 + 降级为逐个 `AMap.Marker` 直接渲染（功能可用，性能降低）。

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

- 地图实例创建时立即调用 `map.setMapStyle()` 设置初始主题
- 系统主题变化时再次调用 `map.setMapStyle()`，加 300ms CSS opacity 过渡

### 集成方式

`useMapTheme(mapInstance)` 在 `TripMap` 中调用，地图就绪后激活：

```typescript
const theme = useMapTheme(mapRef.current); // 返回 'light' | 'dark'，null 表示未就绪
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| AMap SDK 加载失败 | `TripMap` 显示降级 UI（错误提示 + 重试按钮），3 次后引导检查网络 |
| 暗色样式设置失败（不支持的 key、网络问题） | WARN 日志 + 降级默认亮色样式，不影响地图功能 |
| MarkerClusterer 插件加载失败 | 降级普通 Marker 逐个渲染，WARN 日志 |
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
| `app/travel/services/marker-engine.ts` | 新增 | 标注引擎（聚类 + 增量 diff） |
| `app/travel/services/marker-style.ts` | 新增 | 标注图标生成（antd-mobile 色） |
| `app/travel/hooks/use-map-theme.ts` | 新增 | 系统主题跟随 |
| `app/travel/components/trip-map.tsx` | 重构 | 加 `mapReady` 状态，引入 MarkerEngine + useMapTheme，移除手动标注逻辑 |
| `app/travel/services/amap.ts` | 修改 | plugins 加 `AMap.MarkerClusterer` |
| `__tests__/__mocks__/amap.ts` | 新增 | AMap SDK mock |
