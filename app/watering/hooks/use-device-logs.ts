/**
 * 设备日志管理 Hook
 *
 * 提供日志加载和清空功能。
 * 与 useDevices 不同，日志不自动轮询（数据量大），需手动 load。
 * error 在 load 失败时设为归一化 Error，成功/初始时为 null。
 */

'use client';

import { useState, useCallback } from 'react';

import { clearLogs } from '../actions/clear-logs';
import { getLogs } from '../actions/get-logs';

import type { LogItem } from '../components/log-card';

/** 设备日志管理 */
export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLogs(chipId);
      setLogs(data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      console.error('[Watering] 加载设备日志失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw e; // re-throw 让调用方可显示 Toast
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const clear = useCallback(async () => {
    try {
      await clearLogs(chipId);
      setLogs([]);
      setError(null);
    } catch (err) {
      console.error('[Watering] 清空设备日志失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [chipId]);

  return { logs, loading, error, load, clear };
}
