import { describe, expect, it } from 'vitest';

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
    markers: [
      makeMarker({ name: '故宫' }),
      makeMarker({ locationId: 'L2', name: '长城' }),
    ],
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
  makeRoute({
    id: 'r1',
    markers: [
      makeMarker({ locationId: 'L1', name: '故宫' }),
      makeMarker({ locationId: 'L2', name: '长城' }),
    ],
  }),
  makeRoute({
    id: 'r2',
    markers: [makeMarker({ locationId: 'L3', name: '西湖' })],
  }),
  makeRoute({
    id: 'r3',
    markers: [makeMarker({ locationId: 'L4', name: '北京故宫' })],
  }),
];

describe('filterRoutes', () => {
  it('returns all routes when keyword is empty string', () => {
    expect(filterRoutes(routes, '')).toEqual(routes);
  });

  it('returns all routes when keyword is only whitespace', () => {
    expect(filterRoutes(routes, '   ')).toEqual(routes);
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
      makeRoute({
        id: 'rx',
        markers: [makeMarker({ locationId: 'LX', name: 'Gugong' })],
      }),
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
