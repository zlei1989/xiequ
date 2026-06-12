/**
 * 旅行位置数据 Hook + Context
 *
 * useLocations 提供位置的增删改查 + 过滤 + 统计。
 * TravelContext 在 layout 层注入，子组件通过 useTravelContext 消费。
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

import { fetchLocations, createLocation, editLocation, removeLocation } from '../actions';

import type { Location, Summary } from '../types';

/** 新增位置时提交的表单数据 */
type AddLocationInput = {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  comments?: string;
};

/** 注入到 TravelContext 的数据类型 */
export type TravelData = {
  locations: Location[];
  sortedLocations: Location[];
  summary: Summary;
  loading: boolean;
  add: (data: AddLocationInput) => Promise<Location>;
  update: (id: string, data: Partial<Location>) => Promise<Location>;
  remove: (id: string) => Promise<void>;
  load: () => Promise<void>;
};

export const TravelContext = createContext<TravelData | null>(null);

/** 从 Context 获取旅行数据（必须在 TravelContext.Provider 内使用） */
export function useTravelContext() {
  const ctx = useContext(TravelContext);
  if (!ctx) throw new Error('useTravelContext must be used within TravelContext.Provider');
  return ctx;
}

/**
 * 位置数据管理 Hook
 *
 * 管理位置列表的全量数据、加载状态、CRUD 操作及过滤统计。
 * 采用乐观更新策略：add/update 成功后直接更新本地状态，remove 使用软删除（标记 deleted: true）。
 * 过滤逻辑基于未删除项，按 filter 参数筛出已勾选/未勾选/全部。
 */
export function useLocations(filter?: 'all' | 'checked' | 'uncheck') {
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  /** 加载全量位置数据，更新本地状态 */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (process.env.NODE_ENV !== 'production') console.debug('[Travel] 加载位置列表...');
      const t0 = Date.now();
      const data = await fetchLocations();
      const elapsed = Date.now() - t0;
      if (elapsed > 500) console.info(`[Travel] 加载位置列表耗时 ${String(elapsed)}ms`);
      setAllLocations(data);
    } catch (err) {
      /** ERROR: 加载位置数据失败，打印上下文帮助排查（COS 连接、权限等） */
      console.error('[Travel] 加载位置失败:', err);
      if (err instanceof Error && err.stack) console.error(err.stack);
    } finally {
      setLoading(false);
    }
  }, []);

  // 组件挂载时加载初始数据（标准数据获取模式）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** 新增位置：调用 Server Action 后追加到本地列表（乐观更新） */
  const add = useCallback(async (data: AddLocationInput) => {
    console.info('[Travel] 新增位置:', data.name);
    if (process.env.NODE_ENV !== 'production') console.debug('[Travel] createLocation 参数:', JSON.stringify(data));
    const t0 = Date.now();
    try {
      const newLoc = await createLocation(data);
      const elapsed = Date.now() - t0;
      if (elapsed > 500) console.info(`[Travel] 新增位置耗时 ${String(elapsed)}ms`);
      setAllLocations((prev) => [...prev, newLoc]);
      return newLoc;
    } catch (err) {
      console.error('[Travel] 新增位置失败:', { name: data.name, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, []);

  /** 编辑位置：调用 Server Action 后替换本地列表中对应项 */
  const update = useCallback(async (id: string, data: Partial<Location>) => {
    console.info('[Travel] 编辑位置:', id);
    if (process.env.NODE_ENV !== 'production') console.debug('[Travel] editLocation 参数:', id, JSON.stringify(data));
    const t0 = Date.now();
    try {
      const updated = await editLocation(id, data);
      const elapsed = Date.now() - t0;
      if (elapsed > 500) console.info(`[Travel] 编辑位置耗时 ${String(elapsed)}ms`);
      setAllLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
      return updated;
    } catch (err) {
      console.error('[Travel] 编辑位置失败:', { id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, []);

  /** 软删除位置：调用 Server Action 后将本地副本标记为 deleted，避免数据丢失 */
  const remove = useCallback(async (id: string) => {
    console.info('[Travel] 删除位置:', id);
    if (process.env.NODE_ENV !== 'production') console.debug('[Travel] removeLocation 参数:', id);
    const t0 = Date.now();
    try {
      await removeLocation(id);
      const elapsed = Date.now() - t0;
      if (elapsed > 500) console.info(`[Travel] 删除位置耗时 ${String(elapsed)}ms`);
      /** 软删除而非从列表移除，保留数据可恢复 */
      setAllLocations((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
    } catch (err) {
      console.error('[Travel] 删除位置失败:', { id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, []);

  /** 过滤后的列表：先剔除已删除项，再按勾选状态筛选 */
  if (process.env.NODE_ENV !== 'production') console.debug(`[Travel] 位置过滤: filter=${String(filter)}, total=${String(allLocations.length)}`);
  const filteredLocations = allLocations
    .filter((loc) => !loc.deleted)
    .filter((loc) => {
      if (filter === 'checked') return loc.checked;       // 仅已勾选
      if (filter === 'uncheck') return !loc.checked;      // 仅未勾选
      return true;                                        // 全部（不含已删除）
    });

  /** 统计基于所有未删除的位置（与 summary 口径一致） */
  const activeLocations = allLocations.filter((l) => !l.deleted);
  const summary: Summary = {
    uncheckCount: activeLocations.filter((l) => !l.checked).length,
    uncheckPercentage: 0,
    checkedCount: activeLocations.filter((l) => l.checked).length,
    checkedPercentage: 0,
    count: activeLocations.length,
  };
  if (summary.count > 0) {
    summary.uncheckPercentage = Math.floor((summary.uncheckCount / summary.count) * 100);
    summary.checkedPercentage = Math.floor((summary.checkedCount / summary.count) * 100);
  }

  return {
    locations: allLocations,
    sortedLocations: filteredLocations,
    summary,
    loading,
    load,
    add,
    update,
    remove,
  };
}
