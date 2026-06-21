# 开机日志合并优化设计

**日期**：2026-06-21
**范围**：浇花模块 — 日志查看器开机卡

## 背景

设备在频繁休眠-唤醒场景下（如定时唤醒后无操作立即休眠），每次唤醒产生一张独立 `BootCard`。大量"只开没干"的卡片淹没真正有意义的流程执行记录，造成信息噪音。

## 目标

合并连续相同唤醒原因（cause）的开机日志为一张卡片，摘要展示总休眠时长和唤醒次数，传感器数据取最后一次。

## 合并规则

1. **相同 cause 合并**：连续且 `cause` 值相同的 `bootstrap` 事件合并为一组
2. **cause 变化断开**：cause 值变化时，即使连续 boot 也断开
3. **process 组无关**：中间是否有 execute/process 组不影响合并判断
4. **正常上电不合并**：cause=0 通常独立展示（符合规则 2，与其他 cause 必然断开）

## 设计

### 数据类型（log-card.tsx）

`ProcessGroup` 新增两个可选字段：

```typescript
export type ProcessGroup = {
  // ... 现有字段不变
  /** 合并后唤醒次数（>1 表示合并），仅合并 boot 组 */
  wakeCount?: number;
  /** 合并后总休眠时长（秒），仅合并 boot 组 */
  sleepTotal?: number;
};
```

### 新增函数 `mergeConsecutiveBoots`

```typescript
/**
 * 合并连续相同 cause 的开机记录
 *
 * 遍历 groupByProcess 结果，相邻且 cause 相同的 boot 组合并为一张卡片。
 * - bootItem 保留最新（时间最晚）的 bootstrap 日志
 * - wakeCount 累加合并的 boot 数
 * - sleepTotal 累加各次 calcSleepDuration
 * - 遇到 type='process' 或 cause 不同的 boot 时断开合并
 */
export function mergeConsecutiveBoots(
  groups: ProcessGroup[],
  allLogs: LogItem[],
): ProcessGroup[]
```

算法：
- 遍历 groups（最新在前），维护结果栈
- 对每个 boot 组取 cause，计算 calcSleepDuration
- 栈顶元素若是同 cause 的 boot → 合并（wakeCount+=1, sleepTotal+=本次休眠），bootItem 保持较新的
- 否则直接压入结果栈
- process 组直接压入，不参与合并

复杂度 O(n)，一次遍历。

### BootCard 组件变更

摘要行逻辑：

```
未合并 (wakeCount <= 1)：
  唤醒原因 · 休眠 X小时    （和现在一样）

合并后 (wakeCount > 1)：
  唤醒原因 · 休眠 X小时 · 唤醒N次
```

- 唤醒原因取最后一次（bootItem.cause）
- 休眠时长：合并后以 sleepTotal 替代 calcSleepDuration
- 传感器读数：取 bootItem.readings（合并后即为最后一次开机数据）

### 页面入口（logs/[chipId]/page.tsx）

```tsx
// 原：const groups = groupByProcess(logs);
// 改为：
const groups = mergeConsecutiveBoots(groupByProcess(logs), logs);
```

## 测试

`__tests__/watering/log-card-utils.test.ts` 新增 `mergeConsecutiveBoots` 测试用例：

| 场景 | 输入 | 期望 |
|------|------|------|
| 空数组 | [] | [] |
| 单个 boot | 1 条 boot | 原样返回 |
| 连续同 cause boot | 2 条 cause=4 boot | 合并为 1 条，wakeCount=2 |
| cause 不同的 boot | cause=4, cause=2 相邻 | 不合并，各自独立 |
| boot → process → boot（同 cause） | cause=4, process, cause=4 | 合并 2 个 boot，process 保持 |
| sleepTotal 累加 | 各 boot 休眠 3600s, 7200s | sleepTotal = 10800 |
| 传感器数据取最后 | readings 不同 | bootItem.readings = 最后一条 |

## 影响范围

| 文件 | 变更 |
|------|------|
| `app/watering/components/log-card.tsx` | ProcessGroup 新增字段、新增 mergeConsecutiveBoots、BootCard 摘要行逻辑 |
| `app/watering/(subpages)/logs/[chipId]/page.tsx` | 调用链增加 mergeConsecutiveBoots 包装 |
| `__tests__/watering/log-card-utils.test.ts` | 新增 mergeConsecutiveBoots 测试 |

不涉及数据库、API、类型文件修改。
