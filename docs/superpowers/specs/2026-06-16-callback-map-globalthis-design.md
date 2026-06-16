# callback-map 跨模块隔离修复

## 问题

`app/watering/services/callback-map.ts` 中的模块级 `Map` 在不同编译单元（API Route / Server Action）中各自持有独立副本，导致 `get-state` 注册的回调无法被 `set-state` / `push-state` 唤醒。

**根因**：Next.js standalone 打包时，`'use server'` 标记的 Server Action 与 API Route 被编译到独立的 chunk，Node.js 对同一源文件生成不同的模块实例。

## 方案

将 `Map` 从模块闭包变量挂载到 `globalThis`，通过 `Symbol.for()` 确保进程全局唯一键。

### 理由

- `globalThis` 是 Node.js 进程中唯一的跨模块共享对象
- `Symbol.for('watering.callbackMap')` 在整个进程中唯一，不受文件路径/打包影响
- 零外部依赖，改动仅限单文件
- 导出签名完全不变，调用方零改动

## 实现

### 文件

`app/watering/services/callback-map.ts`

### 改动点

1. **新增全局键常量与 getter 函数**：`Symbol.for('watering.callbackMap')` + `getCallbackMap()`
2. **三个导出函数内部**：`callbackMap` 改为 `getCallbackMap()` 调用
3. **懒初始化**：首次访问时创建 Map，不在模块加载时执行副作用

### 伪代码

```ts
const CALLBACK_MAP_KEY = Symbol.for('watering.callbackMap');

function getCallbackMap(): Map<string, () => void> {
  const g = globalThis as Record<symbol, Map<string, () => void>>;
  if (!g[CALLBACK_MAP_KEY]) {
    g[CALLBACK_MAP_KEY] = new Map<string, () => void>();
  }
  return g[CALLBACK_MAP_KEY];
}

export function setCallback(chipId: string, callback: () => void): void {
  const map = getCallbackMap();
  // ... 其余逻辑不变
}
```

### 不变量

| 项目 | 状态 |
|------|------|
| 导出签名 | 不变 |
| 调用方改动 | 无 |
| 每个 chipId 最多一个回调 | 不变 |
| 设备重连时旧回调释放 | 不变 |
| SCF 冷启动重建 | 不变（与原来一致） |

## 验证

1. `npm run check` 通过
2. `npm run build` 后 `node .next/standalone/server.js` 启动，手动测试 get-state 长轮询 + set-state 唤醒链路
3. `npm run dev` 下同样方法验证
