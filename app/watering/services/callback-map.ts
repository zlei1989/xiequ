/**
 * IoT 设备 HTTP 长轮询回调映射表
 *
 * 全局 Map<chipId, callback>，作为跨请求（get-state / set-state / push-state）
 * 的唤醒通道。设备在 get-state 等待时注册回调，set-state 或 push-state
 * 写入新状态后通过 execCallback 立即通知设备。
 *
 * 注意事项：
 * - Map 存储在模块作用域，SCF 冷启动后丢失，与 7qb-server 重启行为一致
 * - 每个 chipId 同时最多一个等待回调，设备重连时旧回调自动释放
 */

/** 全局回调映射表：chipId → resolve 回调 */
const callbackMap = new Map<string, () => void>();

/**
 * 注册设备回调
 *
 * 如果该 chipId 已有等待中的回调（上一次 get-state 未超时），
 * 先执行旧回调释放等待，再注册新回调。确保设备重连时旧连接正常返回。
 */
export function setCallback(chipId: string, callback: () => void): void {
  const existing = callbackMap.get(chipId);
  if (existing) {
    // 执行旧回调让上一次等待的请求正常返回 unchanged
    existing();
  }
  callbackMap.set(chipId, callback);
}

/**
 * 执行回调并清理
 *
 * 通知等待中的 get-state 请求：状态已变更，立即返回最新数据。
 * 执行后自动从 Map 中删除，避免重复通知。
 * 若 Map 中无回调（设备未在等待），静默跳过。
 */
export function execCallback(chipId: string): void {
  const cb = callbackMap.get(chipId);
  if (cb) {
    cb();
    callbackMap.delete(chipId);
  }
}

/**
 * 静默清理回调
 *
 * 仅从 Map 中删除，不执行回调。用于 get-state 超时后的 finally 清理，
 * 此时 Promise 已自行 resolve，只需清理 Map 引用防止内存泄漏。
 */
export function deleteCallback(chipId: string): void {
  if (callbackMap.has(chipId)) {
    callbackMap.delete(chipId);
  }
}
