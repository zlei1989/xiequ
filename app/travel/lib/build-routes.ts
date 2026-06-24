/**
 * 路线构建器 — 纯函数
 *
 * 从位置列表中提取所有精彩瞬间，按时间分组为旅行路线，
 * 计算每组内贪心最近邻链式排序（统一策略，第一天以 DEFAULT_CENTER 为起点）。
 * 过滤掉持续天数 ≤ 2 的短路线，polyline 固定为空数组。
 */

import { DEFAULT_CENTER } from './calc-distance';

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
 * 组内排序：贪心最近邻链式排序
 *
 * 从 startPoint 出发，每一天内依次贪心选择离上一个已确定条目最近的条目。
 * 链式贯穿所有天——每天的最后一个条目会成为下一天的参考点。
 * startPoint 未传入时回退到第一个条目的坐标。
 *
 * @param entries - 待排序的瞬间条目（已按日期升序排列）
 * @param startPoint - 链式起始坐标 [lng, lat]
 * @returns 按最近邻链式排列的条目
 */
function sortGroupEntries(
  entries: MomentEntry[],
  startPoint?: [number, number],
): MomentEntry[] {
  if (entries.length <= 1) return entries;

  // 按日期分组（保持插入顺序即日期升序）
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
  // 起始坐标：传入的 startPoint 或第一个条目的坐标
  // SAFETY: entries.length >= 2 已在 L102 早返回后保证
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const first = entries[0]!;
  let prevCoords: [number, number] = startPoint ?? [first.longitude, first.latitude];

  // Map 保持插入顺序，与 entries 的日期升序一致
  for (const [, dayEntries] of byDate) {
    const remaining = [...dayEntries];

    while (remaining.length > 0) {
      // 贪心选择离上一个已确定坐标最近的条目
      // SAFETY: while (remaining.length > 0) 保证 remaining[0] 存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const firstRemaining = remaining[0]!;

      let nearestIdx = 0;
      let nearestDist = Math.hypot(
        firstRemaining.longitude - prevCoords[0],
        firstRemaining.latitude - prevCoords[1],
      );

      for (let i = 1; i < remaining.length; i++) {
        // SAFETY: i 从 0 到 remaining.length-1，元素必然存在
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const curr = remaining[i]!;

        const dist = Math.hypot(
          curr.longitude - prevCoords[0],
          curr.latitude - prevCoords[1],
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      // SAFETY: nearestIdx 从 0 开始，remaining.length > 0 保证元素存在
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const picked = remaining[nearestIdx]!;

      result.push(picked);
      // 更新参考点，链式延续
      prevCoords = [picked.longitude, picked.latitude];
      remaining.splice(nearestIdx, 1);
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
 * 4. 每组内：贪心最近邻链式排序（第一天以 DEFAULT_CENTER 为起点）
 * 5. 每组内：地点去重，构建 RouteMarker
 * 6. 过滤 days <= 2 的路线
 * 7. 按开始时间降序排列
 */
export function buildRoutes(locations: Location[]): Route[] {
  const entries = extractMoments(locations);
  if (entries.length === 0) return [];

  // 按日期升序排列
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const groups = groupByDateGap(entries);

  return groups
    .map((group) => {
      const sorted = sortGroupEntries(group, DEFAULT_CENTER);
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
    .filter((route) => route.days > 2)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}
