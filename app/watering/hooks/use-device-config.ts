/**
 * 设备配置管理 Hook
 *
 * 提供单个设备的配置加载、保存、删除功能。
 * 自动从设备状态中提取 GPIO 引脚信息（sensor/button/load）。
 * sql.js/WASM 可能将 JSON 列作为字符串返回，需要 parseJsonArray / parseJsonVoltage 安全解析。
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

import { getDevices } from '../actions';
import { removeDevice } from '../actions/delete-device';
import { updateDeviceConfig } from '../actions/set-config';

import type { DeviceConfig, ProcessConfig, ScheduleConfig } from '../types';

/** 安全解析 JSON 数组 — sql.js/WASM 可能将 JSON 列序列化为字符串 */
function parseJsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
       
      const parsed: unknown = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** 安全解析 voltage_config — 支持对象或 JSON 字符串两种格式 */
function parseJsonVoltage(v: unknown): DeviceConfig['voltage'] {
  if (!v) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Array.isArray 运行时类型区分
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.sensor === 'string' && typeof obj.r1 === 'number' && typeof obj.r2 === 'number') {
      return { sensor: obj.sensor, r1: obj.r1, r2: obj.r2 };
    }
  }
  if (typeof v === 'string') {
    try {
       
      const parsed = JSON.parse(v) as Record<string, unknown>;
      if (typeof parsed.sensor === 'string' && typeof parsed.r1 === 'number' && typeof parsed.r2 === 'number') {
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

/** 设备配置管理 Hook */
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
        // 使用 Record<string, unknown> 绕过类型系统处理 SQLite WASM 的原始返回值
        const safeConfig: DeviceConfig = {
          ...(found as unknown as DeviceConfig),
          processes: parseJsonArray((found as Record<string, unknown>).processes) as ProcessConfig[],
          schedules: parseJsonArray((found as Record<string, unknown>).schedules) as ScheduleConfig[],
          voltage: parseJsonVoltage((found as Record<string, unknown>).voltage),
        };
        setConfig(safeConfig);
        // 从设备 state 中提取 GPIO 键名
        // 注意：固件将按钮以 sensor:button_x 发送，按钮实际存储在 sensors 列中
        const rawSensors = Object.keys(found.state?.sensors ?? {});
        const rawButtons = Object.keys(found.state?.buttons ?? {});
        setGpio({
          loads: Object.keys(found.state?.loads ?? {}),
          sensors: rawSensors.filter((k) => !k.startsWith('button_')),
          buttons: [
            ...rawButtons,
            ...rawSensors.filter((k) => k.startsWith('button_')),
          ],
        });
      } else {
        // 设备列表中未找到，可能已被删除
        console.warn('[Watering] 未找到设备配置:', { chipId });
      }
    } catch (err) {
      console.error('[Watering] 加载设备配置失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  /** 保存设备配置 — 记日志后重新抛出，由调用方决定如何提示用户 */
  const save = useCallback(async (data: Partial<DeviceConfig>) => {
    setLoading(true);
    try {
      await updateDeviceConfig(chipId, data);
    } catch (err) {
      console.error('[Watering] 保存设备配置失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err; // 重新抛出，让页面层处理用户提示
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  /** 删除设备 — 记日志后重新抛出，由调用方决定如何提示用户 */
  const remove = useCallback(async () => {
    try {
      await removeDevice(chipId);
    } catch (err) {
      console.error('[Watering] 删除设备失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err; // 重新抛出，让页面层处理用户提示
    }
  }, [chipId]);

  // 组件挂载及 chipId 变化时加载设备配置（标准数据获取模式）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { config, gpio, loading, load, save, remove };
}
