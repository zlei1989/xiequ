import { getOssAdapter, isOssConfigured } from "@/lib/oss";
import type { OssPutOptions } from "@/lib/oss";
import type { Location, Moment } from "../types";
import { newId, formatDateTime } from "@/lib/utils";

/**
 * 旅行模块 OSS 存储路径约定
 * - 位置数据: apps/travel/locations.json
 * - 图片统一: apps/travel/posters/{id}.jpg
 *
 * 访问 URL 格式（COS CI 样式处理）：
 * - https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{stylename}
 * - stylename: cover | icon
 */

const LOCATIONS_KEY = "apps/travel/locations.json";

/**
 * 构造 OSS 公共访问基础 URL
 *
 * 格式：https://{bucket}.cos.{region}.myqcloud.com
 * 用于拼接带 COS CI 样式后缀的图片访问地址。
 */
function getOssBaseUrl(): string {
  const adapter = getOssAdapter();
  return `https://${adapter.getBucket()}.cos.${adapter.getEndpoint()}.myqcloud.com`;
}

// ─── OSS 通用操作（通过 OssAdapter 适配器） ────────────────────────────

/**
 * 获取文件内容
 *
 * 通过 OssAdapter.getString() 读取，参考 TencentOss.getString()
 */
async function ossGetString(key: string): Promise<string> {
  const adapter = getOssAdapter();
  return adapter.getString(key);
}

/**
 * 上传字符串内容
 *
 * 通过 OssAdapter.putString() 写入，参考 TencentOss.putString()
 */
async function ossPutString(key: string, content: string, options?: OssPutOptions): Promise<void> {
  const adapter = getOssAdapter();
  return adapter.putString(key, content, options);
}

/**
 * 删除文件
 *
 * 通过 OssAdapter.delete() 删除，参考 TencentOss.delete()
 */
async function ossDelete(key: string): Promise<void> {
  const adapter = getOssAdapter();
  return adapter.delete(key);
}

/**
 * 获取上传签名 URL
 *
 * 通过 OssAdapter.getSignedPutUrl() 获取，参考 TencentOss.getSignedPutUrl()
 * 用于前端直传（图片上传等）。
 */
async function ossGetSignedPutUrl(key: string, options?: OssPutOptions): Promise<string> {
  const adapter = getOssAdapter();
  return adapter.getSignedPutUrl(key, options);
}

/**
 * 获取下载签名 URL
 *
 * 通过 OssAdapter.getSignedUrl() 获取，参考 TencentOss.getSignedUrl()
 * 用于临时授权访问私有文件。
 */
async function ossGetSignedUrl(key: string, options?: OssPutOptions): Promise<string> {
  const adapter = getOssAdapter();
  return adapter.getSignedUrl(key, options);
}

/**
 * 判断文件是否存在
 *
 * 通过 OssAdapter.exists() 判断，参考 TencentOss.exists()
 */
async function ossExists(key: string): Promise<boolean> {
  const adapter = getOssAdapter();
  return adapter.exists(key);
}

// ─── 位置数据 CRUD ────────────────────────────────────────────────────

/**
 * 获取所有位置
 *
 * 从 OSS 的 apps/travel/locations.json 读取。
 * 文件不存在时返回空数组。
 */
export async function getLocations(): Promise<Location[]> {
  if (!isOssConfigured()) {
    return [];
  }
  try {
    const jsonStr = await ossGetString(LOCATIONS_KEY);
    return JSON.parse(jsonStr) as Location[];
  } catch {
    return [];
  }
}

/**
 * 保存所有位置
 *
 * 将位置数据写入 OSS 的 apps/travel/locations.json。
 */
async function saveLocations(locations: Location[]): Promise<void> {
  await ossPutString(LOCATIONS_KEY, JSON.stringify(locations), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 新增位置
 */
export async function addLocation(data: {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  comments?: string;
}): Promise<Location> {
  const locations = await getLocations();
  const location: Location = {
    id: newId(),
    name: data.name,
    address: data.address,
    longitude: data.longitude,
    latitude: data.latitude,
    checked: false,
    comments: data.comments || "",
    deleted: false,
    createdTime: formatDateTime(new Date()),
  };
  locations.push(location);
  await saveLocations(locations);
  return location;
}

/**
 * 更新位置
 */
export async function updateLocation(
  id: string,
  data: Partial<Location>
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === id);
  if (!location) throw new Error(`位置 ${id} 不存在`);

  if (data.name !== undefined) location.name = data.name;
  if (data.address !== undefined) location.address = data.address;
  if (data.comments !== undefined) location.comments = data.comments;
  if (data.checked !== undefined) location.checked = data.checked;
  if (data.longitude !== undefined) location.longitude = data.longitude;
  if (data.latitude !== undefined) location.latitude = data.latitude;

  await saveLocations(locations);
  return location;
}

/**
 * 删除位置（软删除）
 *
 * 将 deleted 标记设为 true，并尝试删除封面图。
 */
export async function deleteLocation(id: string): Promise<void> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === id);
  if (!location) throw new Error(`位置 ${id} 不存在`);

  location.deleted = true;
  await saveLocations(locations);

  // 删除封面图（忽略不存在的情况）
  try {
    await ossDelete(`apps/travel/posters/${id}.jpg`);
  } catch {
    // 封面图可能不存在，忽略
  }
}

// ─── 精彩瞬间 ──────────────────────────────────────────────────────────

/**
 * 新增瞬间
 */
export async function addMoment(
  locationId: string,
  data: { date: string; text: string }
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === locationId);
  if (!location) throw new Error(`位置 ${locationId} 不存在`);

  // 位置上的 moments 存储（用 Record 结构与旧项目一致）
  const moments = (location as any).moments || {};
  const momentId = newId();
  moments[momentId] = { date: data.date, text: data.text };
  (location as any).moments = moments;

  await saveLocations(locations);
  return location;
}

/**
 * 更新瞬间
 */
export async function updateMoment(
  locationId: string,
  momentId: string,
  data: { date?: string; text?: string }
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === locationId);
  if (!location) throw new Error(`位置 ${locationId} 不存在`);

  const moments = (location as any).moments;
  if (!moments || !moments[momentId]) {
    throw new Error(`瞬间 ${momentId} 不存在`);
  }

  if (data.date !== undefined) moments[momentId].date = data.date;
  if (data.text !== undefined) moments[momentId].text = data.text;

  await saveLocations(locations);
  return location;
}

/**
 * 删除瞬间
 */
export async function deleteMoment(
  locationId: string,
  momentId: string
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === locationId);
  if (!location) throw new Error(`位置 ${locationId} 不存在`);

  const moments = (location as any).moments;
  if (moments && moments[momentId]) {
    delete moments[momentId];
  }

  await saveLocations(locations);
  return location;
}

// ─── 图片上传 / 访问 ────────────────────────────────────────────────────

/**
 * 获取 poster 上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传图片到 COS。
 * 所有图片（封面/图标）统一上传到 apps/travel/posters/{id}.jpg。
 */
export async function getPosterUploadUrl(id: string): Promise<string> {
  return ossGetSignedPutUrl(`apps/travel/posters/${id}.jpg`);
}

/**
 * 获取 poster 访问 URL（COS CI 样式处理）
 *
 * 通过 URL 后缀指定 COS CI 处理样式，格式：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{stylename}
 *
 * @param id - 图片标识
 * @param stylename - 样式名：cover | icon
 */
export function getPosterStyledUrl(id: string, stylename: "cover" | "icon"): string {
  return `${getOssBaseUrl()}/apps/travel/posters/${id}.jpg/${stylename}`;
}
