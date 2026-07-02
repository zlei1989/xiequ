/**
 * 时间格式化工具
 *
 * 提供相对时间、时长等中文格式化函数，供日志卡片和设备卡片共用。
 * formatSimpleDuration 从 log-card.tsx 抽取至此。
 */

/**
 * 格式化秒数为中文简化形式
 *
 * 规则：<1 分钟 → 刚刚，<1 小时 → X分钟，<1 天 → X小时，≥1 天 → X天。
 * 用于流程用时和休眠时长。
 */
export function formatSimpleDuration(seconds: number): string {
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}小时`;
  const days = Math.floor(hours / 24);
  return `${String(days)}天`;
}

/**
 * 格式化距今毫秒为相对时间
 *
 * 规则：<60 秒 → 刚刚，<60 分钟 → X分钟前，
 * <24 小时 → X小时前，≥1 天 → X天前。
 */
export function formatRelativeTime(msAgo: number): string {
  const seconds = Math.floor(msAgo / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}小时前`;
  const days = Math.floor(hours / 24);
  return `${String(days)}天前`;
}

/**
 * 格式化毫秒耗时为动作耗时文本
 *
 * 规则：<1 秒 → ""，否则 → "用" + formatSimpleDuration。
 * 传入 0 或负数返回空字符串。
 */
export function formatActionDuration(ms: number): string {
  if (ms <= 0) return '';
  const seconds = Math.floor(ms / 1000);
  const d = formatSimpleDuration(seconds);
  return `用${d}`;
}
