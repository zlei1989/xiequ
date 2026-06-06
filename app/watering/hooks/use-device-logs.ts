"use client";

import { useState, useCallback } from "react";

/**
 * 设备日志 hook
 * 后续实现时连接 Server Actions
 */
export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取日志
    setLoading(false);
  }, [chipId]);

  const clear = useCallback(async () => {
    // TODO: 调用 Server Action 清空日志
  }, [chipId]);

  return { logs, loading, load, clear };
}
