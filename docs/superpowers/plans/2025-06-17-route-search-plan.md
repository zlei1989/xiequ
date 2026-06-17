# 路线页搜索功能 实施计划

> **For agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实施本计划。步骤使用 `- [ ]` 复选框跟踪进度。

**Goal:** 在路线页添加搜索框，按地点名模糊筛选路线列表。

**Architecture:** 新增纯函数 `filterRoutes` 对标 `filterLocations`，匹配字段改为 `route.markers[].name`。路线页复用收藏页的 sticky SearchBar + useMemo 过滤模式。

**Tech Stack:** TypeScript, React, antd-mobile SearchBar, vitest

---

### Task 1: 编写 `filterRoutes` 测试

**Files:**
- Create: `__tests__/travel/filter-routes.test.ts`

- [ ] **Step 1: 创建测试文件**

```ts
import { describe, it, expect } from 'vitest';

import { filterRoutes } from '@/app/travel/lib/filter-routes';
import type { Route, RouteMarker } from '@/app/travel/types';

function makeMarker(overrides: Partial<RouteMarker> = {}): RouteMarker {
  return {
    locationId: 'L1',
    name: '故宫',
    longitude: 116.4,
    latitude: 39.9,
    momentCount: 1,
    ...overrides,
  };
}

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-2025-01-01',
    markers: [makeMarker({ name: '故宫' }), makeMarker({ locationId: 'L2', name: '长城' })],
    polyline: [],
    startDate: '2025-01-01',
    endDate: '2025-01-03',
    days: 3,
    locationCount: 2,
    startName: '故宫',
    endName: '长城',
    entries: [],
    ...overrides,
  };
}

const routes: Route[] = [
  makeRoute({ id: 'r1', markers: [makeMarker({ locationId: 'L1', name: '故宫' }), makeMarker({ locationId: 'L2', name: '长城' })] }),
  makeRoute({ id: 'r2', markers: [makeMarker({ locationId: 'L3', name: '西湖' })] }),
  makeRoute({ id: 'r3', markers: [makeMarker({ locationId: 'L4', name: '北京故宫' })] }),
];

describe('filterRoutes', () => {
  it('returns all routes when keyword is empty string', () => {
    expect(filterRoutes(routes, '')).toEqual(routes);
  });

  it('returns all routes when keyword is only whitespace', () => {
    expect(filterRoutes(routes, '   ')).toEqual(routes);
  });

  it('matches by marker name (exact)', () => {
    const result = filterRoutes(routes, '故宫');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('r1');
  });

  it('matches by marker name (partial)', () => {
    const result = filterRoutes(routes, '故宫');
    // 'r1' has exact '故宫', 'r3' has '北京故宫' which includes '故宫'
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
  });

  it('matches by marker name with partial substring', () => {
    const result = filterRoutes(routes, '长');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('r1');
  });

  it('is case insensitive', () => {
    const mixedRoutes = [
      makeRoute({ id: 'rx', markers: [makeMarker({ locationId: 'LX', name: 'Gugong' })] }),
    ];
    expect(filterRoutes(mixedRoutes, 'gugong')).toHaveLength(1);
    expect(filterRoutes(mixedRoutes, 'GUGONG')).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    const result = filterRoutes(routes, '不存在的');
    expect(result).toEqual([]);
  });

  it('matches when any marker in route matches (not just first)', () => {
    const result = filterRoutes(routes, '长城');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('r1');
  });

  it('does not match startName or endName', () => {
    // 用 startName 相同的值做关键字，markers 中无该名时应不匹配
    const routeWithStart = makeRoute({
      id: 'rs',
      markers: [makeMarker({ locationId: 'LA', name: '天安门' })],
      startName: '起点站',
      endName: '终点站',
    });
    const result = filterRoutes([routeWithStart], '起点站');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/travel/filter-routes.test.ts
```

预期：失败 — `Cannot find module '@/app/travel/lib/filter-routes'`

- [ ] **Step 3: 提交**

```bash
git add __tests__/travel/filter-routes.test.ts
git commit -m "test: filterRoutes 单元测试（TDD red）"
```

---

### Task 2: 实现 `filterRoutes` 纯函数

**Files:**
- Create: `app/travel/lib/filter-routes.ts`

- [ ] **Step 1: 创建实现文件**

```ts
/**
 * 路线搜索过滤
 *
 * 按关键字在 markers 中每个 marker 的 name 字段模糊匹配（不区分大小写）。
 * 只要路径中任意一个 marker 的名称包含关键字，该路线即匹配。
 * 空关键字返回全量。
 */

import type { Route } from '../types';

/** 按关键字过滤路线列表（匹配 markers 中的地点名） */
export function filterRoutes(
  routes: Route[],
  keyword: string,
): Route[] {
  if (!keyword.trim()) return routes;

  const kw = keyword.toLowerCase();
  return routes.filter((route) => {
    return route.markers.some((m) =>
      m.name.toLowerCase().includes(kw),
    );
  });
}
```

- [ ] **Step 2: 运行测试确认通过**

```bash
npx vitest run __tests__/travel/filter-routes.test.ts
```

预期：全部 PASS

- [ ] **Step 3: 提交**

```bash
git add app/travel/lib/filter-routes.ts
git commit -m "feat: 新增 filterRoutes 路线搜索过滤函数"
```

---

### Task 3: 修改路线页面集成搜索

**Files:**
- Modify: `app/travel/(subpages)/routes/page.tsx`

- [ ] **Step 1: 修改 routes/page.tsx**

**注意：** 有空格不一致问题（文件保持现状）。在此只做必要修改：

**修改后完整文件：**

```tsx
/**
 * 旅行路线页面
 *
 * 以列表展示所有旅行路线，点击路线弹出地图弹层。
 * 支持按地点名搜索过滤、下拉刷新重新加载数据。
 */

'use client';

import { PullToRefresh, List, ErrorBlock, DotLoading, SearchBar } from 'antd-mobile';
import { useState, useMemo } from 'react';

import { RouteListItem } from '../../components/route-list-item';
import { RouteMapPopup } from '../../components/route-map-popup';
import { useTravelContext } from '../../hooks/use-locations';
import { useRoutes } from '../../hooks/use-routes';
import { filterRoutes } from '../../lib/filter-routes';

import type { Route } from '../../types';

export default function RoutesPage() {
  const { loading, load, locations } = useTravelContext();
  const { routes } = useRoutes();
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  // 搜索状态
  const [searchText, setSearchText] = useState('');

  // 对路线列表做搜索过滤
  const filteredRoutes = useMemo(
    () => filterRoutes(routes, searchText),
    [routes, searchText],
  );

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
        description="添加精彩瞬间后将自动生成路线"
        status="empty"
        title="暂无路线"
      />
    );
  }

  return (
    <>
      {/* 搜索框 — 始终固定在顶部 */}
      <div className="sticky top-0 z-10">
        <SearchBar
          placeholder="搜索路线中的地点"
          style={{ '--border-radius': '0px' }}
          value={searchText}
          onChange={setSearchText}
          onClear={() => { setSearchText(''); }}
        />
      </div>

      {searchText.trim() && filteredRoutes.length === 0 ? (
        <ErrorBlock description="" status="empty" title="暂无搜索结果" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {filteredRoutes.map((route) => (
              <RouteListItem
                key={route.id}
                route={route}
                onClick={setSelectedRoute}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      <RouteMapPopup
        route={selectedRoute}
        visible={!!selectedRoute}
        onClose={() => { setSelectedRoute(null); }}
      />
    </>
  );
}
```

- [ ] **Step 2: 运行 Lint 和格式检查**

```bash
npm run format
npm run check
```

预期：无错误

- [ ] **Step 3: 运行全部测试**

```bash
npx vitest run
```

预期：全部 PASS

- [ ] **Step 4: 提交**

```bash
git add app/travel/(subpages)/routes/page.tsx
git commit -m "feat: 路线页增加搜索功能"
```
