/**
 * 路线构建器 — 纯函数
 *
 * 从位置列表中提取所有精彩瞬间，按时间分组为旅行路线，
 * 计算每组内的标注排序（时间优先、同日按最近邻）。
 * 过滤掉持续天数 ≤ 2 的短路线，polyline 固定为空数组。
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
  const first = entries[0];
  if (!first) return groups;
  let current: MomentEntry[] = [first];

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    if (!prev || !curr) continue;
    const diff = dateDiff(prev.date, curr.date);
    if (diff >= 2) {
      groups.push(current);
      current = [curr];
    } else {
      current.push(curr);
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
      // 按到 prev 的欧几里得距离排序
      const prevRef = prev;
      const sorted = [...dayEntries].sort((a, b) => {
        const da = Math.hypot(a.longitude - prevRef.longitude, a.latitude - prevRef.latitude);
        const db = Math.hypot(b.longitude - prevRef.longitude, b.latitude - prevRef.latitude);
        return da - db;
      });
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
        entries: sorted.map((e) => ({
          locationId: e.locationId,
          name: e.locationName,
          longitude: e.longitude,
          latitude: e.latitude,
          date: e.date,
        })),
      };
    })
    .filter((route) => route.days > 2);
}
