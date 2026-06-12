/**
 * 设备删除 Server Action
 *
 * 删除设备配置和状态记录，并 revalidate 页面缓存。
 * deleteDevice 内部已处理设备不存在的场景，此处只负责入口日志和缓存刷新。
 */

'use server';

import { revalidatePath } from 'next/cache';

import { deleteDevice } from '../services/db';

/** 删除指定设备的配置和状态 */
export async function removeDevice(chipId: string) {
  console.log('[Watering] 删除设备:', { chipId });

  try {
    await deleteDevice(chipId);
    revalidatePath('/watering');
    console.log('[Watering] 设备已删除并 revalidate:', { chipId });
  } catch (err) {
    console.error('[Watering] 删除设备失败:', { chipId }, err);
    throw err;
  }

  return { success: true };
}
