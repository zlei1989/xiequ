# 旅行路线页面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增旅行路线页面，将精彩瞬间按时间分组展示为路线列表，点击弹出地图显示标注及最近邻连线。

**Architecture:** 遵循现有分层模式 — 纯函数 `build-routes.ts` 负责算法计算，`useRoutes` Hook 封装数据流，页面组件负责渲染。TripMap 扩展 `routeMode` 支持路线标注和 polyline 连线。

**Tech Stack:** React (Next.js App Router), antd-mobile, 高德地图 JSAPI 2.0, vitest

**Spec:** `docs/superpowers/specs/2026-06-13-travel-routes-design.md`

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `app/travel/types.ts` | 新增 `Route`、`RouteMarker` 类型 | 修改 |
| `app/travel/types/amap.d.ts` | 新增 `AMap.Polyline` 类型声明 | 修改 |
| `app/travel/lib/build-routes.ts` | 纯函数：提取→排序→分组→标记排序→连线 | 新建 |
| `__tests__/travel/build-routes.test.ts` | buildRoutes 单元测试 | 新建 |
| `app/travel/hooks/use-routes.ts` | Hook：从 context 取数据调用 buildRoutes | 新建 |
| `app/travel/components/route-list-item.tsx` | 路线列表项组件 | 新建 |
| `app/travel/components/route-map-popup.tsx` | 路线地图弹层 | 新建 |
| `app/travel/routes/page.tsx` | 路线页面 | 新建 |
| `app/travel/components/trip-map.tsx` | 扩展 routeMode + polylines + routeMarkers | 修改 |
| `app/travel/components/shell.tsx` | TabBar 增加"路线"Tab | 修改 |

---

### Task 1: 新增类型定义

**Files:**
- Modify: `app/travel/types.ts`
- Modify: `app/travel/types/amap.d.ts`

- [ ] **Step 1: 在 types.ts 末尾追加 Route 和 RouteMarker 类型**

```ts
/** 一段旅行路线 */
export type Route = {
  /** 唯一标识，由 startDate 生成（如 "route-2024-01-01"） */
  id: string;
  /** 路线中的标注点（时间顺序排列，去重后的地点） */
  markers: RouteMarker[];
  /** 按最近邻排序后的坐标序列，用作 polyline path */
  polyline: [number, number][];
  /** 开始日期（YYYY-MM-DD） */
  startDate: string;
  /** 结束日期（YYYY-MM-DD） */
  endDate: string;
  /** 持续天数，含头含尾（endDate - startDate + 1） */
  days: number;
  /** 起点地名 */
  startName: string;
  /** 终点地名 */
  endName: string;
};

/** 路线标注点 */
export type RouteMarker = {
  locationId: string;
  name: string;
  longitude: number;
  latitude: number;
  /** 该地点在本段路线中的瞬间条数 */
  momentCount: number;
};
```

- [ ] **Step 2: 在 amap.d.ts 的 AMap namespace 中添加 Polyline 类声明（在 Marker 声明之后插入）**

```ts
/** 折线 */
class Polyline {
  constructor(options: PolylineOptions);
  setPath(path: [number, number][]): void;
  setOptions(options: Partial<PolylineOptions>): void;
}
interface PolylineOptions {
  path: [number, number][];
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  showDir?: boolean;
}
```

- [ ] **Step 3: 在 AMapModule 接口末尾添加 Polyline 构造函数**

```ts
Polyline: new (options: AMap.PolylineOptions) => AMap.Polyline;
```

- [ ] **Step 4: 运行类型检查确认无编译错误**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增类型错误。

- [ ] **Step 5: 提交**

```bash
git add app/travel/types.ts app/travel/types/amap.d.ts
git commit -m "feat(travel): add Route, RouteMarker types and Polyline type declaration"
```

---

### Task 2: 实现 buildRoutes 纯函数（TDD）

**Files:**
- Create: `__tests__/travel/build-routes.test.ts`
- Create: `app/travel/lib/build-routes.ts`

- [ ] **Step 1: 编写测试文件**

```ts
import { describe, it, expect } from 'vitest';

import { buildRoutes } from '@/app/travel/lib/build-routes';
import type { Location } from '@/app/travel/types';

/** 创建带 moments 的测试 Location */
function makeLocation(overrides: Partial<Location> & {
  moments?: Record<string, { date: string; text: string }>;
} = {}): Location {
  return {
    id: '1',
    name: '故宫',
    address: '北京市东城区',
    longitude: 116.4,
    latitude: 39.9,
    checked: true,
    comments: '',
    deleted: false,
    createdTime: '2026-01-01',
    moments: {},
    ...overrides,
  };
}

// 辅助：生成 moments 对象
function mm(date: string, text?: string): Record<string, { date: string; text: string }> {
  const id = `${date}-${Math.random().toString(36).slice(2, 6)}`;
  return { [id]: { date, text: text || '' } };
}

describe('buildRoutes', () => {
  it('returns empty array when locations is empty', () => {
    expect(buildRoutes([])).toEqual([]);
  });

  it('returns empty array when no location has moments', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', moments: {} }),
      makeLocation({ id: '2', name: '长城' }),
    ];
    expect(buildRoutes(locs)).toEqual([]);
  });

  it('returns empty array when all locations are deleted', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', deleted: true, moments: mm('2024-01-01') }),
    ];
    expect(buildRoutes(locs)).toEqual([]);
  });

  it('single location with single moment → 1 route, 1 marker, no polyline', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const route = routes[0]!;
    expect(route.startName).toBe('故宫');
    expect(route.endName).toBe('故宫');
    expect(route.startDate).toBe('2024-01-01');
    expect(route.endDate).toBe('2024-01-01');
    expect(route.days).toBe(1);
    expect(route.markers).toHaveLength(1);
    expect(route.markers[0]!.momentCount).toBe(1);
    expect(route.polyline).toEqual([]);
  });

  it('single location with multiple moments → 1 route, 1 marker (deduplicated), momentCount sums', () => {
    const locs = [
      makeLocation({
        id: '1',
        name: '故宫',
        longitude: 116.4,
        latitude: 39.9,
        moments: { ...mm('2024-01-01', '早'), ...mm('2024-01-02', '晚') },
      }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.markers).toHaveLength(1);
    expect(routes[0]!.markers[0]!.momentCount).toBe(2);
    expect(routes[0]!.polyline).toEqual([]); // single marker
  });

  it('two locations, same day → 1 route with 2 markers and polyline', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '长城', longitude: 116.0, latitude: 40.3, moments: mm('2024-01-01') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.markers).toHaveLength(2);
    // polyline should have 2 coordinates connecting both
    expect(routes[0]!.polyline).toHaveLength(2);
    expect(routes[0]!.days).toBe(1);
  });

  it('gap >= 2 days splits into two routes', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    // Jan 1 to Jan 3 diff = 2 days >= 2 split
    expect(routes).toHaveLength(2);
    expect(routes[0]!.startName).toBe('北京');
    expect(routes[0]!.endName).toBe('北京');
    expect(routes[1]!.startName).toBe('上海');
    expect(routes[1]!.endName).toBe('上海');
  });

  it('gap = 1 day stays in same route', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-02') }),
    ];
    const routes = buildRoutes(locs);
    // Jan 1 to Jan 2 diff = 1 day, same route
    expect(routes).toHaveLength(1);
    expect(routes[0]!.days).toBe(2);
    expect(routes[0]!.startName).toBe('北京');
    expect(routes[0]!.endName).toBe('上海');
  });

  it('days calculation is inclusive (end - start + 1)', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-05') }),
    ];
    const routes = buildRoutes(locs);
    // Jan 1 to Jan 5 diff = 4 days >= 2 → split
    expect(routes).toHaveLength(2);
    expect(routes[0]!.days).toBe(1);
    expect(routes[1]!.days).toBe(1);
  });

  it('polyline uses nearest-neighbor greedy ordering', () => {
    // 故宫 (116.4, 39.9), 长城 (116.0, 40.3), 西湖 (120.2, 30.3)
    // Nearest to 故宫: 长城 (closer) or 西湖 (farther) → 长城 first
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '长城', longitude: 116.0, latitude: 40.3, moments: mm('2024-01-01') }),
      makeLocation({ id: '3', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-01') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const polyline = routes[0]!.polyline;
    expect(polyline).toHaveLength(3);
    // First point is first marker (故宫, index 0 in time order after same-day nearest sort)
    // Nearest neighbor from 故宫 should go to 长城 (both Beijing area), then 西湖
    expect(polyline[0]).toEqual([116.4, 39.9]); // 故宫 (first by time)
    // After 故宫, nearest is 长城
    expect(polyline[1]).toEqual([116.0, 40.3]); // 长城 (nearest to 故宫)
    expect(polyline[2]).toEqual([120.2, 30.3]); // 西湖 (last)
  });

  it('same-day markers sorted by nearest to previous day marker', () => {
    // Day 1: 故宫 (116.4, 39.9)
    // Day 2: 西湖 (120.2, 30.3) and 颐和园 (116.3, 40.0) — 颐和园 is nearer to 故宫
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '颐和园', longitude: 116.3, latitude: 40.0, moments: mm('2024-01-02') }),
    ];
    const routes = buildRoutes(locs);
    const markers = routes[0]!.markers;
    // 故宫 first (by date), then 颐和园 (nearest to 故宫 among day 2), then 西湖
    expect(markers[0]!.name).toBe('故宫');
    expect(markers[1]!.name).toBe('颐和园');
    expect(markers[2]!.name).toBe('西湖');
  });

  it('route id is derived from startDate', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-06-15') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes[0]!.id).toBe('route-2024-06-15');
  });
});
```

- [ ] **Step 2: 运行测试确认全部失败**

```bash
npx vitest run __tests__/travel/build-routes.test.ts 2>&1
```
Expected: 全部失败（文件不存在）。

- [ ] **Step 3: 实现 buildRoutes 纯函数**

```ts
/**
 * 路线构建器 — 纯函数
 *
 * 从位置列表中提取所有精彩瞬间，按时间分组为旅行路线，
 * 计算每组内的标注排序（时间优先、同日按最近邻）和连线路径（最近邻贪心）。
 */

import type { Location, Route, RouteMarker } from '../types';

/** 扁平化条目：一次精彩瞬间 */
interface MomentEntry {
  locationId: string;
  locationName: string;
  longitude: number;
  latitude: number;
  date: string;
}

/**
 * 从位置列表提取所有精彩瞬间条目
 *
 * 跳过已删除的位置和没有 moments 的位置。
 */
function extractMoments(locations: Location[]): MomentEntry[] {
  const entries: MomentEntry[] = [];
  for (const loc of locations) {
    if (loc.deleted || !loc.moments) continue;
    for (const [, moment] of Object.entries(loc.moments)) {
      entries.push({
        locationId: loc.id,
        locationName: loc.name,
        longitude: loc.longitude,
        latitude: loc.latitude,
        date: moment.date,
      });
    }
  }
  return entries;
}

/** 计算两个坐标之间的欧几里得距离 */
function distance(a: { longitude: number; latitude: number }, b: { longitude: number; latitude: number }): number {
  return Math.sqrt((b.longitude - a.longitude) ** 2 + (b.latitude - a.latitude) ** 2);
}

/** 计算两个日期之间的天数差 */
function dateDiff(a: string, b: string): number {
  return Math.floor(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  );
}

/** 计算持续天数（含头含尾） */
function calcDays(start: string, end: string): number {
  return dateDiff(start, end) + 1;
}

/**
 * 按日期间隔将条目分组为路线
 *
 * 相邻条目日期差 ≥ 2 天则切分为新路线。
 * 输入已按日期升序排列。
 */
function groupByDateGap(entries: MomentEntry[]): MomentEntry[][] {
  if (entries.length === 0) return [];

  const groups: MomentEntry[][] = [];
  let current: MomentEntry[] = [entries[0]!];

  for (let i = 1; i < entries.length; i++) {
    const diff = dateDiff(entries[i - 1]!.date, entries[i]!.date);
    if (diff >= 2) {
      groups.push(current);
      current = [entries[i]!];
    } else {
      current.push(entries[i]!);
    }
  }
  groups.push(current);

  return groups;
}

/**
 * 组内排序：时间优先，同日多条按与上一个已确定标注的距离排序
 *
 * 算法：
 * 1. 先按日期升序（输入已保证）
 * 2. 同一日期的条目，按到"上一个已确定条目"的距离升序排列
 * 3. 第一条直接确定为组内第一个标注
 */
function sortGroupEntries(entries: MomentEntry[]): MomentEntry[] {
  if (entries.length <= 1) return entries;

  // 按日期分组（保持插入顺序，即升序）
  const byDate = new Map<string, MomentEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) {
      list.push(e);
    } else {
      byDate.set(e.date, [e]);
    }
  }

  const result: MomentEntry[] = [];
  let prev: MomentEntry | null = null;

  for (const [, dayEntries] of byDate) {
    if (prev === null) {
      // 第一天的条目按原始顺序（已按日期排序）
      result.push(...dayEntries);
      prev = dayEntries[dayEntries.length - 1]!;
    } else {
      // 按到 prev 的距离排序
      const sorted = [...dayEntries].sort(
        (a, b) => distance(prev!, a) - distance(prev!, b),
      );
      result.push(...sorted);
      prev = sorted[sorted.length - 1]!;
    }
  }

  return result;
}

/**
 * 从排序后的组条目构建 RouteMarker 列表（按地点去重）
 *
 * 同一 locationId 的多条瞬间合并为一个 marker，momentCount 累加。
 * 保留第一次出现时的位置顺序。
 */
function buildMarkers(entries: MomentEntry[]): RouteMarker[] {
  const seen = new Map<string, RouteMarker>();
  const order: string[] = [];

  for (const e of entries) {
    if (seen.has(e.locationId)) {
      seen.get(e.locationId)!.momentCount++;
    } else {
      seen.set(e.locationId, {
        locationId: e.locationId,
        name: e.locationName,
        longitude: e.longitude,
        latitude: e.latitude,
        momentCount: 1,
      });
      order.push(e.locationId);
    }
  }

  return order.map((id) => seen.get(id)!);
}

/**
 * 最近邻贪心算法计算连线路径
 *
 * 从第一个标注出发，每次选择未连线中距离最近的下一个标注。
 * 标注 ≤ 1 个时返回空数组。
 */
function buildPolyline(markers: RouteMarker[]): [number, number][] {
  if (markers.length <= 1) return [];

  const coords: [number, number][] = markers.map((m) => [m.longitude, m.latitude]);
  const visited = new Array(coords.length).fill(false);
  const result: [number, number][] = [];

  let current = 0;
  visited[current] = true;
  result.push([...coords[current]!]);

  while (result.length < coords.length) {
    let nearest = -1;
    let minDist = Infinity;

    for (let i = 0; i < coords.length; i++) {
      if (visited[i]) continue;
      const d = Math.sqrt(
        (coords[i]![0] - coords[current]![0]) ** 2 +
        (coords[i]![1] - coords[current]![1]) ** 2,
      );
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }

    current = nearest;
    visited[current] = true;
    result.push([...coords[current]!]);
  }

  return result;
}

/**
 * 从位置列表构建路线
 *
 * 纯函数，不依赖任何外部状态。按以下步骤：
 * 1. 提取所有精彩瞬间条目
 * 2. 按日期升序排列
 * 3. 按 ≥ 2 天间隔分组
 * 4. 每组内：时间优先排序 + 同日按最近邻排序
 * 5. 每组内：地点去重，构建 RouteMarker
 * 6. 每组内：最近邻贪心计算 polyline
 */
export function buildRoutes(locations: Location[]): Route[] {
  const entries = extractMoments(locations);
  if (entries.length === 0) return [];

  // 按日期升序排列
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const groups = groupByDateGap(entries);

  return groups.map((group) => {
    const sorted = sortGroupEntries(group);
    const markers = buildMarkers(sorted);
    const polyline = buildPolyline(markers);

    const startDate = sorted[0]!.date;
    const endDate = sorted[sorted.length - 1]!.date;

    return {
      id: `route-${startDate}`,
      markers,
      polyline,
      startDate,
      endDate,
      days: calcDays(startDate, endDate),
      startName: markers[0]!.name,
      endName: markers[markers.length - 1]!.name,
    };
  });
}
```

- [ ] **Step 4: 运行测试确认全部通过**

```bash
npx vitest run __tests__/travel/build-routes.test.ts 2>&1
```
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add app/travel/lib/build-routes.ts __tests__/travel/build-routes.test.ts
git commit -m "feat(travel): add buildRoutes pure function with tests"
```

---

### Task 3: 实现 useRoutes Hook

**Files:**
- Create: `app/travel/hooks/use-routes.ts`

- [ ] **Step 1: 创建 useRoutes Hook**

```ts
/**
 * 路线数据 Hook
 *
 * 从 TravelContext 获取全量位置数据，调用 buildRoutes 纯函数生成路线列表。
 * 依赖 locations 变化自动重新计算。
 */

'use client';

import { useMemo } from 'react';

import { buildRoutes } from '../lib/build-routes';
import { useTravelContext } from './use-locations';

import type { Route } from '../types';

/** 从上下文位置数据构建路线列表 */
export function useRoutes(): { routes: Route[] } {
  const { locations } = useTravelContext();

  const routes = useMemo(() => buildRoutes(locations), [locations]);

  return { routes };
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增类型错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/hooks/use-routes.ts
git commit -m "feat(travel): add useRoutes hook"
```

---

### Task 4: 实现 RouteListItem 组件

**Files:**
- Create: `app/travel/components/route-list-item.tsx`

- [ ] **Step 1: 创建 RouteListItem 组件**

```tsx
/**
 * 路线列表项
 *
 * 展示路线标题（起点 → 终点）和描述（天数 + 日期范围）。
 * 点击触发 onRouteClick 回调。
 */

'use client';

import { List } from 'antd-mobile';

import type { Route } from '../types';

export function RouteListItem({
  route,
  onClick,
}: {
  route: Route;
  onClick: (route: Route) => void;
}) {
  function handleClick() {
    onClick(route);
  }

  return (
    <List.Item
      clickable
      onClick={handleClick}
      description={`${String(route.days)}天 · ${route.startDate} 至 ${route.endDate}`}
    >
      {route.startName} → {route.endName}
    </List.Item>
  );
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/route-list-item.tsx
git commit -m "feat(travel): add RouteListItem component"
```

---

### Task 5: 扩展 TripMap 支持路线模式

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

- [ ] **Step 1: 添加 RouteMarker 导入和新增 props 接口**

在 `trip-map.tsx` 顶部，修改 import 和 props 接口：

```tsx
// 修改 import，添加 RouteMarker 类型
import type { Location, RouteMarker } from '../types';

// 新增 props 接口（在组件函数参数解构处修改）
// 将原来的 props 解构修改如下：
export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void },
  {
    locations: Location[];
    onMarkerClick: (location: Location) => void;
    className?: string;
    style?: CSSProperties;
    /** 路线模式：禁用聚类，使用路线标注 + 连线 */
    routeMode?: boolean;
    /** 路线连线数据 */
    polylines?: { path: [number, number][]; color?: string }[];
    /** 路线标注数据（routeMode 时使用，替代 locations） */
    routeMarkers?: RouteMarker[];
    /** 路线标注点击回调（routeMode 时使用） */
    onRouteMarkerClick?: (marker: RouteMarker) => void;
  }
>(function TripMap(
  {
    locations,
    onMarkerClick,
    className,
    style,
    routeMode = false,
    polylines,
    routeMarkers,
    onRouteMarkerClick,
  },
  ref,
) {
```

- [ ] **Step 2: 在组件内部添加路线标注管理 ref（在 `engineRef` 之后）**

```tsx
/** 路线模式下的标注和连线引用（用于清理） */
const routeMarkersRef = useRef<AMap.Marker[]>([]);
const polylinesRef = useRef<AMap.Polyline[]>([]);
```

- [ ] **Step 3: 在 mapReady useEffect 的 cleanup 中添加路线标注清理**

将现有 cleanup：

```tsx
return () => {
  aborted = true;
  // 清理标注引擎
  if (engineRef.current) {
    engineRef.current.destroy();
    engineRef.current = null;
  }
  if (mapRef.current) {
    mapRef.current.destroy();
    mapRef.current = null;
  }
  setMapReady(false);
};
```

修改为（在 engineRef 清理之后、mapRef.destroy() 之前插入路线标注清理）：

```tsx
return () => {
  aborted = true;
  // 清理标注引擎
  if (engineRef.current) {
    engineRef.current.destroy();
    engineRef.current = null;
  }
  // 清理路线标注和连线（必须在 map 销毁前）
  if (polylinesRef.current.length > 0 && mapRef.current) {
    for (const p of polylinesRef.current) {
      mapRef.current.remove(p);
    }
    polylinesRef.current = [];
  }
  if (routeMarkersRef.current.length > 0 && mapRef.current) {
    for (const m of routeMarkersRef.current) {
      mapRef.current.remove(m);
    }
    routeMarkersRef.current = [];
  }
  if (mapRef.current) {
    mapRef.current.destroy();
    mapRef.current = null;
  }
  setMapReady(false);
};
```

- [ ] **Step 4: 添加路线标注渲染 useEffect**

在现有的标注重建 useEffect（依赖 `[locations, mapReady, onMarkerClick]`）**之后**，添加：

```tsx
/** 路线标注和连线渲染 effect（仅在 routeMode 时生效） */
useEffect(() => {
  if (!routeMode || !mapReady || !mapRef.current) return;

  const map = mapRef.current;

  // 清理旧标注和连线
  for (const m of routeMarkersRef.current) {
    map.remove(m);
  }
  routeMarkersRef.current = [];
  for (const p of polylinesRef.current) {
    map.remove(p);
  }
  polylinesRef.current = [];

  // 创建路线标注（带编号）
  if (routeMarkers && routeMarkers.length > 0) {
    for (let i = 0; i < routeMarkers.length; i++) {
      const rm = routeMarkers[i]!;
      const marker = new window.AMap!.Marker({
        position: [rm.longitude, rm.latitude],
        title: rm.name,
        label: {
          content: `<div style="background:#1677ff;color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">${String(i + 1)}</div>`,
          offset: new window.AMap!.Pixel(-10, -10),
        },
      });
      marker.on('click', () => {
        onRouteMarkerClick?.(rm);
      });
      map.add(marker);
      routeMarkersRef.current.push(marker);
    }
  }

  // 创建连线
  if (polylines && polylines.length > 0) {
    for (const pl of polylines) {
      const polyline = new window.AMap!.Polyline({
        path: pl.path,
        strokeColor: pl.color || '#1677ff',
        strokeWeight: 3,
        strokeOpacity: 0.7,
        showDir: true,
      });
      map.add(polyline);
      polylinesRef.current.push(polyline);
    }
  }
}, [routeMode, routeMarkers, polylines, mapReady, onRouteMarkerClick]);
```

- [ ] **Step 5: 修改现有标注重建 useEffect 增加 routeMode 守卫**

在现有的标注重建 useEffect 开头添加 `if (routeMode) return;`：

```tsx
/** 标注重建 effect —— 依赖 mapReady + locations */
useEffect(() => {
  if (routeMode || !mapReady || !mapRef.current) return; // ← 添加 routeMode 守卫

  // ... 其余不变
```

- [ ] **Step 6: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 7: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "feat(travel): extend TripMap with routeMode, polylines, routeMarkers support"
```

---

### Task 6: 实现 RouteMapPopup 组件

**Files:**
- Create: `app/travel/components/route-map-popup.tsx`

- [ ] **Step 1: 创建 RouteMapPopup 组件**

```tsx
/**
 * 路线地图弹层
 *
 * 使用 antd-mobile Popup 包裹 TripMap（routeMode），展示路线标注和连线。
 * 标注点击时打开 LocationViewPopup 查看地点详情。
 */

'use client';

import { NavBar, Popup } from 'antd-mobile';
import { useCallback, useState } from 'react';

import { useMoments } from '../hooks/use-moments';
import { useTravelContext } from '../hooks/use-locations';
import { TripMap } from './trip-map';
import { LocationViewPopup } from './location-view-popup';
import { MomentEditPopup } from './moment-edit-popup';
import { LocationEditPopup } from './location-edit-popup';

import type { Route, RouteMarker, Location, Moment } from '../types';

export function RouteMapPopup({
  route,
  visible,
  onClose,
}: {
  route: Route | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { locations, update, remove } = useTravelContext();

  // 位置详情弹层
  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);

  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
  } = useMoments(viewLocation?.id || '');

  /** 路线标注点击 → 查找完整 Location 对象并打开详情 */
  const handleRouteMarkerClick = useCallback(
    (marker: RouteMarker) => {
      const loc = locations.find((l) => l.id === marker.locationId);
      if (loc) setViewLocation(loc);
    },
    [locations],
  );

  /** 切换打卡状态 */
  async function handleToggle(location: Location) {
    await update(location.id, { checked: !location.checked });
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }

  /** 删除位置 */
  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  if (!route) return null;

  return (
    <>
      <Popup
        visible={visible}
        onClose={onClose}
        position="bottom"
        bodyStyle={{ height: '80vh' }}
      >
        <NavBar
          onBack={onClose}
          back="关闭"
        >
          {route.startName} → {route.endName}
        </NavBar>
        <div className="h-[calc(80vh-45px)]">
          <TripMap
            locations={[]}
            onMarkerClick={() => {}}
            routeMode
            routeMarkers={route.markers}
            polylines={
              route.polyline.length > 0
                ? [{ path: route.polyline, color: '#1677ff' }]
                : []
            }
            onRouteMarkerClick={handleRouteMarkerClick}
            className="h-full"
          />
        </div>
      </Popup>

      <LocationViewPopup
        location={viewLocation}
        visible={!!viewLocation && !editMoment && !editLocation}
        onClose={() => { setViewLocation(null); }}
        moments={moments}
        onEdit={(loc) => { setEditLocation(loc); }}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddMoment={() => {
          if (viewLocation) setEditMoment({ locationId: viewLocation.id, moment: null });
        }}
        onEditMoment={(m) => {
          if (viewLocation) setEditMoment({ locationId: viewLocation.id, moment: m });
        }}
        onDeleteMoment={async (m) => { await removeMoment(m.id); }}
      />

      <LocationEditPopup
        location={editLocation}
        visible={!!editLocation}
        onClose={() => { setEditLocation(null); }}
        onSave={update}
      />

      <MomentEditPopup
        moment={editMoment?.moment || null}
        visible={!!editMoment}
        onClose={() => { setEditMoment(null); }}
        onSave={updateMoment}
        onAdd={addMoment}
      />
    </>
  );
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```
Expected: 无新增类型错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/route-map-popup.tsx
git commit -m "feat(travel): add RouteMapPopup component"
```

---

### Task 7: 创建路线页面

**Files:**
- Create: `app/travel/routes/page.tsx`

- [ ] **Step 1: 创建 routes/page.tsx**

```tsx
/**
 * 旅行路线页面
 *
 * 以列表展示所有旅行路线，点击路线弹出地图弹层。
 * 支持下拉刷新重新加载数据。
 */

'use client';

import { PullToRefresh, List, ErrorBlock, DotLoading } from 'antd-mobile';
import { useState } from 'react';

import { RouteListItem } from '../components/route-list-item';
import { RouteMapPopup } from '../components/route-map-popup';
import { useTravelContext } from '../hooks/use-locations';
import { useRoutes } from '../hooks/use-routes';

import type { Route } from '../types';

export default function RoutesPage() {
  const { loading, load, locations } = useTravelContext();
  const { routes } = useRoutes();
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  if (loading && locations.length === 0) {
    return (
      <List>
        <List.Item prefix={<DotLoading />}>加载中</List.Item>
      </List>
    );
  }

  if (routes.length === 0) {
    return (
      <ErrorBlock
        status="empty"
        title="暂无路线"
        description="添加精彩瞬间后将自动生成路线"
      />
    );
  }

  return (
    <>
      <PullToRefresh onRefresh={load}>
        <List>
          {routes.map((route) => (
            <RouteListItem
              key={route.id}
              route={route}
              onClick={setSelectedRoute}
            />
          ))}
        </List>
      </PullToRefresh>

      <RouteMapPopup
        route={selectedRoute}
        visible={!!selectedRoute}
        onClose={() => { setSelectedRoute(null); }}
      />
    </>
  );
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 3: 提交**

```bash
git add app/travel/routes/page.tsx
git commit -m "feat(travel): add routes page with list and map popup"
```

---

### Task 8: 修改 Shell 增加路线 Tab

**Files:**
- Modify: `app/travel/components/shell.tsx`

- [ ] **Step 1: 在 shell.tsx 中添加 TravelOutline 图标导入和第三个 Tab**

修改 import 行（添加 `TravelOutline`）：

```tsx
import { EnvironmentOutline, MoreOutline, StarOutline, AppstoreOutline, TravelOutline } from 'antd-mobile-icons';
```

在 TabBar 的第二个 Tab 之后添加第三个 Tab：

```tsx
<TabBar.Item key="/travel" icon={<EnvironmentOutline />} title="地图" />
<TabBar.Item key="/travel/list" icon={<StarOutline />} title="收藏" />
<TabBar.Item key="/travel/routes" icon={<TravelOutline />} title="路线" />
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/shell.tsx
git commit -m "feat(travel): add 路线 Tab to TabBar"
```

---

### Task 9: 格式化、检查、验证

- [ ] **Step 1: 格式化**

```bash
npm run format 2>&1
```
Expected: 无 lint/format 错误。

- [ ] **Step 2: 类型检查**

```bash
npm run check 2>&1
```
Expected: 通过。

- [ ] **Step 3: 运行全部测试**

```bash
npx vitest run 2>&1
```
Expected: 全部 PASS。

- [ ] **Step 4: 提交（如有 format 自动修复）**

```bash
git add -A
git commit -m "chore: format and check after routes feature" || echo "no changes"
```

---

## 实施顺序

```
Task 1 (类型) → Task 2 (buildRoutes + 测试)
                  → Task 3 (useRoutes hook)
                      → Task 4 (RouteListItem)  ─┐
                      → Task 5 (TripMap 扩展) ──┤ 可并行
                                                  ├→ Task 6 (RouteMapPopup)
                                                  └→ Task 7 (RoutesPage)
                                                      → Task 8 (Shell TabBar)
                                                          → Task 9 (Format/Check)
```

Task 4 和 Task 5 可并行执行（无依赖关系）。Task 6 依赖 Task 4 和 Task 5。
