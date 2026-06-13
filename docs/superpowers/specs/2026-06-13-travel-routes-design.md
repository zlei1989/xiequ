# 旅行路线页面设计文档

**日期**：2026-06-13
**状态**：已实施

---

## 概述

旅行模块新增"路线"页面，将已录入的所有精彩瞬间按时间顺序分组为若干段旅行路线，以列表展示。点击每条路线弹出地图层，展示标注点及按最近邻排序的连线。

---

## 路由与导航

### 新增页面

`/travel/routes` — 路线列表页，客户端组件。

### TabBar 变更

`shell.tsx` 新增第三个 Tab：

| Tab | 图标 | 路由 |
|-----|------|------|
| 地图 | `EnvironmentOutline` | `/travel` |
| 收藏 | `StarOutline` | `/travel/list` |
| 路线 | `TravelOutline` | `/travel/routes` |

---

## 文件变更

### 新增

| 文件 | 职责 |
|------|------|
| `app/travel/routes/page.tsx` | 路线页面，PullToRefresh + List + RouteMapPopup + LocationViewPopup |
| `app/travel/hooks/use-routes.ts` | 路线数据 Hook，从 context 取 locations，调用 `buildRoutes` 纯函数 |
| `app/travel/lib/build-routes.ts` | 纯函数：moments 提取 + 扁平化 + 排序 + 分组 + 标记排序 + 连线计算 |
| `app/travel/components/route-list-item.tsx` | 单条路线列表项 |
| `app/travel/components/route-map-popup.tsx` | 路线地图弹层，封装 TripMap + NavBar + LocationViewPopup |

### 修改

| 文件 | 变更 |
|------|------|
| `app/travel/components/shell.tsx` | TabBar 增加"路线"Tab |
| `app/travel/components/trip-map.tsx` | 新增可选 props：`routeMode`、`polylines`、`routeMarkers` |
| `app/travel/types.ts` | 新增 `Route`、`RouteMarker` 类型 |

### 类型定义

```ts
type Route = {
  /** 唯一标识，由 startDate 生成（如 "route-2024-01-01"） */
  id: string;
  markers: RouteMarker[];
  /** 按最近邻排序后的坐标序列，用作 polyline path */
  polyline: [number, number][];
  startDate: string;
  endDate: string;
  /** 持续天数，含头含尾（endDate - startDate + 1） */
  days: number;
  startName: string;
  endName: string;
};

type RouteMarker = {
  locationId: string;
  name: string;
  longitude: number;
  latitude: number;
  momentCount: number;
};
```

---

## 算法设计

### 数据来源

从 `useTravelContext` 获取全量 locations（已过滤 `deleted`），提取所有 `moments` 非空的地点。

### 步骤

1. **提取 & 扁平化**：遍历 `location.moments`，生成条目 `{ locationId, locationName, longitude, latitude, date }`
2. **按日期排序**：所有条目按 `date` 升序
3. **按间隔分组**：相邻条目日期差 ≥ 2 天则切分为新路线
4. **组内排序**：时间优先；同日多条按与上一个已确定标注的欧几里得距离排序（最近优先）
5. **计算 Polyline**：最近邻贪心算法，从起点出发每次选择未连线中距离最近的点
   - 距离公式：`√((lng2-lng1)² + (lat2-lat1)²)`
   - 同地点去重，按 `momentCount` 计数

### 边界情况

- 路段仅 1 个标注：polyline 为空数组
- 无任何瞬间：显示空态
- 所有瞬间在同一天：不作拆分
- 某地点在某段中有多个瞬间：只产生 1 个 marker，`momentCount` 累加

---

## 组件说明

### RouteListItem

使用 antd-mobile `List.Item`：

- **标题**：`startName → endName`（单行截断）
- **描述**：`{days}天 · {startDate} 至 {endDate}`
- **点击**：触发 `onClick(route)` 打开地图弹层

### RouteMapPopup

- antd-mobile `Popup`，`position="bottom"`，高约 80vh
- 头部 `NavBar`，标题显示 `{startName} → {endName}`
- 主体 `TripMap`（`routeMode=true`），传入 `route.markers` 和 `route.polyline`
  - polyline 映射：`[{ path: route.polyline, color: '#1677ff' }]`
- 标注点击：打开 `LocationViewPopup`（复用现有组件）

### TripMap 扩展

新增可选 props：

```ts
{
  routeMode?: boolean;                                    // 禁用聚类，使用路线标注样式
  polylines?: { path: [number, number][]; color?: string }[];
  routeMarkers?: RouteMarker[];                           // 路线标注数据
  onRouteMarkerClick?: (marker: RouteMarker) => void;     // 路线标注点击回调
  fitViewOnUpdate?: boolean;                              // 标注更新后自动适配视野（边距 48px）
}
```

- `routeMode=true`：跳过 MarkerEngine，直接创建 AMap.Marker + AMap.Polyline
- 标注图标使用 SVG 圆形图标（带编号，24×24），风格与地图页标注一致，颜色跟随 `--adm-color-primary`
- 基础能力（主题跟随、定位缓存）保持不变

---

## 数据流

```
useTravelContext (layout 层已初始化，提供全量 locations)
  → useRoutes(locations)
    → buildRoutes(locations)        // 纯函数
    → 返回 routes[]
  → routesPage 渲染 List + RouteMapPopup

下拉刷新 → useTravelContext.load() → locations 更新 → useRoutes 自动重算
```

### 空态与加载态

- 数据加载中：`<DotLoading />`
- 无情景数据：`<ErrorBlock status="empty" title="暂无路线" description="添加精彩瞬间后将自动生成路线" />`

---

## 技术栈

- **UI**：antd-mobile（`PullToRefresh`、`List`、`Popup`、`NavBar`、`ErrorBlock`、`DotLoading`）
- **地图**：高德地图 JSAPI 2.0（AMap.Marker + AMap.Polyline）
- **数据**：纯函数计算，测试友好

---

## 测试

`buildRoutes` 纯函数通过 vitest 测试，覆盖：

- 空列表 → 空路线
- 单天多地点 → 1 条路线，polyline 按最近邻连接
- 间隔 ≥ 2 天 → 拆分为 2 条路线
- 同日多点 → 按最近邻排序前后
- 单标注路线 → polyline 为空
