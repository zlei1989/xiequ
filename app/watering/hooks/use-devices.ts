/**
 * 设备列表数据 Hook
 *
 * 首次加载后按 intervalMs（默认 15 秒）定时轮询刷新。
 * 组件卸载时自动清除定时器。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

import { getDevices } from '../actions';

import type { DeviceItem } from '../types';

/** 设备列表数据管理（自动轮询） */
export function useDevices(intervalMs = 15000) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (err) {
      // ERROR: 设备列表加载失败影响整个页面
      console.error('[Watering] 获取设备列表失败:', err);
      if (err instanceof Error && err.stack) console.error(err.stack);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // 定时轮询：固件心跳 + 状态由服务端写入，前端定时拉取最新数据
    const timer = setInterval(refresh, intervalMs);
    return () => { clearInterval(timer); };
  }, [refresh, intervalMs]);

  return { devices, loading, refresh };
}
