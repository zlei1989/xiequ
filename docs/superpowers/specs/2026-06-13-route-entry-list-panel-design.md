# 路线地图位置列表面板设计

## 概述

在路线地图弹层（RouteMapPopup）右上角增加"列表"按钮，点击后从右侧滑入一个占屏幕宽度 60% 的位置列表面板，展示路线中各瞬间条目的日期和名称；点击条目后关闭面板、地图移动到该位置坐标、并打开位置详情弹层。

## 数据层

### 新增 RouteEntry 类型

```ts
/** 路线中的单个瞬间条目（未去重，用于位置列表） */
export type RouteEntry = {
  locationId: string;
  name: string;
  longitude: number;
  latitude: number;
  /** 瞬间日期（YYYY-MM-DD） */
  date: string;
};
```

### Route 类型新增字段

```ts
export type Route = {
  // ... 现有字段不变
  /** 按时间+空间排序后的瞬间条目（含日期，供位置列表面板使用） */
  entries: RouteEntry[];
};
```

### build-routes.ts 改动

在构建每个 Route 时，将排序后的 `sorted` 数组（已按时间优先 + 同日最近邻排序）映射为 `RouteEntry[]`，赋值给 `entries` 字段。`MomentEntry` 与 `RouteEntry` 结构相同，只需字段选择即可。

## UI 层

### 按钮

在 RouteMapPopup 的 `NavBar` 中，通过 `right` prop 放置一个"列表"按钮，位于右上角。

- 当 `route.entries` 为空时隐藏按钮

### 位置列表面板

使用 antd-mobile `Popup` 组件，`position="right"`，宽度 `60vw`，从右侧滑入覆盖在地图上方。

面板内部结构：

```
┌─────────────────────┐
│ ← 关闭     位置列表  │  ← NavBar
├─────────────────────┤
│ 2024-01-01          │  ← 日期分组标题
│   📍 天安门          │  ← 可点击条目
│   📍 故宫            │
│ 2024-01-02          │
│   📍 颐和园          │
│   📍 圆明园          │
│ ...                 │
└─────────────────────┘
```

- **日期分组**：同一天的条目归为一组，组间用日期标题分隔
- **条目行**：点击后依次关闭面板 → 触发地图移动 → 打开位置详情弹层
- **滚动**：内容溢出时 `overflow-y: auto`；每次打开面板从顶部开始（不记忆滚动位置）
- **过滤**：若条目对应的 Location 已被删除（`deleted: true`），从列表中跳过

### 高亮联动

新增状态 `activeLocationId: string | null`，用于标识当前选中位置。

- **点击条目时**：设 `activeLocationId` 为该条目的 `locationId`
- **关闭 LocationViewPopup 时**：设 `activeLocationId` 为 `null`（高亮恢复）
- **TripMap 渲染标注时**：若 `rm.locationId === activeLocationId`，标注背景色从 `#1677ff` 切换为 `var(--adm-color-warning)`（antd-mobile 警告色，黄色 #ffc107）

TripMap 新增 prop：

```ts
/** 当前激活的标注 locationId（用于高亮） */
activeMarkerId?: string;
```

## 组件交互

RouteMapPopup 状态扩展：

```
showEntryList: boolean          // 位置列表面板是否打开
activeLocationId: string | null // 当前高亮的 locationId
```

状态流转：

1. 用户点击"列表"按钮 → `showEntryList = true`
2. 面板从右侧滑入，用户浏览条目列表
3. 用户点击某个条目 →
   - `showEntryList = false`（关闭面板）
   - `activeLocationId = entry.locationId`
   - `mapRef.setCenter([entry.lng, entry.lat])`
   - 查找对应 Location → `setViewLocation(loc)`
4. 用户关闭 LocationViewPopup → `activeLocationId = null`

## 边界情况

| 场景 | 处理 |
|------|------|
| route.entries 为空 | 隐藏"列表"按钮 |
| 条目对应 Location 已被删除 | 列表渲染时过滤，不显示 |
| 地图未就绪（mapReady=false） | `setCenter` 调用无效果但不报错；详情弹层正常打开 |
| 面板内容过长 | `overflow-y: auto`，支持滚动 |
| 重新打开面板 | 从顶部开始显示（简单处理，不记忆滚动位置） |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `app/travel/types.ts` | 新增 `RouteEntry` 类型，`Route` 加 `entries` 字段 |
| `app/travel/lib/build-routes.ts` | 构建 `entries` 数组传入 Route |
| `app/travel/components/route-map-popup.tsx` | 新增按钮 + 位置列表面板 + 状态管理 |
| `app/travel/components/trip-map.tsx` | 新增 `activeMarkerId` prop，条件标注颜色 |
