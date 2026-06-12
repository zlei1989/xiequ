/**
 * 设备日志查询 Server Action
 *
 * 查询指定设备的 IoT 通信日志，按时间倒序返回。
 * 注意：日志量可能较大，前端按需加载，不做自动轮询。
 */

'use server';

import { getDeviceLogs } from '../services/db';

/** 获取指定设备的 IoT 通信日志 */
export async function getLogs(chipId: string) {
  console.log('[Watering] 查询设备日志:', { chipId });

  try {
    const logs = await getDeviceLogs(chipId);
    return logs;
  } catch (err) {
    console.error('[Watering] 查询设备日志失败:', { chipId }, err);
    throw err;
  }
}
