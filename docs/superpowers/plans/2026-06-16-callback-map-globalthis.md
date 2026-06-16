# callback-map globalThis 迁移实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 callback-map 的模块级 Map 迁移到 globalThis，解决跨编译单元模块隔离问题

**Architecture:** 单文件内部重构，通过 `Symbol.for('watering.callbackMap')` 在 `globalThis` 上挂载全局 Map，`setCallback`/`execCallback`/`deleteCallback` 内部从直接引用闭包变量改为通过 getter 函数获取。导出签名不变，调用方零改动。

**Tech Stack:** TypeScript, Next.js 16 standalone

---

### Task 1: 迁移 callbackMap 到 globalThis

**Files:**
- Modify: `app/watering/services/callback-map.ts`

- [ ] **Step 1: 将模块级 Map 改为 globalThis 懒初始化**

将文件内容替换为：

```ts
/**
 * IoT 设备 HTTP 长轮询回调映射表
 *
 * 全局 Map<chipId, callback>，作为跨请求（get-state / set-state / push-state）
 * 的唤醒通道。设备在 get-state 等待时注册回调，set-state 或 push-state
 * 写入新状态后通过 execCallback 立即通知设备。
 *
 * 使用 globalThis + Symbol.for() 挂载，确保 Next.js 不同编译单元
 * （API Route / Server Action）共享同一 Map 实例。
 *
 * 注意事项：
 * - Map 存储在 globalThis 上，随 Node 进程生命周期
 * - 每个 chipId 同时最多一个等待回调，设备重连时旧回调自动释放
 */

/** globalThis 上的全局键 */
const CALLBACK_MAP_KEY = Symbol.for('watering.callbackMap');

/** 获取全局回调 Map（懒初始化） */
function getCallbackMap(): Map<string, () => void> {
  const g = globalThis as Record<symbol, Map<string, () => void>>;
  if (!g[CALLBACK_MAP_KEY]) {
    g[CALLBACK_MAP_KEY] = new Map<string, () => void>();
  }
  return g[CALLBACK_MAP_KEY];
}

/**
 * 注册设备回调
 *
 * 如果该 chipId 已有等待中的回调（上一次 get-state 未超时），
 * 先执行旧回调释放等待，再注册新回调。确保设备重连时旧连接正常返回。
 */
export function setCallback(chipId: string, callback: () => void): void {
  const map = getCallbackMap();
  const existing = map.get(chipId);
  if (existing) {
    // 执行旧回调让上一次等待的请求正常返回 unchanged
    existing();
  }
  map.set(chipId, callback);
}

/**
 * 执行回调并清理
 *
 * 通知等待中的 get-state 请求：状态已变更，立即返回最新数据。
 * 执行后自动从 Map 中删除，避免重复通知。
 * 若 Map 中无回调（设备未在等待），静默跳过。
 */
export function execCallback(chipId: string): void {
  const map = getCallbackMap();
  const cb = map.get(chipId);
  if (cb) {
    cb();
    map.delete(chipId);
  }
}

/**
 * 静默清理回调
 *
 * 仅从 Map 中删除，不执行回调。用于 get-state 超时后的 finally 清理，
 * 此时 Promise 已自行 resolve，只需清理 Map 引用防止内存泄漏。
 */
export function deleteCallback(chipId: string): void {
  const map = getCallbackMap();
  if (map.has(chipId)) {
    map.delete(chipId);
  }
}
```

- [ ] **Step 2: 运行类型检查与格式化**

```bash
npm run format && npm run check
```

期望：无错误

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

期望：构建成功

- [ ] **Step 4: Commit**

```bash
git add app/watering/services/callback-map.ts
git commit -m "fix: migrate callbackMap to globalThis for cross-chunk singleton"
```
