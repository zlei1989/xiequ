# 路线地图位置列表面板实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在路线地图弹层右上角增加"列表"按钮，点击后从右侧滑入 60vw 位置列表面板，按日期分组展示瞬间条目，点击条目关闭面板 → 移动地图 → 打开位置详情。

**Architecture:** 数据层在 Route 类型新增 `entries: RouteEntry[]` 字段，由 build-routes 在构建时填充排序后的瞬间条目（未去重）。UI 层在 RouteMapPopup 新增 Popup(position="right") 面板，TripMap 新增 `activeMarkerId` prop 控制标注高亮颜色。

**Tech Stack:** React 18 + antd-mobile + 高德地图 JS API

---

### Task 1: 新增 RouteEntry 类型 + Route.entries 字段

**Files:**
- Modify: `app/travel/types.ts`

- [ ] **Step 1: 在 types.ts 中新增 RouteEntry 并扩展 Route**

在 `RouteMarker` 类型定义之后、`Route` 类型定义之前插入 `RouteEntry`，并在 `Route` 中添加 `entries` 字段。

在 `RouteMarker` 类型后插入：

```ts
/** 路线中的单个瞬间条目（未去重，用于位置列表面板） */
export type RouteEntry = {
  /** 对应位置 ID */
  locationId: string;
  /** 位置名称 */
  name: string;
  /** 经度 */
  longitude: number;
  /** 纬度 */
  latitude: number;
  /** 瞬间日期（YYYY-MM-DD） */
  date: string;
};
```

在 `Route` 类型的 `endName` 之后添加：

```ts
/** 按时间+空间排序后的瞬间条目（未去重，含日期，供位置列表面板使用） */
entries: RouteEntry[];
```

- [ ] **Step 2: 验证类型检查通过**

```bash
npx tsc --noEmit 2>&1 | head -30
```

预期：types.ts 本身无报错；build-routes.ts 可能因为尚未返回 `entries` 字段而报类型错误（这是预期的，Task 2 修复）。

- [ ] **Step 3: 提交**

```bash
git add app/travel/types.ts
git commit -m "feat: add RouteEntry type and entries field to Route"
```

---

### Task 2: build-routes 构建 entries 字段

**Files:**
- Modify: `app/travel/lib/build-routes.ts`

- [ ] **Step 1: 在 Route 对象构造中添加 entries**

在 `build-routes.ts` 的 `map` 回调中，`sorted` 数组已是按时间+空间排序的 `MomentEntry[]`，将其映射为 `RouteEntry[]`。

找到 return 语句中 Route 对象的构造（约 197 行），在 `endName` 之后添加：

```ts
entries: sorted.map((e) => ({
  locationId: e.locationId,
  name: e.locationName,
  longitude: e.longitude,
  latitude: e.latitude,
  date: e.date,
})),
```

完整上下文（原代码 + 新增行）：

```ts
return {
  id: `route-${startDate}`,
  markers,
  polyline: [],
  startDate,
  endDate,
  days: calcDays(startDate, endDate),
  locationCount: markers.length,
  startName: firstMarker?.name ?? '',
  endName: lastMarker?.name ?? '',
  entries: sorted.map((e) => ({
    locationId: e.locationId,
    name: e.locationName,
    longitude: e.longitude,
    latitude: e.latitude,
    date: e.date,
  })),
};
```

- [ ] **Step 2: 验证类型检查通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

预期：无新增类型错误。

- [ ] **Step 3: 更新 build-routes 测试**

编辑 `__tests__/travel/build-routes.test.ts`，在现有 "polyline is always empty array" 测试中添加 entries 字段验证。

在该测试的期望块（`expect(r.polyline).toEqual([])` 之后）增加：

```ts
// entries 应包含原始瞬间条目（未去重）
expect(r.entries).toHaveLength(3);
expect(r.entries[0]).toEqual({
  locationId: '1',
  name: '北京',
  longitude: 116.4,
  latitude: 39.9,
  date: '2024-01-01',
});
expect(r.entries[1]).toEqual({
  locationId: '2',
  name: '南京',
  longitude: 118.8,
  latitude: 32.1,
  date: '2024-01-02',
});
expect(r.entries[2]).toEqual({
  locationId: '3',
  name: '上海',
  longitude: 121.5,
  latitude: 31.2,
  date: '2024-01-03',
});
```

也可以在 "same-day markers sorted by nearest to previous day marker" 测试中增加：

```ts
// 同日两个条目的排序验证
const day2Entries = r.entries.filter((e) => e.date === '2024-01-02');
expect(day2Entries).toHaveLength(2);
expect(day2Entries[0]?.name).toBe('颐和园');
expect(day2Entries[1]?.name).toBe('西湖');
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx vitest run __tests__/travel/build-routes.test.ts
```

预期：全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add app/travel/lib/build-routes.ts __tests__/travel/build-routes.test.ts
git commit -m "feat: build entries array in buildRoutes, update tests"
```

---

### Task 3: TripMap 新增 activeMarkerId prop

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

- [ ] **Step 1: 添加 activeMarkerId prop**

在 TripMap 的 props 类型中，`fitViewOnUpdate` 之后添加：

```ts
/** 当前激活的标注 locationId（用于高亮，仅在 routeMode 时生效） */
activeMarkerId?: string;
```

在组件函数参数解构中添加默认值：

```ts
activeMarkerId,
```

（放在 `fitViewOnUpdate = false,` 之后）

- [ ] **Step 2: 在路线标注渲染中使用条件颜色**

在路线标注渲染 effect 中（约 207 行），将标注 label 的背景色从硬编码 `#1677ff` 改为根据 `activeMarkerId` 条件设置。

将：

```ts
content: `<div style="background:#1677ff;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">${String(i + 1)}</div>`,
```

改为：

```ts
content: `<div style="background:${rm.locationId === activeMarkerId ? getAdmColor('--adm-color-warning', '#ffc107') : '#1677ff'};color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">${String(i + 1)}</div>`,
```

> `getAdmColor` 已在文件顶部从 `../services/marker-style` 导入，无需新增 import。

- [ ] **Step 3: 将 activeMarkerId 加入 effect 依赖数组**

在该 effect 的依赖数组末尾添加 `activeMarkerId`：

```ts
}, [routeMode, routeMarkers, polylines, mapReady, onRouteMarkerClick, fitViewOnUpdate, activeMarkerId]);
```

- [ ] **Step 4: 验证类型检查**

```bash
npx tsc --noEmit 2>&1 | head -20
```

预期：无新增错误。

- [ ] **Step 5: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "feat: add activeMarkerId prop to TripMap for route marker highlight"
```

---

### Task 4: RouteMapPopup 增加按钮 + 位置列表面板

**Files:**
- Modify: `app/travel/components/route-map-popup.tsx`

- [ ] **Step 1: 添加新状态和 ref**

在现有 `useState` 导入增加 `useRef`：

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

在类型导入中增加 `RouteEntry`：

```ts
import type { Route, RouteMarker, Location, Moment, RouteEntry } from '../types';
```

在现有状态声明之后（`editMoment` 之后）添加新状态和 ref：

```ts
/** TripMap 引用，用于 setCenter */
const mapRef = useRef<{ setCenter: (pos: [number, number]) => void }>(null);

/** 位置列表面板是否打开 */
const [showEntryList, setShowEntryList] = useState(false);

/** 当前高亮的标注 locationId */
const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
```

- [ ] **Step 2: 添加 deletedIds 和 groupedEntries 计算**

在 `markers` 的 `useMemo` 之后添加：

```ts
/** 已删除位置的 locationId 集合（用于过滤位置列表） */
const deletedIds = useMemo(
  () => new Set(locations.filter((l) => l.deleted).map((l) => l.id)),
  [locations],
);

/** 按日期分组的瞬间条目（过滤已删除位置） */
const groupedEntries = useMemo(() => {
  const entries = route?.entries ?? [];
  const active = entries.filter((e) => !deletedIds.has(e.locationId));
  const groups = new Map<string, RouteEntry[]>();
  for (const e of active) {
    const list = groups.get(e.date);
    if (list) list.push(e);
    else groups.set(e.date, [e]);
  }
  return groups;
}, [route?.entries, deletedIds]);
```

- [ ] **Step 3: 添加条目点击处理函数**

在 `handleRouteMarkerClick` 之后添加：

```ts
/** 位置列表条目点击 → 关闭面板 → 移动地图 → 打开详情 */
const handleEntryClick = useCallback(
  (entry: RouteEntry) => {
    setShowEntryList(false);
    setActiveLocationId(entry.locationId);
    mapRef.current?.setCenter([entry.longitude, entry.latitude]);
    const loc = locations.find((l) => l.id === entry.locationId);
    if (loc) setViewLocation(loc);
  },
  [locations],
);
```

- [ ] **Step 4: 在 TripMap 上添加 ref 和 activeMarkerId prop**

将：

```tsx
<TripMap
  locations={[]}
  onMarkerClick={() => {}}
  routeMode
  fitViewOnUpdate={visible}
  routeMarkers={route.markers}
```

改为：

```tsx
<TripMap
  ref={mapRef}
  locations={[]}
  onMarkerClick={() => {}}
  routeMode
  fitViewOnUpdate={visible}
  routeMarkers={route.markers}
  activeMarkerId={activeLocationId ?? undefined}
```

- [ ] **Step 5: 在 NavBar 添加"列表"按钮**

在 NavBar 上添加 `right` prop。将：

```tsx
<NavBar
  onBack={onClose}
  back="关闭"
>
  {route.startName} → {route.endName}
</NavBar>
```

改为：

```tsx
<NavBar
  onBack={onClose}
  back="关闭"
  right={
    route.entries.length > 0 ? (
      <span
        className="text-[var(--adm-color-primary)] cursor-pointer text-sm"
        onClick={() => { setShowEntryList(true); }}
      >
        列表
      </span>
    ) : null
  }
>
  {route.startName} → {route.endName}
</NavBar>
```

- [ ] **Step 6: 添加位置列表面板 Popup**

在第一个 `</Popup>` 关闭标签之后（约 130 行）、`<LocationViewPopup` 之前插入：

```tsx
{/* 位置列表面板 */}
<Popup
  visible={showEntryList}
  onClose={() => { setShowEntryList(false); }}
  position="right"
  bodyStyle={{ width: '60vw' }}
>
  <NavBar
    onBack={() => { setShowEntryList(false); }}
    back="关闭"
  >
    位置列表
  </NavBar>
  <div className="overflow-y-auto" style={{ height: 'calc(100% - 45px)' }}>
    {groupedEntries.size === 0 ? (
      <div className="flex h-full items-center justify-center text-[var(--adm-color-weak)]">
        暂无位置
      </div>
    ) : (
      Array.from(groupedEntries.entries()).map(([date, entries]) => (
        <div key={date}>
          {/* 日期分组标题 */}
          <div className="sticky top-0 bg-[var(--adm-color-box)] px-4 py-2 text-xs text-[var(--adm-color-weak)]">
            {date}
          </div>
          {/* 当日条目 */}
          {entries.map((entry, i) => (
            <div
              key={`${entry.locationId}-${i}`}
              className="flex items-center gap-2 border-b border-[var(--adm-color-border)] px-4 py-3 active:bg-[var(--adm-color-fill)] cursor-pointer"
              onClick={() => { handleEntryClick(entry); }}
            >
              <span className="text-[var(--adm-color-warning)] text-xs">
                📍
              </span>
              <span className="text-sm text-[var(--adm-color-text)]">
                {entry.name}
              </span>
            </div>
          ))}
        </div>
      ))
    )}
  </div>
</Popup>
```

- [ ] **Step 7: 关闭 LocationViewPopup 时清除高亮**

将 LocationViewPopup 的 `onClose` 从：

```tsx
onClose={() => { setViewLocation(null); }}
```

改为：

```tsx
onClose={() => { setViewLocation(null); setActiveLocationId(null); }}
```

- [ ] **Step 8: 运行格式化和检查**

```bash
npm run format
npm run check
```

修复所有报错。

- [ ] **Step 9: 验证类型检查和 lint**

```bash
npx tsc --noEmit 2>&1 | head -20
```

预期：无新增类型错误。

- [ ] **Step 10: 提交**

```bash
git add app/travel/components/route-map-popup.tsx
git commit -m "feat: add entry list panel and marker highlight to RouteMapPopup"
```

---

### Task 5: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 在浏览器中验证**

打开 http://localhost:3000，进入旅行路线页面，打开一条路线的地图弹层：

1. 确认右上角出现"列表"按钮
2. 点击"列表"：右侧滑入 60vw 面板，显示按日期分组的瞬间条目
3. 点击某个条目：面板关闭 → 地图移动到该位置 → 该位置标注变黄色 → 打开位置详情弹层
4. 关闭详情弹层：标注黄色恢复为蓝色
5. 通过地图标注点击打开详情时，标注也应为黄色高亮
6. 关闭面板（点击返回按钮）：面板关闭，地图和详情不变

- [ ] **Step 3: 提交最终验证**

```bash
git log --oneline -5
```

确认所有 commit 正确。
