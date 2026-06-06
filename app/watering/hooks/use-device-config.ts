"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceConfig } from "../types";
import { getDevices } from "../actions";
import { updateDeviceConfig } from "../actions/set-config";
import { removeDevice } from "../actions/delete-device";

export function useDeviceConfig(chipId: string) {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const devices = await getDevices();
      const found = devices.find((d) => d.chipId === chipId);
      if (found) {
        // DeviceItem 中 processes/schedules 已是对象，直接使用
        setConfig(found as unknown as DeviceConfig);
      }
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const save = useCallback(async (data: Partial<DeviceConfig>) => {
    setLoading(true);
    try {
      await updateDeviceConfig(chipId, data);
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const remove = useCallback(async () => {
    await removeDevice(chipId);
  }, [chipId]);

  useEffect(() => {
    load();
  }, [load]);

  return { config, loading, load, save, remove };
}
