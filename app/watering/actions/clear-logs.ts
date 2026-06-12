/**
 * 设备日志清空 Server Action
 *
 * 删除指定设备的所有 IoT 通信日志记录。
 * 注意：此操作不可逆，前端应提示用户确认后再调用。
 */

'use server';

import { clearDeviceLogs } from '../services/db';

/** 清空指定设备的所有日志 */
export async function clearLogs(chipId: string) {
  console.log('[Watering] 清空设备日志:', { chipId });

  try {
    await clearDeviceLogs(chipId);
    console.log('[Watering] 设备日志已清空:', { chipId });
  } catch (err) {
    console.error('[Watering] 清空设备日志失败:', { chipId }, err);
    throw err;
  }
}
