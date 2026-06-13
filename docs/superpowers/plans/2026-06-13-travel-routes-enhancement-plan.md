# 路线增强 + 驾车路线接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 路线列表增加位置数、直线连线替换为高德驾车路线、过滤 ≤2 天的短路线。

**Architecture:** buildRoutes 纯函数移除 polyline 计算、增加过滤逻辑；新建 useDrivingRoute Hook 封装 AMap.Driving 异步调用与分段串行请求；RouteMapPopup 集成 Hook 处理加载/错误状态。

**Tech Stack:** React (Next.js App Router), antd-mobile, 高德地图 JSAPI 2.0 AMap.Driving, vitest

**Spec:** `docs/superpowers/specs/2026-06-13-travel-routes-enhancement-design.md`

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `app/travel/types.ts` | `Route` 新增 `locationCount` 字段 | 修改 |
| `app/travel/lib/build-routes.ts` | 移除 `buildPolyline`；polyline=`[]`；过滤 `days <= 2`；新增 `locationCount` | 修改 |
| `__tests__/travel/build-routes.test.ts` | 移除 polyline 测试；新增 days<=2 过滤 + locationCount 测试 | 修改 |
| `app/travel/components/route-list-item.tsx` | 描述增加位置数 | 修改 |
| `app/travel/services/amap.ts` | `loadAmap` plugins 增加 `AMap.Driving` | 修改 |
| `app/travel/hooks/use-driving-route.ts` | Hook：封装 AMap.Driving 分段 + 串行请求 + 错误处理 | 新建 |
| `app/travel/components/route-map-popup.tsx` | 集成 `useDrivingRoute`，加载态 Spin + 失败 Toast | 修改 |

---

### Task 1: Route 类型增加 locationCount

**Files:**
- Modify: `app/travel/types.ts`

- [ ] **Step 1: 在 Route 类型的 days 字段后添加 locationCount**

在 `app/travel/types.ts` 中，找到 Route 类型的 `days` 字段（约第 65 行），在其后添加：

```ts
  /** 路线中去重后的位置数量 */
  locationCount: number;
```

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 有 build-routes.ts 报错（缺少 locationCount 字段），其余无新增错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/types.ts
git commit -m "feat(travel): add locationCount field to Route type"
```

---

### Task 2: buildRoutes 重构 + 测试更新

**Files:**
- Modify: `app/travel/lib/build-routes.ts`
- Modify: `__tests__/travel/build-routes.test.ts`

- [ ] **Step 1: 更新测试文件**

将 `__tests__/travel/build-routes.test.ts` 完整替换为以下内容：

```ts
import { describe, it, expect } from 'vitest';

import { buildRoutes } from '@/app/travel/lib/build-routes';
import type { Location } from '@/app/travel/types';

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

  it('returns empty array when location moments is undefined', () => {
    const loc: Location = {
      id: '1',
      name: '故宫',
      address: '北京市东城区',
      longitude: 116.4,
      latitude: 39.9,
      checked: true,
      comments: '',
      deleted: false,
      createdTime: '2026-01-01',
    };
    expect(buildRoutes([loc])).toEqual([]);
  });

  it('returns empty array when all locations are deleted', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', deleted: true, moments: mm('2024-01-01') }),
    ];
    expect(buildRoutes(locs)).toEqual([]);
  });

  it('single location with single moment → filtered because days=1 <= 2', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
    ];
    const routes = buildRoutes(locs);
    // days=1 <= 2，被过滤
    expect(routes).toHaveLength(0);
  });

  it('days > 2 route is kept, locationCount matches markers length', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-04') }),
    ];
    const routes = buildRoutes(locs);
    // Jan 1 → Jan 4: days=4 > 2，保留
    expect(routes).toHaveLength(1);
    const r = routes[0]!;
    expect(r.days).toBe(4);
    expect(r.locationCount).toBe(3);
    expect(r.markers).toHaveLength(3);
  });

  it('gap splits routes, short ones (< =2) filtered', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-04') }),
    ];
    const routes = buildRoutes(locs);
    // Jan 1→Jan 4 差 3 天 → 两条路线各 1 天 → 都被过滤
    expect(routes).toHaveLength(0);
  });

  it('gap splits, long route kept, short filtered', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '南京', longitude: 118.8, latitude: 32.1, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
      // gap >= 2 here
      makeLocation({ id: '4', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-05') }),
      makeLocation({ id: '5', name: '苏州', longitude: 120.6, latitude: 31.3, moments: mm('2024-01-06') }),
    ];
    const routes = buildRoutes(locs);
    // Route 1: Jan 1→3, days=3 > 2 ✅
    // Route 2: Jan 5→6, days=2 <= 2 ❌
    expect(routes).toHaveLength(1);
    expect(routes[0]!.days).toBe(3);
    expect(routes[0]!.startName).toBe('北京');
    expect(routes[0]!.endName).toBe('上海');
  });

  it('polyline is always empty array', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '南京', longitude: 118.8, latitude: 32.1, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    // days=3, locationCount=3
    expect(routes).toHaveLength(1);
    expect(routes[0]!.polyline).toEqual([]);
    expect(routes[0]!.locationCount).toBe(3);
  });

  it('route id is derived from startDate', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-06-15') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-06-16') }),
      makeLocation({ id: '3', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-06-17') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.id).toBe('route-2024-06-15');
  });

  it('same-day markers sorted by nearest to previous day marker', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '颐和园', longitude: 116.3, latitude: 40.0, moments: mm('2024-01-02') }),
      // need days > 2: add another day
      makeLocation({ id: '4', name: '外滩', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    // days=3 > 2, kept
    expect(routes).toHaveLength(1);
    const markers = routes[0]!.markers;
    expect(markers[0]!.name).toBe('故宫');
    // 颐和园 is nearer to 故宫 than 西湖 is
    expect(markers[1]!.name).toBe('颐和园');
    expect(markers[2]!.name).toBe('西湖');
    expect(markers[3]!.name).toBe('外滩');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/travel/build-routes.test.ts 2>&1
```
Expected: 多个测试 FAIL（locationCount 未定义，days 过滤未实现）。

- [ ] **Step 3: 修改 buildRoutes 实现**

移除 `buildPolyline` 函数（第 177-214 行全部删除），并将 `buildRoutes` 函数修改为：

```ts
/**
 * 从位置列表构建路线
 *
 * 纯函数，不依赖任何外部状态。按以下步骤：
 * 1. 提取所有精彩瞬间条目
 * 2. 按日期升序排列
 * 3. 按 ≥ 2 天间隔分组
 * 4. 每组内：时间优先排序 + 同日按最近邻排序
 * 5. 每组内：地点去重，构建 RouteMarker
 * 6. 过滤 days <= 2 的路线
 */
export function buildRoutes(locations: Location[]): Route[] {
  const entries = extractMoments(locations);
  if (entries.length === 0) return [];

  // 按日期升序排列
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const groups = groupByDateGap(entries);

  return groups
    .map((group) => {
      const sorted = sortGroupEntries(group);
      const markers = buildMarkers(sorted);

      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const startDate = first?.date ?? '';
      const endDate = last?.date ?? '';

      const firstMarker = markers[0];
      const lastMarker = markers[markers.length - 1];

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
      };
    })
    .filter((route) => route.days > 2);
}
```

同时删除不再使用的 `distance` 函数（第 41-49 行）和 `buildPolyline` 函数（第 171-214 行）。

- [ ] **Step 4: 运行测试确认全部通过**

```bash
npx vitest run __tests__/travel/build-routes.test.ts 2>&1
```
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add app/travel/lib/build-routes.ts __tests__/travel/build-routes.test.ts
git commit -m "feat(travel): remove polyline calc, filter short routes, add locationCount"
```

---

### Task 3: RouteListItem 增加位置数

**Files:**
- Modify: `app/travel/components/route-list-item.tsx`

- [ ] **Step 1: 修改 description 文案**

将 `app/travel/components/route-list-item.tsx` 第 29 行的 `description` 从：

```tsx
description={`${String(route.days)}天 · ${route.startDate} 至 ${route.endDate}`}
```

改为：

```tsx
description={`${String(route.days)}天 · ${String(route.locationCount)}个位置 · ${route.startDate} 至 ${route.endDate}`}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/route-list-item.tsx
git commit -m "feat(travel): add location count to route list item description"
```

---

### Task 4: loadAmap 增加 Driving 插件

**Files:**
- Modify: `app/travel/services/amap.ts`

- [ ] **Step 1: 在 plugins 数组添加 AMap.Driving**

在 `app/travel/services/amap.ts` 的 `loadAmap` 函数中（约第 54 行），将 plugins 数组从：

```ts
plugins: [
  'AMap.PlaceSearch',
  'AMap.DistrictSearch',
  'AMap.Geolocation',
  'AMap.Geocoder',
],
```

改为：

```ts
plugins: [
  'AMap.PlaceSearch',
  'AMap.DistrictSearch',
  'AMap.Geolocation',
  'AMap.Geocoder',
  'AMap.Driving',
],
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/services/amap.ts
git commit -m "feat(travel): add AMap.Driving plugin to loadAmap"
```

---

### Task 5: 实现 useDrivingRoute Hook

**Files:**
- Create: `app/travel/hooks/use-driving-route.ts`

- [ ] **Step 1: 创建 useDrivingRoute Hook**

```ts
/**
 * 驾车路线数据 Hook
 *
 * 根据路线标注点（时间顺序），调用高德 AMap.Driving API 获取真实驾车路线。
 * 途经点超过 16 个时自动分段，串行请求后拼接 path。
 *
 * 注意：仅在 active=true 时触发请求（弹层打开时），避免无效调用。
 */

'use client';

import { useState, useEffect, useRef } from 'react';

import { loadAmap } from '../services/amap';

import type { RouteMarker } from '../types';

/** 单段最多 18 个点（起点 + 16 途经点 + 终点） */
const MAX_POINTS_PER_SEGMENT = 18;

interface DrivingRouteResult {
  path: [number, number][];
  loading: boolean;
  error: string | null;
}

/** 将标注列表按 MAX_POINTS_PER_SEGMENT 分段 */
function buildSegments(markers: RouteMarker[]): RouteMarker[][] {
  if (markers.length <= MAX_POINTS_PER_SEGMENT) return [markers];

  const segments: RouteMarker[][] = [];
  let start = 0;

  while (start < markers.length - 1) {
    const end = Math.min(start + MAX_POINTS_PER_SEGMENT - 1, markers.length - 1);
    segments.push(markers.slice(start, end + 1));
    // 当前段终点作为下一段起点（重叠，保证路线连续）
    start = end;
  }

  return segments;
}

/** 单段驾车路线请求，返回路径坐标数组 */
function fetchSegmentPath(
  segment: RouteMarker[],
): Promise<[number, number][]> {
  return new Promise((resolve, reject) => {
    const AMap = window.AMap;
    if (!AMap) {
      reject(new Error('AMap 未加载'));
      return;
    }

    const driving = new AMap.Driving({ policy: 0 });

    const first = segment[0]!;
    const last = segment[segment.length - 1]!;
    // 途经点：去掉首尾的中间点
    const waypoints: [number, number][] = segment
      .slice(1, -1)
      .map((m) => [m.longitude, m.latitude]);

    driving.search(
      [first.longitude, first.latitude],
      [last.longitude, last.latitude],
      { waypoints: waypoints.length > 0 ? waypoints : undefined },
      (status: string, result: { routes?: Array<{ steps?: Array<{ path?: Array<{ lng: number; lat: number }> }> }> }) => {
        if (status === 'complete' && result.routes && result.routes.length > 0) {
          const steps = result.routes[0].steps;
          if (!steps) {
            resolve([]);
            return;
          }
          // 提取所有 step 的 path 并拼接
          const path: [number, number][] = [];
          for (const step of steps) {
            if (step.path) {
              for (const p of step.path) {
                path.push([p.lng, p.lat]);
              }
            }
          }
          resolve(path);
        } else {
          reject(new Error(status === 'no_data' ? '无路线数据' : `驾车路线查询失败: ${status}`));
        }
      },
    );
  });
}

/**
 * 驾车路线 Hook
 *
 * 用法：const { path, loading, error } = useDrivingRoute(markers, active);
 *
 * @param markers - 路线标注点（时间顺序）
 * @param active - 是否激活请求（弹层打开时为 true）
 */
export function useDrivingRoute(
  markers: RouteMarker[],
  active: boolean,
): DrivingRouteResult {
  const [path, setPath] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevKeyRef = useRef<string>('');

  useEffect(() => {
    // 生成标记键用于判断 markers 是否变化
    const key = markers.map((m) => `${m.locationId}`).join(',');
    // 悬空时清空
    if (!active) {
      setPath([]);
      setLoading(false);
      setError(null);
      return;
    }

    // 标记不足 2 个时无需请求
    if (markers.length < 2) {
      setPath([]);
      setLoading(false);
      setError(null);
      return;
    }

    // 标记未变化且已有结果时跳过
    if (key === prevKeyRef.current && path.length > 0) return;

    prevKeyRef.current = key;
    let aborted = false;

    async function fetchRoute() {
      setLoading(true);
      setError(null);
      try {
        await loadAmap();

        if (aborted) return;

        const segments = buildSegments(markers);
        const allPaths: [number, number][] = [];

        // 串行请求各段
        for (const seg of segments) {
          if (aborted) return;
          const segPath = await fetchSegmentPath(seg);
          allPaths.push(...segPath);
        }

        if (!aborted) {
          setPath(allPaths);
        }
      } catch (err: unknown) {
        if (!aborted) {
          const message = err instanceof Error ? err.message : '路线加载失败';
          console.error('[Travel] 驾车路线获取失败:', message);
          setError(message);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    void fetchRoute();

    return () => {
      aborted = true;
    };
  }, [markers, active, path.length]);

  return { path, loading, error };
}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```
Expected: 无新增类型错误。如有 `window.AMap` 类型问题，使用 `// @ts-expect-error Driving API 类型未声明` 或简化类型断言。

- [ ] **Step 3: 提交**

```bash
git add app/travel/hooks/use-driving-route.ts
git commit -m "feat(travel): add useDrivingRoute hook for AMap driving API"
```

---

### Task 6: RouteMapPopup 集成 useDrivingRoute

**Files:**
- Modify: `app/travel/components/route-map-popup.tsx`

- [ ] **Step 1: 在 RouteMapPopup 中集成 useDrivingRoute**

在 `app/travel/components/route-map-popup.tsx` 中：

**添加 import**（在现有 imports 之后）：

```tsx
import { useDrivingRoute } from '../hooks/use-driving-route';
import { DotLoading, Toast } from 'antd-mobile';
import { useEffect } from 'react';
```

**在组件内添加 Hook 调用**（在 `useMoments` 调用之后）：

```tsx
const {
  path: drivingPath,
  loading: drivingLoading,
  error: drivingError,
} = useDrivingRoute(route?.markers ?? [], visible);
```

**错误 Toast**（在 Hook 调用之后添加）：

```tsx
useEffect(() => {
  if (drivingError) {
    Toast.show({ icon: 'fail', content: '路线加载失败' });
  }
}, [drivingError]);
```

**修改 TripMap 的 polylines prop**，将原来的：

```tsx
polylines={
  route.polyline.length > 0
    ? [{ path: route.polyline, color: '#1677ff' }]
    : []
}
```

改为：

```tsx
polylines={
  drivingPath.length > 0
    ? [{ path: drivingPath, color: '#1677ff' }]
    : []
}
```

**在 TripMap 上方条件渲染加载指示器**（在 `<div className="h-[calc(80vh-45px)]">` 内部、TripMap 之前添加）：

```tsx
{drivingLoading && (
  <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/80 px-4 py-2 shadow">
    <DotLoading /> 加载路线...
  </div>
)}
```

- [ ] **Step 2: 验证类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/route-map-popup.tsx
git commit -m "feat(travel): integrate useDrivingRoute into RouteMapPopup"
```

---

### Task 7: 格式化、检查、验证

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

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: format and check after routes enhancement" || echo "no changes"
```

---

## 实施顺序

```
Task 1 (types.ts)
  → Task 2 (buildRoutes + 测试)
    → Task 3 (RouteListItem)  ─┐
    → Task 4 (amap.ts Driving) │ 可并行
                                ├→ Task 5 (useDrivingRoute)
                                    → Task 6 (RouteMapPopup 集成)
                                        → Task 7 (Format/Check)
```

Task 3 和 Task 4 可并行执行（无依赖关系）。Task 5 依赖 Task 4。Task 6 依赖 Task 5。
