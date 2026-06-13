/**
 * buildRoutes 纯函数的单元测试
 *
 * 覆盖边界情况、分组逻辑、排序算法和最近邻贪心连线。
 */

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

  it('returns empty array when location moments is undefined', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9 }),
    ];
    // makeLocation 默认 moments 为 {}，这里显式传 undefined
    locs[0]!.moments = undefined;
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
    const route = routes[0];
    expect(route?.startName).toBe('故宫');
    expect(route?.endName).toBe('故宫');
    expect(route?.startDate).toBe('2024-01-01');
    expect(route?.endDate).toBe('2024-01-01');
    expect(route?.days).toBe(1);
    expect(route?.markers).toHaveLength(1);
    expect(route?.markers[0]?.momentCount).toBe(1);
    expect(route?.polyline).toEqual([]);
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
    expect(routes[0]?.markers).toHaveLength(1);
    expect(routes[0]?.markers[0]?.momentCount).toBe(2);
    expect(routes[0]?.polyline).toEqual([]);
  });

  it('two locations, same day → 1 route with 2 markers and polyline', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '长城', longitude: 116.0, latitude: 40.3, moments: mm('2024-01-01') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.markers).toHaveLength(2);
    expect(routes[0]?.polyline).toHaveLength(2);
    expect(routes[0]?.days).toBe(1);
  });

  it('gap >= 2 days splits into two routes', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(2);
    expect(routes[0]?.startName).toBe('北京');
    expect(routes[0]?.endName).toBe('北京');
    expect(routes[1]?.startName).toBe('上海');
    expect(routes[1]?.endName).toBe('上海');
  });

  it('gap = 1 day stays in same route', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-02') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.days).toBe(2);
    expect(routes[0]?.startName).toBe('北京');
    expect(routes[0]?.endName).toBe('上海');
  });

  it('days calculation is inclusive (end - start + 1)', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-05') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(2);
    expect(routes[0]?.days).toBe(1);
    expect(routes[1]?.days).toBe(1);
  });

  it('polyline uses nearest-neighbor greedy ordering', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '长城', longitude: 116.0, latitude: 40.3, moments: mm('2024-01-01') }),
      makeLocation({ id: '3', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-01') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const polyline = routes[0]?.polyline;
    expect(polyline).toHaveLength(3);
    // First point is first marker (故宫, sorted by id/input order for same-day)
    // Nearest neighbor from 故宫: 长城 (both Beijing area), then 西湖
    expect(polyline?.[1]).toEqual([116.0, 40.3]); // 长城 (nearest to 故宫)
    expect(polyline?.[2]).toEqual([120.2, 30.3]); // 西湖 (last)
  });

  it('same-day markers sorted by nearest to previous day marker', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '颐和园', longitude: 116.3, latitude: 40.0, moments: mm('2024-01-02') }),
    ];
    const routes = buildRoutes(locs);
    const markers = routes[0]?.markers;
    expect(markers?.[0]?.name).toBe('故宫');
    // 颐和园 is nearer to 故宫 than 西湖 is
    expect(markers?.[1]?.name).toBe('颐和园');
    expect(markers?.[2]?.name).toBe('西湖');
  });

  it('route id is derived from startDate', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-06-15') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes[0]?.id).toBe('route-2024-06-15');
  });
});
