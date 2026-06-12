/**
 * 旅行计划 Server Actions
 *
 * 所有服务端操作统一从这里导出，前端组件通过 import 直接调用。
 * 底层委托给 services/oss.ts 的 CRUD 函数。
 * OSS 未配置时返回空数组而非报错（降级处理）。
 * 每个 Action 在入口记录 INFO，外部调用记录耗时，异常记录 ERROR + 堆栈。
 */

'use server';

import { isOssConfigured } from '@/lib/oss';

import {
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  addMoment,
  updateMoment,
  deleteMoment,
  getPosterUploadUrl,
  getPosterStyledUrl,
} from './services/oss';

import type { Location } from './types';

/** 获取所有位置列表（OSS 未配置时降级返回空数组） */
export async function fetchLocations() {
  if (!isOssConfigured()) {
    // WARN 级别：OSS 未配置意味着数据不可用，但页面仍需正常渲染
    console.warn('[Travel] OSS 未配置，返回空列表');
    return [];
  }
  console.info('[Travel] fetchLocations 开始加载');
  const t0 = Date.now();
  try {
    const result = await getLocations();
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] fetchLocations 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] fetchLocations 失败:', err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/** 创建新位置 */
export async function createLocation(data: {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  comments?: string;
}) {
  console.info('[Travel] createLocation:', data.name);
  const t0 = Date.now();
  try {
    const result = await addLocation(data);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] createLocation 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] createLocation 失败:', { name: data.name, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/** 编辑位置 */
export async function editLocation(id: string, data: Partial<Location>) {
  console.info('[Travel] editLocation:', id);
  const t0 = Date.now();
  try {
    const result = await updateLocation(id, data);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] editLocation 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] editLocation 失败:', { id, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/** 删除位置（软删除，标记 deleted=true） */
export async function removeLocation(id: string) {
  console.info('[Travel] removeLocation:', id);
  const t0 = Date.now();
  try {
    await deleteLocation(id);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] removeLocation 耗时 ${String(elapsed)}ms`);
  } catch (err) {
    console.error('[Travel] removeLocation 失败:', { id, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/** 添加精彩瞬间 */
export async function createMoment(locationId: string, data: { date: string; text: string }) {
  console.info('[Travel] createMoment:', locationId, data.date);
  const t0 = Date.now();
  try {
    const result = await addMoment(locationId, data);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] createMoment 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] createMoment 失败:', { locationId, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/** 编辑精彩瞬间 */
export async function editMoment(
  locationId: string,
  momentId: string,
  data: { date?: string; text?: string },
) {
  console.info('[Travel] editMoment:', locationId, momentId);
  const t0 = Date.now();
  try {
    const result = await updateMoment(locationId, momentId, data);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] editMoment 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] editMoment 失败:', { locationId, momentId, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/** 删除精彩瞬间 */
export async function removeMoment(locationId: string, momentId: string) {
  console.info('[Travel] removeMoment:', locationId, momentId);
  const t0 = Date.now();
  try {
    const result = await deleteMoment(locationId, momentId);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] removeMoment 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] removeMoment 失败:', { locationId, momentId, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/**
 * 获取图片上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传到 COS 的 apps/travel/posters/{id}.jpg。
 */
export async function getUploadUrl(id: string, type: 'cover' | 'icon' = 'cover') {
  console.info('[Travel] getUploadUrl:', id, type);
  const t0 = Date.now();
  try {
    const result = await getPosterUploadUrl(id);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] getUploadUrl 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] getUploadUrl 失败:', { id, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}

/**
 * 获取图片访问 URL（COS CI 样式处理）
 *
 * 返回带样式后缀的公共访问地址：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{type}
 */
/** @see {@link getPosterStyledUrl} — 同步函数，但 Server Action 需要 async 以支持客户端 Promise 包装 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function getImageUrl(id: string, type: 'cover' | 'icon' = 'cover') {
  console.info('[Travel] getImageUrl:', id, type);
  const t0 = Date.now();
  try {
    const result = getPosterStyledUrl(id, type);
    const elapsed = Date.now() - t0;
    if (elapsed > 500) console.info(`[Travel] getImageUrl 耗时 ${String(elapsed)}ms`);
    return result;
  } catch (err) {
    console.error('[Travel] getImageUrl 失败:', { id, error: err });
    if (err instanceof Error && err.stack) console.error(err.stack);
    throw err;
  }
}
