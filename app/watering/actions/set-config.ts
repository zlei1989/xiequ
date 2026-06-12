/**
 * 设备配置更新 Server Action
 *
 * 部分字段更新（merge 到现有配置），不允许修改 chipId。
 * 更新后 revalidate "/watering" 路径以刷新页面缓存。
 *
 * 注意：throw 前必须 console.error 打印上下文，便于排查。
 */

'use server';

import { revalidatePath } from 'next/cache';

import { getDeviceConfig, saveDeviceConfig } from '../services/db';

import type { DeviceConfig } from '../types';

/**
 * 更新设备配置（部分字段 merge）
 *
 * 先读取现有配置，再将 updates 合并到现有配置上，强制保留原 chipId。
 * 写入成功后 revalidate 页面缓存。
 */
export async function updateDeviceConfig(chipId: string, updates: Partial<DeviceConfig>) {
  console.log('[Watering] 更新设备配置:', { chipId, keys: Object.keys(updates) });

  try {
    const config = await getDeviceConfig(chipId);
    if (!config) {
      console.error('[Watering] 设备不存在，无法更新配置:', { chipId });
      throw new Error('设备不存在');
    }

    const updated: DeviceConfig = {
      ...config,
      ...updates,
      chipId: config.chipId, // 强制保留原 chipId，防止前端覆盖
      lastWriteTime: new Date().toISOString(),
    };
    await saveDeviceConfig(updated);
    revalidatePath('/watering');
    console.log('[Watering] 设备配置已更新并 revalidate:', { chipId });
    return { success: true };
  } catch (err) {
    // 业务校验的 Error 已在上面 console.error 记录
    // 捕获 DB 写入等未预期的异常，补充堆栈
    if (err instanceof Error && err.message !== '设备不存在') {
      console.error('[Watering] 更新设备配置失败:', { chipId, keys: Object.keys(updates) }, err);
    }
    throw err;
  }
}
