# 地图标注渲染优化与亮暗主题设计

## 概述

解决旅行地图的三个问题：

1. **Bug** — 切换 Tab 后标注消失（组件卸载导致 AMap 实例/标注销毁）
2. **性能** — 100+ 标注全量渲染无聚类，每次数据变化全量重建
3. **主题** — 地图不跟随系统亮暗模式

## 方案选择

**方案 C：深度改造** — 地图实例与应用生命周期绑定，抽象标注渲染引擎，antd-mobile 语义色对齐。

---

## 架构

### 组件树

```
layout.tsx
  <TravelContext.Provider>
    <MapProvider>                  ← Context，持有 AMap 实例，跨路由存活
      <Shell>
        <TripMap />                ← 始终挂载于 Shell 内，不随路由切换卸载
        {children}                 ← Next.js 路由切换：page.tsx | list/page.tsx
        <LocationPopup />          ← Portal
      </Shell>
    </MapProvider>
  </TravelContext.Provider>
```

### 关键集成点

- `MapProvider` 放在 `layout.tsx`，与 `Shell` 同级或包裹 `Shell`，在 `TravelContext.Provider` 内部
- `TripMap` 从 `page.tsx` 移到 `Shell` 内部渲染，通过 `visibility` 控制显隐
- `/travel` 路由页面渲染空 Fragment（或地图相关内容从 Shell 中移除后为空）
- `/travel/list` 路由页面正常渲染列表，地图以 `visibility: hidden` 保持在 DOM 中
- `LocationPopup` 也在 `Shell` 中渲染，与路由无关

### 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| `MapProvider` | `app/travel/providers/map-provider.tsx` | AMap 实例生命周期、主题切换、标注引擎初始化 |
| `useMap` | `app/travel/hooks/use-map.ts` | Hook，暴露 `mapInstance`、`updateMarkers`、`flyTo` 等操作 |
| `MarkerEngine` | `app/travel/services/marker-engine.ts` | 标注渲染引擎，增量更新 + 聚类，预留 LabelsLayer 扩展 |
| `useMapTheme` | `app/travel/hooks/use-map-theme.ts` | 监听系统主题变化，切换 AMap 暗色/亮色样式 |
| `marker-style` | `app/travel/services/marker-style.ts` | 按状态生成标注图标配置，引用 antd-mobile 语义色 |

---

## 数据流

```
COS (locations.json)
  │
  ▼
useLocations Hook
  │ sortedLocations[]
  ├──▶ TripMap → MarkerEngine.update(locations)
  │       ├─ diff: 新增 → add()
  │       ├─ diff: 更新（如打卡状态变化）→ update()
  │       └─ diff: 删除 → remove()
  │
  └──▶ LocationList
```

### 增量更新机制

- `MarkerEngine.update(newLocations)` 接收新数据，内部与上次 `locations` 做 diff
- diff 维度：`id` 标识唯一性；`checked` 字段变化视为状态更新
- 状态更新时原地替换 marker icon，不销毁重建
- 仅在 `locations` 数组引用变化时触发

---

## 标注样式

### 颜色对齐 antd-mobile 语义色

标注图标用 Canvas 绘制圆形标记，颜色直接引用 antd-mobile CSS 变量（从 DOM 读取 computed style）：

| 状态 | antd-mobile token | 色值 | CSS 变量 |
|------|-------------------|------|----------|
| 已打卡 | `success` | `#00b578` | `--adm-color-success` |
| 待打卡 | `primary` | `#1677ff` | `--adm-color-primary` |

图标形状：圆形（直径 24px）+ 白色中心圆点（直径 8px），与 antd-mobile Tag 的语义色完全一致。

### 实现方式

`marker-style.ts` 暴露 `createMarkerIcon(status)` 函数，返回 `AMap.Icon` 配置：
- image 为 data URL（Canvas 绘制圆形 SVG），避免额外网络请求
- size: [24, 24]
- imageOffset: [0, 0]

---

## 标注聚类

### 引擎接口

```typescript
interface IMarkerEngine {
  update(locations: Location[]): void;   // 增量更新
  destroy(): void;                        // 销毁所有标注和聚类器
}
```

### 当前实现：ClusterEngine

- 基于 `AMap.MarkerClusterer`
- 插件通过 `@amap/amap-jsapi-loader` 的 plugins 参数加载
- 聚合半径：80px
- 聚合图标样式：圆形，显示数量，颜色为 antd-mobile `primary` 色
- 点击聚合点 → 自动展开；单个标注 100+ 同级时用 spiderfy 扇形展开

### 预留扩展

`LabelsEngine` 实现 `IMarkerEngine` 接口，基于 `AMap.LabelsLayer`（WebGL），数据量万级以上时切换。

---

## 亮暗主题

### 检测方式

- 读取 `document.documentElement.dataset.prefersColorScheme`（由 `app/layout.tsx` 中的内联脚本设置）
- 监听 `<html>` 的 `data-prefers-color-scheme` 属性变化（`MutationObserver`）

### 地图样式切换

| 系统主题 | AMap 地图样式 |
|---------|-------------|
| light | `amap://styles/light`（默认） |
| dark | `amap://styles/dark` |

- AMap 实例就绪后立即设置当前主题
- 切换时加 300ms CSS `opacity` 过渡，避免生硬跳变
- 若 SDK 加载中主题切换，排队等待 SDK ready 后执行

---

## Tab 切换保活

### 策略

- `TripMap` 始终挂载，不使用条件渲染
- 不可见时：`visibility: hidden` + `position: absolute; left: -9999px`
- 切回时：恢复 `visibility: visible` + `position: relative`，调用 `map.setContainer()` 确保 AMap 重新绑定容器

### 原因

- `display: none` 可能导致 AMap 内部 canvas/webgl 上下文失效
- `visibility: hidden` 保持 DOM 尺寸布局，canvas 上下文不丢失

---

## 错误处理

| 场景 | 处理 |
|------|------|
| AMap SDK 加载失败 | MapProvider 显示降级 UI（错误提示 + 重试按钮），重试 3 次后引导用户检查网络 |
| 暗色样式设置失败 | WARN 日志 + 降级使用默认亮色样式，不影响地图功能 |
| MarkerClusterer 插件加载失败 | 降级使用普通 Marker 渲染（逐个标注），WARN 日志 |
| 地图容器被意外移除 | `setContainer()` 失败时尝试重新挂载到 DOM 节点 |

---

## 测试

| 层级 | 覆盖点 | 工具 |
|------|--------|------|
| 单元测试 | `marker-style.ts` 图标颜色生成；`marker-engine.ts` diff 逻辑（增/删/更新） | vitest + node |
| 单元测试 | `useMapTheme` 主题切换逻辑 | vitest + jsdom |
| 组件测试 | `MapProvider` Context 正确性；`TripMap` hide/show 标注不丢失 | vitest + jsdom |
| E2E | 切 Tab → 回地图标注仍在；打卡 → 标注变色；系统亮暗切换 → 地图跟随 | Playwright |

### Mock

- `__tests__/__mocks__/amap.ts` — mock `window.AMap` 全局对象，包含 Map、Marker、MarkerClusterer、Icon、Pixel 等核心类
- 读取 `--adm-color-success` / `--adm-color-primary` 的测试需注入 mock computed style

---

## 影响范围

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `app/travel/providers/map-provider.tsx` | 新增 | MapProvider Context + AMap 实例管理 |
| `app/travel/hooks/use-map.ts` | 新增 | 暴露地图操作 Hook |
| `app/travel/services/marker-engine.ts` | 新增 | 标注引擎（聚类 + 增量 diff） |
| `app/travel/hooks/use-map-theme.ts` | 新增 | 系统主题跟随 |
| `app/travel/services/marker-style.ts` | 新增 | 标注图标生成（antd-mobile 色） |
| `app/travel/components/trip-map.tsx` | 重构 | 从 MapProvider 取实例，移除独立初始化逻辑 |
| `app/travel/page.tsx` | 简化 | TripMap 移至 Shell，本页面可能只剩空 Fragment |
| `app/travel/layout.tsx` | 修改 | 引入 MapProvider 包裹 Shell |
| `app/travel/components/shell.tsx` | 修改 | 内嵌 TripMap + LocationPopup，根据 pathname 控制地图显隐 |
| `__tests__/__mocks__/amap.ts` | 新增 | AMap SDK mock |
