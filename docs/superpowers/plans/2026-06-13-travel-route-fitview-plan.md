# 路线地图自动适配视野实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 路线弹层打开时自动缩放平移地图使所有标注点可视。

**Architecture:** TripMap 新增 `fitViewOnUpdate` prop，路线标注渲染完成后调用 `AMap.Map.setFitView()`；RouteMapPopup 传入 `visible` 触发。

**Tech Stack:** React, 高德地图 JSAPI 2.0

**Spec:** `docs/superpowers/specs/2026-06-13-travel-route-fitview-design.md`

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `app/travel/components/trip-map.tsx` | 新增 `fitViewOnUpdate` prop + setFitView 调用 | 修改 |
| `app/travel/components/route-map-popup.tsx` | 传入 `fitViewOnUpdate={visible}` | 修改 |

---

### Task 1: TripMap 新增 fitViewOnUpdate prop

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

- [ ] **Step 1: 添加 fitViewOnUpdate prop**

在 TripMap 的 props 类型中（`routeMode` 相关 props 附近）添加：

```ts
/** 路线标注更新后自动适配视野以包含所有标注（仅 routeMode 时生效） */
fitViewOnUpdate?: boolean;
```

在函数参数解构中添加默认值：

```ts
fitViewOnUpdate = false,
```

- [ ] **Step 2: 在路线标注渲染 effect 末尾添加 setFitView 调用**

在路线标注渲染 useEffect 中，创建完所有 marker 和 polyline 之后（`}, [routeMode, routeMarkers, polylines, mapReady, onRouteMarkerClick]);` 之前），添加：

```ts
// 自动适配视野以包含所有标注
if (fitViewOnUpdate && routeMarkersRef.current.length > 0 && map) {
  map.setFitView(routeMarkersRef.current, false, [40, 40, 40, 40]);
}
```

- [ ] **Step 3: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增错误。

- [ ] **Step 4: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "feat(travel): add fitViewOnUpdate prop to TripMap for route auto-fit"
```

---

### Task 2: RouteMapPopup 传入 fitViewOnUpdate

**Files:**
- Modify: `app/travel/components/route-map-popup.tsx`

- [ ] **Step 1: 给 TripMap 添加 fitViewOnUpdate prop**

在 `<TripMap` 的 props 中添加一行：

```tsx
fitViewOnUpdate={visible}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/route-map-popup.tsx
git commit -m "feat(travel): enable map auto-fit when route popup opens"
```

---

### Task 3: 格式化/检查/验证

- [ ] **Step 1: 格式化**

```bash
npm run format 2>&1
```

- [ ] **Step 2: 类型检查 + lint**

```bash
npm run check 2>&1
```

- [ ] **Step 3: 运行全部测试**

```bash
npx vitest run 2>&1
```

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: format and check after fitView enhancement" || echo "no changes"
```

---

## 实施顺序

```
Task 1 (TripMap fitViewOnUpdate) → Task 2 (RouteMapPopup 传入) → Task 3 (Format/Check)
```
