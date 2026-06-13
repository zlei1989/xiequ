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
function distance(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  return Math.sqrt(dx * dx + dy * dy);
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
      const lastOfDay = dayEntries[dayEntries.length - 1];
      if (lastOfDay) prev = lastOfDay;
    } else {
      // 按到 prev 的距离排序
      const prevRef = prev;
      const sorted = [...dayEntries].sort(
        (a, b) => distance(prevRef, a) - distance(prevRef, b),
      );
      result.push(...sorted);
      const lastOfSorted = sorted[sorted.length - 1];
      if (lastOfSorted) prev = lastOfSorted;
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
    const existing = seen.get(e.locationId);
    if (existing) {
      existing.momentCount++;
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

  return order
    .map((id) => seen.get(id))
    .filter((m): m is RouteMarker => m !== undefined);
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
  const visited = new Array<boolean>(coords.length).fill(false);
  const result: [number, number][] = [];

  let current = 0;
  visited[current] = true;
  const firstCoord = coords[current];
  if (firstCoord) result.push([...firstCoord]);

  while (result.length < coords.length) {
    let nearest = -1;
    let minDist = Infinity;

    for (let i = 0; i < coords.length; i++) {
      if (visited[i]) continue;
      const ci = coords[i];
      const cc = coords[current];
      if (!ci || !cc) continue;
      const dx = ci[0] - cc[0];
      const dy = ci[1] - cc[1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }

    current = nearest;
    visited[current] = true;
    const nextCoord = coords[current];
    if (nextCoord) result.push([...nextCoord]);
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

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startDate = first?.date ?? '';
    const endDate = last?.date ?? '';

    const firstMarker = markers[0];
    const lastMarker = markers[markers.length - 1];

    return {
      id: `route-${startDate}`,
      markers,
      polyline,
      startDate,
      endDate,
      days: calcDays(startDate, endDate),
      startName: firstMarker?.name ?? '',
      endName: lastMarker?.name ?? '',
    };
  });
}
