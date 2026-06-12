/**
 * 通用工具函数
 *
 * 提供 ID 生成、日期格式化等纯函数，无副作用、无外部依赖。
 */

/**
 * 生成 8 位随机字母数字 ID
 *
 * 从 62 个字符（A-Z, a-z, 0-9）中随机选取 8 位组成。
 * 非加密安全随机，仅适用于生成数据库主键等非安全场景。
 * 碰撞概率约 1 / 62^8 ≈ 1 / 218 万亿，短 ID 碰撞极少。
 */
export function newId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 格式化日期为 YYYY-MM-DD
 *
 * 月、日自动补零到两位（如 2026-01-05）。
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}

/**
 * 格式化日期时间为 ISO 8601 字符串
 *
 * 等价于 date.toISOString()，输出如 "2026-01-05T12:30:00.000Z"。
 */
export function formatDateTime(date: Date): string {
  return date.toISOString();
}
