"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceItem } from "../types";
import { getDevices } from "../actions";

export function useDevices(intervalMs = 15000) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (err) {
      console.error("获取设备列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { devices, loading, refresh };
}
