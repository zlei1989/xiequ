"use client";

import { useState, useCallback } from "react";
import type { DeviceConfig } from "../types";

/**
 * 单个设备配置 CRUD hook
 * 后续实现时连接 Server Actions
 */
export function useDeviceConfig(chipId: string) {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取设备配置
    setLoading(false);
  }, [chipId]);

  const save = useCallback(async (data: DeviceConfig) => {
    setLoading(true);
    // TODO: 调用 Server Action 保存设备配置
    setLoading(false);
  }, []);

  const remove = useCallback(async () => {
    // TODO: 调用 Server Action 删除设备
  }, [chipId]);

  return { config, loading, load, save, remove };
}
