/**
 * getSensorLogs Server Action — 查询设备传感器采样日志
 *
 * 供前端折线图页面调用，按时间范围返回传感器历史读数。
 */

'use server';

import { getSensorLogs as querySensorLogs } from '../services/db';

/** 支持的时间范围 */
type TimeRange = '1h' | '6h' | '24h' | '7d';

/** 时间范围对应的毫秒偏移 */
const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/**
 * 查询设备传感器采样日志
 *
 * @param chipId 设备芯片 ID
 * @param range 时间范围：'1h' | '6h' | '24h' | '7d'
 * @returns 按 recordTime 升序排列的采样记录数组
 */
export async function getSensorLogs(
  chipId: string,
  range: TimeRange,
): Promise<{ recordTime: string; readings: { label: string; value: number }[] }[]> {
  const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
  return querySensorLogs(chipId, since);
}
