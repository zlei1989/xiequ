/**
 * 精彩瞬间数据管理 Hook
 *
 * 精彩瞬间以嵌套 JSON 对象存储在位置的 moments 字段中，
 * 加载时从 fetchLocations 获取全量位置后再提取目标位置的 moments。
 * 操作完成后自动重新加载数据以保持与服务端同步。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

import { fetchLocations } from '../actions';
import { createMoment, editMoment, removeMoment } from '../actions';

import type { Moment } from '../types';

/** 管理指定位置的精彩瞬间列表 */
export function useMoments(locationId: string) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * 加载指定位置的精彩瞬间列表
   *
   * 从全量位置数据中提取目标位置的 moments 嵌套对象，
   * 将其按日期降序排列后写入状态。
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const locations = await fetchLocations();
      const location = locations.find((l) => l.id === locationId);
      if (location?.moments) {
        const momentsMap = location.moments;
        const items: Moment[] = Object.entries(momentsMap).map(([id, m]) => ({
          id,
          locationId,
          date: m.date,
          text: m.text,
          createdTime: '',
        }));
        // 按日期降序排列，最近的在前
        items.sort((a, b) => b.date.localeCompare(a.date));
        setMoments(items);
      } else {
        setMoments([]);
      }
    } catch (err) {
      console.error('[Travel] useMoments.load 失败:', { locationId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  // 组件挂载时加载初始数据（标准数据获取模式）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * 新增精彩瞬间
   *
   * 调用 Server Action 创建后重新加载列表以同步。
   */
  const add = useCallback(async (data: { date: string; text: string }) => {
    try {
      await createMoment(locationId, data);
      await load();
    } catch (err) {
      console.error('[Travel] useMoments.add 失败:', { locationId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, load]);

  /**
   * 编辑精彩瞬间
   *
   * 调用 Server Action 更新后重新加载列表以同步。
   */
  const update = useCallback(async (id: string, data: { date?: string; text?: string }) => {
    try {
      await editMoment(locationId, id, data);
      await load();
    } catch (err) {
      console.error('[Travel] useMoments.update 失败:', { locationId, momentId: id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, load]);

  /**
   * 删除精彩瞬间
   *
   * 调用 Server Action 删除后重新加载列表以同步。
   */
  const remove = useCallback(async (id: string) => {
    try {
      await removeMoment(locationId, id);
      await load();
    } catch (err) {
      console.error('[Travel] useMoments.remove 失败:', { locationId, momentId: id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, load]);

  return { moments, loading, load, add, update, remove };
}
