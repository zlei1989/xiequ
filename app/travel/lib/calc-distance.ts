/**
 * 地理距离计算工具
 *
 * 提供 Haversine 公式计算球面大圆距离，以及从 localStorage 安全读取地图中心坐标。
 * 常量集中管理，供地图组件和收藏页共享引用。
 */

/** 地图中心坐标的 localStorage key */
export const MAP_CENTER_KEY = 'TRAVEL_MAP_CENTER';

/** 地图缩放级别的 localStorage key */
export const MAP_ZOOM_KEY = 'TRAVEL_MAP_ZOOM';

/** 默认地图中心：北京 */
export const DEFAULT_CENTER: [number, number] = [116.397477, 39.908692];

/**
 * 使用 Haversine 公式计算两点间的大圆距离
 *
 * @param lat1 - 点 1 纬度（度）
 * @param lng1 - 点 1 经度（度）
 * @param lat2 - 点 2 纬度（度）
 * @param lng2 - 点 2 经度（度）
 * @returns 距离，单位：千米，保留精确浮点数供排序使用
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // 地球半径（km）

  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * 从 localStorage 安全读取地图中心坐标
 *
 * 防御损坏数据、缺失字段和非预期类型。
 * SSR 环境（无 window）下返回默认中心。
 *
 * @returns 中心坐标 [lng, lat]
 */
export function readMapCenter(): [number, number] {
  // SSR guard：服务端无 localStorage
  if (typeof window === 'undefined') return DEFAULT_CENTER;

  try {
    const raw = localStorage.getItem(MAP_CENTER_KEY);
    if (!raw) return DEFAULT_CENTER;

    const parsed: unknown = JSON.parse(raw);

    // 校验数据形状：[number, number]
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'number' &&
      !Number.isNaN(parsed[0]) &&
      typeof parsed[1] === 'number' &&
      !Number.isNaN(parsed[1])
    ) {
      return [parsed[0], parsed[1]];
    }

    return DEFAULT_CENTER;
  } catch {
    // JSON.parse 异常 — 数据损坏
    return DEFAULT_CENTER;
  }
}
