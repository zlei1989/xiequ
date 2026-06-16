/**
 * 浇花帮手 Server Actions
 *
 * 所有服务端操作统一从这里导出，前端组件通过 import 直接调用。
 * 底层委托给 services/db.ts 和各 actions 子模块。
 */

'use server';

import { clearLogs as _clearLogs } from './actions/clear-logs';
import { removeDevice as _removeDevice } from './actions/delete-device';
import { getLogs as _getLogs } from './actions/get-logs';
import { getSensorLogs as _getSensorLogs } from './actions/get-sensor-logs';
import { updateDeviceConfig as _updateDeviceConfig } from './actions/set-config';
import { setDeviceSwitch as _setDeviceSwitch } from './actions/set-state';
import { getAllDevices } from './services/db';

import type { DeviceConfig } from './types';

/** 获取所有设备（配置 + 状态 + 在线信息合并） */
export async function getDevices() {
  console.log('[Watering] 获取设备列表');
  try {
    return await getAllDevices();
  } catch (err) {
    console.error('[Watering] 获取设备列表失败:', err);
    throw err;
  }
}

/** 切换设备开关（on 启动流程 / off 停止） */
export async function setDeviceSwitch(
  chipId: string,
  switchState: 'on' | 'off',
  processIndex?: number,
  stepIndex?: number,
) {
  console.log('[Watering] 设置设备开关:', { chipId, switchState, processIndex, stepIndex });
  return _setDeviceSwitch(chipId, switchState, processIndex, stepIndex);
}

/** 更新设备配置（部分字段更新） */
export async function updateDeviceConfig(chipId: string, updates: Partial<DeviceConfig>) {
  console.log('[Watering] 更新设备配置:', { chipId });
  return _updateDeviceConfig(chipId, updates);
}

/** 删除设备 */
export async function removeDevice(chipId: string) {
  console.log('[Watering] 删除设备:', { chipId });
  return _removeDevice(chipId);
}

/** 获取设备日志 */
export async function getLogs(chipId: string) {
  console.log('[Watering] 获取设备日志:', { chipId });
  return _getLogs(chipId);
}

/** 清空设备日志 */
export async function clearLogs(chipId: string) {
  console.log('[Watering] 清空设备日志:', { chipId });
  return _clearLogs(chipId);
}

/** 获取设备传感器采样日志（环境数据折线图） */
export async function getSensorLogs(chipId: string, range: '1h' | '6h' | '24h' | '7d') {
  console.log('[Watering] 获取传感器采样日志:', { chipId, range });
  return _getSensorLogs(chipId, range);
}
