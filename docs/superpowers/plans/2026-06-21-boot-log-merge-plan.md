# 开机日志合并优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 合并连续相同唤醒原因的开机日志为一张卡片，摘要展示总休眠时长和唤醒次数。

**Architecture:** 在 `groupByProcess` 之上新增纯函数 `mergeConsecutiveBoots`，对已分组结果按相邻 + 相同 cause 规则合并 boot 组。`BootCard` 根据 `wakeCount` 字段切换摘要展示。页面调用链包装一层即可。

**Tech Stack:** React + TypeScript + vitest

---

### Task 1: ProcessGroup 类型新增字段

**Files:**
- Modify: `app/watering/components/log-card.tsx:71-83`

- [ ] **Step 1: 在 ProcessGroup 类型中新增 wakeCount 和 sleepTotal 可选字段**

```typescript
/** 按流程分组后的组类型 */
export type ProcessGroup = {
  type: 'boot' | 'process';
  /** 开机信息（type='boot' 时必有） */
  bootItem?: LogItem;
  /** 流程名（从 execute 事件 state.process.name 或 change 的 processName 提取） */
  processName?: string;
  /** 流程内的事件（change + finish/terminate），正序 */
  items: LogItem[];
  /** 结束类型：finish=正常完成, terminate=手动终止, pending=缺失结束 */
  endType?: 'finish' | 'terminate' | 'pending';
  /** 触发来源：manual=界面手动，schedule=计划任务，bootstrap=开机执行 */
  trigger?: string;
  /** 合并后唤醒次数（>1 表示合并），仅合并 boot 组 */
  wakeCount?: number;
  /** 合并后总休眠时长（秒），仅合并 boot 组 */
  sleepTotal?: number;
};
```

- [ ] **Step 2: 验证** — 运行 `npm run check`，类型新增不影响现有代码，应通过

- [ ] **Step 3: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: ProcessGroup 新增 wakeCount 和 sleepTotal 字段"
```

---

### Task 2: 实现 mergeConsecutiveBoots

**Files:**
- Modify: `app/watering/components/log-card.tsx`（在 `groupByProcess` 之后插入新函数）
- Test: `__tests__/watering/log-card-utils.test.ts`（新增测试区块）

- [ ] **Step 1: 编写测试**

在 `__tests__/watering/log-card-utils.test.ts` 现有 import 中新增 `mergeConsecutiveBoots`：

```typescript
// 修改现有 import 行，新增 mergeConsecutiveBoots
import {
  groupByProcess,
  mergeConsecutiveBoots,
  formatDuration,
  // ... 其余不变
} from '@/app/watering/components/log-card';
```

在 `import type { LogItem }` 下新增 `import type { ProcessGroup }`：

```typescript
import type { LogItem, ProcessGroup } from '@/app/watering/components/log-card';
```

在文件末尾（`formatLoadValue` describe 块之后）新增测试区块：

```typescript
// ================================================================
// mergeConsecutiveBoots
// ================================================================

/** 构造 ProcessGroup 快捷方法 */
function makeBootGroup(overrides: {
  createdTime?: string;
  cause?: string;
  readings?: { label: string; value: number; unit?: string }[];
} = {}): ProcessGroup {
  return {
    type: 'boot',
    bootItem: {
      event: 'bootstrap',
      createdTime: overrides.createdTime ?? '2026-06-13T10:00:00.000Z',
      cause: overrides.cause ?? '4',
      readings: overrides.readings ?? [{ label: '电压', value: 3.7 }],
    },
    items: [],
  };
}

function makeProcessGroup(createdTime: string): ProcessGroup {
  return {
    type: 'process',
    processName: '浇花',
    items: [
      makeLog({ event: 'execute', createdTime }),
      makeLog({ event: 'change', createdTime, message: '{processName:浇花}...' }),
      makeLog({ event: 'finish', createdTime }),
    ],
    endType: 'finish',
  };
}

describe('mergeConsecutiveBoots', () => {
  it('空数组返回空列表', () => {
    expect(mergeConsecutiveBoots([], [])).toEqual([]);
  });

  it('单个 boot 原样返回', () => {
    const boot = makeBootGroup({ createdTime: '2026-06-13T10:00:00.000Z' });
    const result = mergeConsecutiveBoots([boot], [boot.bootItem!]);
    expect(result).toHaveLength(1);
    expect(result[0]?.wakeCount).toBeUndefined();
    expect(result[0]?.sleepTotal).toBeUndefined();
  });

  it('连续相同 cause 的 2 条 boot 合并为 1 条', () => {
    const boot1 = makeBootGroup({ createdTime: '2026-06-13T11:00:00.000Z', cause: '4' });
    const boot2 = makeBootGroup({ createdTime: '2026-06-13T10:00:00.000Z', cause: '4' });
    const allLogs = [boot1.bootItem!, boot2.bootItem!];
    const result = mergeConsecutiveBoots([boot1, boot2], allLogs);
    expect(result).toHaveLength(1);
    expect(result[0]?.wakeCount).toBe(2);
    expect(result[0]?.sleepTotal).toBeGreaterThan(0);
    // bootItem 保留最新的一条
    expect(result[0]?.bootItem?.createdTime).toBe('2026-06-13T11:00:00.000Z');
  });

  it('cause 不同的 boot 不合并', () => {
    const boot1 = makeBootGroup({ createdTime: '2026-06-13T10:00:01.000Z', cause: '2' });
    const boot2 = makeBootGroup({ createdTime: '2026-06-13T10:00:00.000Z', cause: '4' });
    const allLogs = [boot1.bootItem!, boot2.bootItem!];
    const result = mergeConsecutiveBoots([boot1, boot2], allLogs);
    expect(result).toHaveLength(2);
    expect(result[0]?.wakeCount).toBeUndefined();
    expect(result[1]?.wakeCount).toBeUndefined();
  });

  it('3 条连续相同 cause = 4 全部合并，wakeCount = 3', () => {
    const b1 = makeBootGroup({ createdTime: '2026-06-13T12:00:00.000Z', cause: '4' });
    const b2 = makeBootGroup({ createdTime: '2026-06-13T11:00:00.000Z', cause: '4' });
    const b3 = makeBootGroup({ createdTime: '2026-06-13T10:00:00.000Z', cause: '4' });
    const allLogs = [b1.bootItem!, b2.bootItem!, b3.bootItem!];
    const result = mergeConsecutiveBoots([b1, b2, b3], allLogs);
    expect(result).toHaveLength(1);
    expect(result[0]?.wakeCount).toBe(3);
  });

  it('中间有 process 组时，两侧 boot 不合并', () => {
    const boot1 = makeBootGroup({ createdTime: '2026-06-13T12:00:00.000Z', cause: '4' });
    const proc = makeProcessGroup('2026-06-13T11:30:00.000Z');
    const boot2 = makeBootGroup({ createdTime: '2026-06-13T11:00:00.000Z', cause: '4' });
    const allLogs = [boot1.bootItem!, ...proc.items, boot2.bootItem!];
    const result = mergeConsecutiveBoots([boot1, proc, boot2], allLogs);
    expect(result).toHaveLength(3);
    expect(result[0]?.wakeCount).toBeUndefined();
    expect(result[1]?.type).toBe('process');
    expect(result[2]?.wakeCount).toBeUndefined();
  });

  it('仅 process 组时原样返回', () => {
    const proc = makeProcessGroup('2026-06-13T10:00:00.000Z');
    const result = mergeConsecutiveBoots([proc], proc.items);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('process');
  });

  it('sleepTotal 正确累加各次休眠时长', () => {
    // boot1: 12:00 (上一日志 11:00 → 休眠 3600s)
    // boot2: 11:00 (上一日志 08:00 → 休眠 10800s)
    // sleepTotal = 3600 + 10800 = 14400
    const boot1 = makeBootGroup({ createdTime: '2026-06-13T12:00:00.000Z', cause: '4' });
    const boot2 = makeBootGroup({ createdTime: '2026-06-13T11:00:00.000Z', cause: '4' });
    const prevLog = makeLog({ event: 'finish', createdTime: '2026-06-13T08:00:00.000Z' });
    const allLogs = [boot1.bootItem!, boot2.bootItem!, prevLog];
    const result = mergeConsecutiveBoots([boot1, boot2], allLogs);
    expect(result).toHaveLength(1);
    // boot2 休眠 = 11:00 - 08:00 = 10800s
    // boot1 休眠 = 12:00 - 11:00 = 3600s
    expect(result[0]?.sleepTotal).toBe(14400);
  });

  it('传感器 readings 取最后一次（最新）的数据', () => {
    const boot1 = makeBootGroup({
      createdTime: '2026-06-13T11:00:00.000Z',
      cause: '4',
      readings: [{ label: '电压', value: 4.2 }],
    });
    const boot2 = makeBootGroup({
      createdTime: '2026-06-13T10:00:00.000Z',
      cause: '4',
      readings: [{ label: '电压', value: 3.5 }],
    });
    const allLogs = [boot1.bootItem!, boot2.bootItem!];
    const result = mergeConsecutiveBoots([boot1, boot2], allLogs);
    expect(result).toHaveLength(1);
    expect(result[0]?.bootItem?.readings?.[0]?.value).toBe(4.2);
  });

  it('cause = 0 的 boot 不和 cause = 4 合并', () => {
    const boot1 = makeBootGroup({ createdTime: '2026-06-13T10:00:01.000Z', cause: '0' });
    const boot2 = makeBootGroup({ createdTime: '2026-06-13T10:00:00.000Z', cause: '4' });
    const allLogs = [boot1.bootItem!, boot2.bootItem!];
    const result = mergeConsecutiveBoots([boot1, boot2], allLogs);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts 2>&1 | tail -5
```

Expected: `ReferenceError: mergeConsecutiveBoots is not defined`

- [ ] **Step 3: 实现 mergeConsecutiveBoots 函数**

在 `app/watering/components/log-card.tsx` 的 `groupByProcess` 函数之后、`formatDuration` 之前插入：

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
): ProcessGroup[] {
  /** 合并后的结果栈 */
  const result: ProcessGroup[] = [];

  for (const group of groups) {
    if (group.type !== 'boot') {
      // process 组直接入栈，不参与合并
      result.push(group);
      continue;
    }

    const bootItem = group.bootItem;
    if (!bootItem) {
      // 保护：无 bootItem 的 boot 组原样保留
      result.push(group);
      continue;
    }

    const cause = bootItem.cause;
    /** 本次休眠时长（秒） */
    const sleepSec = calcSleepDuration(bootItem, allLogs);

    // 检查栈顶是否可合并
    const last = result[result.length - 1];
    if (
      last &&
      last.type === 'boot' &&
      last.bootItem?.cause === cause
    ) {
      // 合并到栈顶：wakeCount 累加，sleepTotal 累加，bootItem 保持较新的
      last.wakeCount = (last.wakeCount ?? 1) + 1;
      last.sleepTotal = (last.sleepTotal ?? 0) + sleepSec;
    } else {
      // 不可合并，作为新条目入栈（仅当存在休眠时长时设置 sleepTotal）
      const merged: ProcessGroup = {
        ...group,
        wakeCount: undefined,
        sleepTotal: sleepSec > 0 ? sleepSec : undefined,
      };
      result.push(merged);
    }
  }

  return result;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts
```

Expected: All tests PASS, 包括新增的 `mergeConsecutiveBoots` 用例

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/log-card.tsx __tests__/watering/log-card-utils.test.ts
git commit -m "feat: mergeConsecutiveBoots 合并连续相同 cause 的开机日志"
```

---

### Task 3: BootCard 组件适配合并数据

**Files:**
- Modify: `app/watering/components/log-card.tsx:295-357`

- [ ] **Step 1: 修改 BootCard 摘要行逻辑**

将 `BootCard` 函数体中的描述行逻辑改为使用 `wakeCount` 和 `sleepTotal`：

在 `log-card.tsx` 的 `BootCard` 函数中，替换现有描述行逻辑（第 305-322 行）：

```typescript
export function BootCard({ group, allLogs }: { group: ProcessGroup; allLogs: LogItem[] }) {
  const item = group.bootItem;
  if (!item) return null;

  const causeLabel = formatCause(item.cause);

  // 休眠时长：合并后优先用 sleepTotal，否则用 calcSleepDuration
  const sleepSec = group.sleepTotal ?? calcSleepDuration(item, allLogs);
  const sleepText = sleepSec >= 60 ? `休眠 ${formatSimpleDuration(sleepSec)}` : '';

  // 描述行：唤醒原因 · 休眠时长 · 唤醒N次
  const descParts: string[] = [];
  if (causeLabel) descParts.push(causeLabel);
  if (sleepText) descParts.push(sleepText);
  // 合并后显示唤醒次数
  if (group.wakeCount && group.wakeCount > 1) {
    descParts.push(`唤醒${String(group.wakeCount)}次`);
  }
  // 检测是否有开机执行（bootstrap 后紧跟 trigger='bootstrap' 的 execute 日志）
  const hasBootExec = allLogs.some(
    (log) =>
      log.event === 'execute' &&
      (log.state as Record<string, unknown> | undefined)?.trigger === 'bootstrap' &&
      log.createdTime > item.createdTime &&
      new Date(log.createdTime).getTime() - new Date(item.createdTime).getTime() < 5000,
  );
  if (hasBootExec) descParts.push('开机执行');
  const descText = descParts.join(' · ');

  // 传感器读数行（1 位小数 + 单位）— 取 bootItem（合并后即最后一次数据）
  const readingText =
    item.readings && item.readings.length > 0
      ? item.readings.map((r) => {
        const v = typeof r.value === 'number' ? r.value.toFixed(1) : String(r.value);
        const u = r.unit ?? '';
        return `${r.label}: ${v}${u}`;
      }).join(' · ')
      : '';

  return (
    <Card
      extra={
        <span className="text-xs text-gray-400">
          {formatDateTime(item.createdTime)}
        </span>
      }
      key={`boot-${item.createdTime}`}
      title={
        <Space align="center">
          <Tag color="success">开机</Tag>
          <span>开机记录</span>
        </Space>
      }
    >
      {descText && (
        <div className="mb-1 text-[13px] text-gray-700">{descText}</div>
      )}
      {readingText && (
        <div className="text-xs text-gray-400">{readingText}</div>
      )}
    </Card>
  );
}
```

关键变更点：
- 第 306 行：`sleepSec` 优先取 `group.sleepTotal`，fallback 到 `calcSleepDuration`
- 新增：`wakeCount > 1` 时追加"唤醒N次"
- 其余不变

- [ ] **Step 2: 运行全部测试确认兼容**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts
```

Expected: 所有已有测试 + 新增测试全部 PASS

- [ ] **Step 3: 运行检查**

```bash
npm run check
```

Expected: 类型检查和 lint 通过

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: BootCard 适配合并数据，展示总休眠时长和唤醒次数"
```

---

### Task 4: 页面入口接入合并逻辑

**Files:**
- Modify: `app/watering/(subpages)/logs/[chipId]/page.tsx:108-109`

- [ ] **Step 1: 修改 import 和调用**

在 `page.tsx` 顶部 import 中添加 `mergeConsecutiveBoots`：

```typescript
// 修改现有 import 行
import { BootCard, ProcessCard, groupByProcess, mergeConsecutiveBoots, type ProcessGroup } from '../../../components/log-card';
```

修改分组调用（第 109 行）：

```typescript
// 原：
const groups: ProcessGroup[] = groupByProcess(logs);
// 改为：
const groups: ProcessGroup[] = mergeConsecutiveBoots(groupByProcess(logs), logs);
```

- [ ] **Step 2: 运行检查**

```bash
npm run check
```

Expected: 类型检查和 lint 通过

- [ ] **Step 3: 运行全部测试**

```bash
npx vitest run
```

Expected: 全部测试 PASS

- [ ] **Step 4: Commit**

```bash
git add app/watering/\(subpages\)/logs/\[chipId\]/page.tsx
git commit -m "feat: 日志页接入 mergeConsecutiveBoots 合并相同 cause 开机记录"
```

---

## 影响范围总结

| 文件 | 变更 |
|------|------|
| `app/watering/components/log-card.tsx` | ProcessGroup 新增 wakeCount/sleepTotal、新增 mergeConsecutiveBoots 函数、BootCard 适配 |
| `app/watering/(subpages)/logs/[chipId]/page.tsx` | import + 一行调用链变更 |
| `__tests__/watering/log-card-utils.test.ts` | 新增 mergeConsecutiveBoots 测试（10 个用例） |

不涉及数据库、API、其他组件。
