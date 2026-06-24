/**
 * 精彩瞬间数据管理 Hook
 *
 * 精彩瞬间以嵌套 JSON 对象存储在位置的 moments 字段中。
 * 数据复用 TravelContext 中的 locations（由 layout 层的 useLocations 加载），
 * 无需额外请求接口——直接从 memory 提取目标位置的 moments 并转为数组。
 * 操作完成后通过 context.load() 刷新全量数据以保持与服务端同步。
 */

'use client';

import { useMemo, useCallback } from 'react';

import { createMoment, editMoment, removeMoment } from '../actions';

import { useTravelContext } from './use-locations';

import type { Location, Moment } from '../types';

/** 将 Location.moments Record 转为 Moment 数组，按日期降序排列 */
function extractMoments(
  location: Location | null | undefined,
): Moment[] {
  if (!location?.moments) return [];
  const locationId = location.id;
  const items: Moment[] = Object.entries(location.moments).map(([id, m]) => ({
    id,
    locationId,
    date: m.date,
    text: m.text,
    createdTime: '',
  }));
  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

/**
 * 管理指定位置的精彩瞬间列表
 *
 * 直接从 TravelContext 中复用已加载的位置数据，无需独立 OSS 请求。
 * 位置切换时 moments 同步计算（useMemo），不再有竞态或加载延迟。
 */
export function useMoments(locationId: string) {
  const { locations, load: refreshLocations } = useTravelContext();

  /** 从 context 中查找目标位置，随 locations / locationId 变化自动更新 */
  const location = useMemo(
    () => locationId ? locations.find((l) => l.id === locationId) ?? null : null,
    [locations, locationId],
  );

  /** 从位置对象中提取精彩瞬间列表（同步计算，无异步延迟） */
  const moments = useMemo(
    () => extractMoments(location),
    [location],
  );

  /**
   * 新增精彩瞬间
   *
   * 调用 Server Action 创建后刷新全量数据以同步。
   */
  const add = useCallback(async (data: { date: string; text: string }) => {
    try {
      await createMoment(locationId, data);
      await refreshLocations();
    } catch (err) {
      console.error('[Travel] useMoments.add 失败:', { locationId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, refreshLocations]);

  /**
   * 切换位置打卡状态（收敛地图页和收藏页的共同逻辑）
   *
   * 待去 → 已去：从 Context 中获取最新位置数据，检查是否已存在精彩瞬间；
   * 不存在则自动创建当天日期的空文本记录；已存在则直接切换，不重复创建。
   * 注意：不使用 loc 参数的 moments 字段，因为 loc 可能来自 UI 状态的旧引用，
   * 而 Context 中的 locations 在每次操作后都会刷新，才是最新数据。
   * 已去 → 待去：直接切换，无任何限制。
   * 完成后刷新数据以同步 moments 列表。
   *
   * @param loc - 当前被切换的位置对象
   * @param onUpdate - useLocations 的 update 方法，用于持久化 checked 状态
   */
  const toggleChecked = useCallback(async (
    loc: Location,
    onUpdate: (id: string, data: Partial<Location>) => Promise<Location>,
  ) => {
    try {
      // 待去 → 已去：检查是否需要自动创建精彩瞬间
      if (!loc.checked) {
        // 从 Context 中取最新位置数据判断历史精彩瞬间
        // loc 可能是 UI 状态的旧引用，context 中才是最新数据
        const latest = locations.find((l) => l.id === loc.id);
        const hasMoments = latest?.moments && Object.keys(latest.moments).length > 0;
        if (!hasMoments) {
          // 不存在精彩瞬间，自动创建当天日期的空文本记录
          await createMoment(loc.id, {
            date: new Date().toISOString().slice(0, 10),
            text: '',
          });
        }
      }
      // 切换 checked 状态（useLocations.update → editLocation Server Action）
      await onUpdate(loc.id, { checked: !loc.checked });
      // 刷新全量数据以同步 moments 列表
      await refreshLocations();
    } catch (err) {
      console.error('[Travel] toggleChecked 失败:', { locationId: loc.id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [refreshLocations, locations]);

  /**
   * 编辑精彩瞬间
   *
   * 调用 Server Action 更新后刷新全量数据以同步。
   */
  const update = useCallback(async (id: string, data: { date?: string; text?: string }) => {
    try {
      await editMoment(locationId, id, data);
      await refreshLocations();
    } catch (err) {
      console.error('[Travel] useMoments.update 失败:', { locationId, momentId: id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, refreshLocations]);

  /**
   * 删除精彩瞬间
   *
   * 调用 Server Action 删除后刷新全量数据以同步。
   */
  const remove = useCallback(async (id: string) => {
    try {
      await removeMoment(locationId, id);
      await refreshLocations();
    } catch (err) {
      console.error('[Travel] useMoments.remove 失败:', { locationId, momentId: id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, refreshLocations]);

  return { moments, add, update, remove, toggleChecked };
}
