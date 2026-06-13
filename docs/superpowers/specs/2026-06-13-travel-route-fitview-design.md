# 路线地图自动适配视野设计文档

**日期**：2026-06-13
**状态**：待实施

---

## 概述

路线弹层打开时，自动缩放平移地图使所有标注点都在可视区域内。

---

## 设计

TripMap 新增 `fitViewOnUpdate` prop，在路线标注渲染完成后调用 AMap 的 `setFitView()` 自动适配视野。

---

## 文件变更

### 修改

| 文件 | 变更 |
|------|------|
| `app/travel/components/trip-map.tsx` | 新增 `fitViewOnUpdate?: boolean` prop；路线标注渲染 effect 末尾调用 `map.setFitView()` |
| `app/travel/components/route-map-popup.tsx` | 传入 `fitViewOnUpdate={visible}` |

### TripMap 变更详情

**Props 新增**：
```ts
/** 路线标注更新后自动适配视野以包含所有标注（仅 routeMode 时生效） */
fitViewOnUpdate?: boolean;
```

**路线标注渲染 effect 末尾添加**（在创建完 marker + polyline 之后）：
```ts
// 自动适配视野以包含所有标注
if (fitViewOnUpdate && routeMarkersRef.current.length > 0 && map) {
  map.setFitView(routeMarkersRef.current, false, [40, 40, 40, 40]);
}
```

### RouteMapPopup 变更详情

TripMap 增加 prop：
```tsx
fitViewOnUpdate={visible}
```

---

## 技术说明

- `AMap.Map.setFitView(overlays, immediately, avoid)` — 自动调整中心和缩放以适配传入的叠加物
- `routeMarkersRef.current` 为 `AMap.Marker[]`（继承自 Overlay），兼容 `setFitView`
- 边距 `[40, 40, 40, 40]` 防止标注贴边
- `fitViewOnUpdate` 仅在 `routeMode=true` 时生效，不影响地图页和收藏页
