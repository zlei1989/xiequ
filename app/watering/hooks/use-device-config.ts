"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceConfig } from "../types";
import { getDevices } from "../actions";
import { updateDeviceConfig } from "../actions/set-config";
import { removeDevice } from "../actions/delete-device";

/** 确保值是一个数组 — sql.js 可能将 JSON 列作为字符串返回 */
function parseJsonArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 解析 voltage_config JSON，可能是字符串 */
function parseJsonVoltageConfig(v: unknown): DeviceConfig["voltageConfig"] {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.sensor === "string" && typeof obj.r1 === "number" && typeof obj.r2 === "number") {
      return { sensor: obj.sensor, r1: obj.r1, r2: obj.r2 };
    }
  }
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed.sensor === "string" && typeof parsed.r1 === "number" && typeof parsed.r2 === "number") {
        return { sensor: parsed.sensor, r1: parsed.r1, r2: parsed.r2 };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** 设备 GPIO 可用引脚信息（键名列表） */
export interface GpioInfo {
  loads: string[];
  sensors: string[];
  buttons: string[];
}

export function useDeviceConfig(chipId: string) {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [gpio, setGpio] = useState<GpioInfo>({ loads: [], sensors: [], buttons: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const devices = await getDevices();
      const found = devices.find((d) => d.chipId === chipId);
      if (found) {
        // sql.js 会把 JSON 列作为字符串返回，需要确保 processes/schedules 是数组
        const safeConfig: DeviceConfig = {
          ...(found as unknown as DeviceConfig),
          processes: parseJsonArray((found as any).processes),
          schedules: parseJsonArray((found as any).schedules),
          voltageConfig: parseJsonVoltageConfig((found as any).voltageConfig),
        };
        setConfig(safeConfig);
        // 从设备 state 中提取 GPIO 键名
        // 注意：固件将按钮以 sensor:button_x 发送，按钮实际存储在 sensors 列中
        const rawSensors = Object.keys(found.state?.sensors ?? {});
        const rawButtons = Object.keys(found.state?.buttons ?? {});
        setGpio({
          loads: Object.keys(found.state?.loads ?? {}),
          sensors: rawSensors.filter((k) => !k.startsWith("button_")),
          buttons: [
            ...rawButtons,
            ...rawSensors.filter((k) => k.startsWith("button_")),
          ],
        });
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

  return { config, gpio, loading, load, save, remove };
}
