/**
 * 高德地图 SDK 封装
 *
 * 需要 AMap API Key 环境变量：NEXT_PUBLIC_AMAP_KEY
 */

export function getAmapKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_KEY || "";
}
