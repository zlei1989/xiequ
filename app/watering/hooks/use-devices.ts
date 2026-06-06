"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceItem } from "../types";

/**
 * 设备列表 hook（含自动刷新）
 * 后续实现时连接 Server Actions
 */
export function useDevices(intervalMs = 15000) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取设备列表
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { devices, loading, refresh };
}
