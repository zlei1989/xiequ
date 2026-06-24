import { describe, it, expect } from 'vitest';

import { buildRoutes } from '@/app/travel/lib/build-routes';
import type { Location, Route, RouteMarker } from '@/app/travel/types';

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
    expect(routes).toHaveLength(0);
  });

  it('days > 2 route is kept, locationCount matches markers length', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    expect(r.days).toBe(3);
    expect(r.locationCount).toBe(3);
    expect(r.markers).toHaveLength(3);
  });

  it('gap splits routes, short ones filtered', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-04') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(0);
  });

  it('gap splits, long route kept, short filtered', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '南京', longitude: 118.8, latitude: 32.1, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
      makeLocation({ id: '4', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-05') }),
      makeLocation({ id: '5', name: '苏州', longitude: 120.6, latitude: 31.3, moments: mm('2024-01-06') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    expect(r.days).toBe(3);
    expect(r.startName).toBe('北京');
    expect(r.endName).toBe('上海');
  });

  it('polyline is always empty array', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '南京', longitude: 118.8, latitude: 32.1, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    expect(r.polyline).toEqual([]);
    expect(r.locationCount).toBe(3);
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
  });

  it('route id is derived from startDate', () => {
    const locs = [
      makeLocation({ id: '1', name: '北京', longitude: 116.4, latitude: 39.9, moments: mm('2024-06-15') }),
      makeLocation({ id: '2', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-06-16') }),
      makeLocation({ id: '3', name: '杭州', longitude: 120.2, latitude: 30.3, moments: mm('2024-06-17') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    expect(r.id).toBe('route-2024-06-15');
  });

  it('same-day entries chain-sorted from previous day last entry', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '颐和园', longitude: 116.3, latitude: 40.0, moments: mm('2024-01-02') }),
      makeLocation({ id: '4', name: '外滩', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    const markers = r.markers;
    expect((markers[0] as RouteMarker).name).toBe('故宫');
    expect((markers[1] as RouteMarker).name).toBe('颐和园');
    expect((markers[2] as RouteMarker).name).toBe('西湖');
    expect((markers[3] as RouteMarker).name).toBe('外滩');
    // 同日两个条目的 entries 排序验证（与 markers 排序一致）
    const day2Entries = r.entries.filter((e) => e.date === '2024-01-02');
    expect(day2Entries).toHaveLength(2);
    expect(day2Entries[0]?.name).toBe('颐和园');
    expect(day2Entries[1]?.name).toBe('西湖');
  });

  it('first day multiple locations: nearest to DEFAULT_CENTER becomes first, then chain', () => {
    // 西湖离北京远（约 1130 km），故宫离北京近（约 0 km）
    // DEFAULT_CENTER = [116.397477, 39.908692]（北京）
    // 旧行为：第一天按原始数组顺序 → 西湖在前
    // 新行为：故宫离 DEFAULT_CENTER 最近 → 故宫第一
    const locs = [
      makeLocation({ id: '1', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '3', name: '外滩', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-02') }),
      makeLocation({ id: '4', name: '长城', longitude: 116.0, latitude: 40.4, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    // 故宫离 DEFAULT_CENTER 最近，链式第一；然后西湖（day1 剩余）；外滩（day2）；长城（day3）
    expect(r.markers.map((m) => m.name)).toEqual(['故宫', '西湖', '外滩', '长城']);
  });

  it('first day single location: chain degrades to identity', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '南京', longitude: 118.8, latitude: 32.1, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    // 每天一个景点，链式退化，与原始顺序一致
    expect(r.markers.map((m) => m.name)).toEqual(['故宫', '南京', '上海']);
  });
});
