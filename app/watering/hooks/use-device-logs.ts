/**
 * 设备日志管理 Hook
 *
 * 提供日志加载和清空功能。
 * 与 useDevices 不同，日志不自动轮询（数据量大），需手动 load。
 */

'use client';

import { useState, useCallback } from 'react';

import { clearLogs } from '../actions/clear-logs';
import { getLogs } from '../actions/get-logs';

/** 设备日志管理 */
export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLogs(chipId);
      setLogs(data as any[]);
    } catch (err) {
      console.error('[Watering] 加载设备日志失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const clear = useCallback(async () => {
    try {
      await clearLogs(chipId);
      setLogs([]);
    } catch (err) {
      console.error('[Watering] 清空设备日志失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
    }
  }, [chipId]);

  return { logs, loading, load, clear };
}
