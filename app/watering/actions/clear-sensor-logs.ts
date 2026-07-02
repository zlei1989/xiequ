/**
 * 传感器采样日志清空 Server Action
 *
 * 删除指定设备的所有传感器历史采样记录。
 * 注意：此操作不可逆，前端应提示用户确认后再调用。
 */

'use server';

import { clearSensorLogs as _clearSensorLogs } from '../services/db';

/** 清空指定设备的所有传感器采样日志 */
export async function clearSensorLogs(chipId: string) {
  console.log('[Watering] 清空传感器采样日志:', { chipId });

  try {
    await _clearSensorLogs(chipId);
    console.log('[Watering] 传感器采样日志已清空:', { chipId });
  } catch (err) {
    console.error('[Watering] 清空传感器采样日志失败:', { chipId }, err);
    throw err;
  }
}
