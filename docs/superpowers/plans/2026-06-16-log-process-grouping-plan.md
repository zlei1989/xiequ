# 日志页面流程分组优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将日志分组从按 stateId 改为按流程（execute 事件边界），开机记录独立展示，负载值格式化美化。

**Architecture:** 纯前端改造。后端只加 7 天过滤；前端替换分组算法 + 新增 BootCard/ProcessCard 组件替代旧的 LogCard。所有现有工具函数保留。

**Tech Stack:** Next.js App Router, antd-mobile, TypeScript, vitest, SQLite (WASM)

---

### Task 1: 后端 — 日志查询加 7 天过滤

**Files:**
- Modify: `app/watering/services/db.ts:457-475`

- [ ] **Step 1: 在 getDeviceLogs 中加 7 天过滤**

在 `app/watering/services/db.ts` 顶部常量区（import 下方）新增常量：

```typescript
/** 日志保留天数 */
const LOG_RETENTION_DAYS = 7;
```

修改 `getDeviceLogs` 函数（第 458-475 行）：

```typescript
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getDeviceLogs(chipId: string, limit = 100) {
  const db = getDb();
  /** 7 天前的 ISO 时间字符串 */
  const since = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.all(
    'SELECT id, chip_id, mac_address, event, state_id, message, state, readings, created_time FROM watering_logs WHERE chip_id = ? AND created_time > ? ORDER BY created_time DESC LIMIT ?',
    [chipId, since, limit],
  ) as unknown as LogRow[];
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    macAddress: row.mac_address ?? undefined,
    event: row.event,
    stateId: row.state_id ?? undefined,
    message: row.message ?? undefined,
    state: parseJSON(row.state, undefined as Record<string, unknown> | undefined),
    readings: parseJSON(row.readings, undefined as { label: string; value: number }[] | undefined),
    createdTime: row.created_time,
  }));
}
```

- [ ] **Step 2: 验证 — 运行现有测试确保无回归**

```bash
npm run test -- --run
```

预期：全部通过（getDeviceLogs 的测试可能依赖 mock，无影响）。

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat: add 7-day retention filter to getDeviceLogs"
```

---

### Task 2: groupByProcess — 测试先行

**Files:**
- Modify: `__tests__/watering/log-card-utils.test.ts`（替换 groupByStateId 测试块，新增 groupByProcess 测试块）
- Modify: `app/watering/components/log-card.tsx`（新增 ProcessGroup 类型、groupByProcess 函数）

- [ ] **Step 1: 在 log-card.tsx 中新增 ProcessGroup 类型**

在 `log-card.tsx` 的 `LogGroup` 类型定义之后，新增：

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
};
```

- [ ] **Step 2: 写 groupByProcess 测试**

在 `log-card-utils.test.ts` 中，将 `groupByStateId` 的 describe 块整个替换为 `groupByProcess` 的测试：

```typescript
// ================================================================
// groupByProcess
// ================================================================

import {
  groupByProcess,
  type ProcessGroup,
} from '@/app/watering/components/log-card';

describe('groupByProcess', () => {
  it('空数组返回空列表', () => {
    expect(groupByProcess([])).toEqual([]);
  });

  it('过滤 heartbeat 事件', () => {
    const logs = [
      makeLog({ event: 'heartbeat', createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ event: 'bootstrap', createdTime: '2026-06-13T10:00:01.000Z' }),
    ];
    const result = groupByProcess(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('boot');
  });

  it('全部 heartbeat 返回空列表', () => {
    const logs = [
      makeLog({ event: 'heartbeat', createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ event: 'heartbeat', createdTime: '2026-06-13T10:00:01.000Z' }),
    ];
    expect(groupByProcess(logs)).toEqual([]);
  });

  it('单个 bootstrap 产生独立开机记录', () => {
    const logs = [
      makeLog({ event: 'bootstrap', createdTime: '2026-06-13T10:00:00.000Z', cause: '4' }),
    ];
    const result = groupByProcess(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('boot');
    expect(result[0]?.bootItem?.event).toBe('bootstrap');
    expect(result[0]?.bootItem?.cause).toBe('4');
  });

  it('bootstrap 永远独立于 execute，不合并', () => {
    const logs = [
      makeLog({ event: 'bootstrap', createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', process: { name: '浇花' } }),
    ];
    const result = groupByProcess(logs);
    // 倒序排列：execute 流程在前，bootstrap 在后
    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe('process');
    expect(result[1]?.type).toBe('boot');
  });

  it('execute 切割新流程组，change 归入当前组', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z', message: '{processName:浇花}...' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:03.000Z', message: '{processName:浇花}...' }),
    ];
    const result = groupByProcess(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('process');
    expect(result[0]?.items).toHaveLength(2);
    expect(result[0]?.endType).toBe('pending'); // 无 finish/terminate
  });

  it('finish 闭合流程组', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z' }),
      makeLog({ event: 'finish', createdTime: '2026-06-13T10:00:05.000Z' }),
    ];
    const result = groupByProcess(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('process');
    expect(result[0]?.endType).toBe('finish');
    expect(result[0]?.items).toHaveLength(2); // change + finish
  });

  it('terminate 闭合流程组', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z' }),
      makeLog({ event: 'terminate', createdTime: '2026-06-13T10:00:05.000Z' }),
    ];
    const result = groupByProcess(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.endType).toBe('terminate');
  });

  it('多条 execute 连续出现，前一个自动闭合为 pending', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', process: { name: '浇花' } }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z' }),
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:05:01.000Z', process: { name: '施肥' } }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:05:02.000Z' }),
      makeLog({ event: 'finish', createdTime: '2026-06-13T10:10:00.000Z' }),
    ];
    const result = groupByProcess(logs);
    // 倒序：施肥在前，浇花在后
    expect(result).toHaveLength(2);
    expect(result[0]?.processName).toBe('施肥');
    expect(result[0]?.endType).toBe('finish');
    expect(result[1]?.processName).toBe('浇花');
    expect(result[1]?.endType).toBe('pending');
  });

  it('卡片倒序排列（最新在前）', () => {
    const logs = [
      makeLog({ event: 'bootstrap', createdTime: '2026-06-13T08:00:00.000Z' }),
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z' }),
      makeLog({ event: 'finish', createdTime: '2026-06-13T10:05:00.000Z' }),
      makeLog({ event: 'bootstrap', createdTime: '2026-06-13T12:00:00.000Z' }),
      makeLog({ event: 'execute', createdTime: '2026-06-13T14:00:01.000Z' }),
      makeLog({ event: 'terminate', createdTime: '2026-06-13T14:05:00.000Z' }),
    ];
    const result = groupByProcess(logs);
    // 倒序：最新的流程卡片在最前
    expect(result[0]?.type).toBe('process');  // 14:00 流程
    expect(result[1]?.type).toBe('boot');      // 12:00 开机
    expect(result[2]?.type).toBe('process');  // 10:00 流程
    expect(result[3]?.type).toBe('boot');      // 08:00 开机
  });

  it('流程内部事件正序排列', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:03.000Z', message: 'step 3' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z', message: 'step 2' }),
      makeLog({ event: 'finish', createdTime: '2026-06-13T10:00:05.000Z' }),
    ];
    const result = groupByProcess(logs);
    const items = result[0]?.items ?? [];
    // 正序：step 2, step 3, finish
    expect(items[0]?.message).toBe('step 2');
    expect(items[1]?.message).toBe('step 3');
    expect(items[2]?.event).toBe('finish');
  });

  it('change 无 execute 前驱时被丢弃', () => {
    const logs = [
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:01.000Z', message: 'orphan' }),
      makeLog({ event: 'bootstrap', createdTime: '2026-06-13T10:00:02.000Z' }),
    ];
    const result = groupByProcess(logs);
    // 只有开机记录，孤儿 change 被丢弃
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('boot');
  });

  it('execute 流程名从 process.name 提取', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', process: { name: '抽水' } }),
    ];
    const result = groupByProcess(logs);
    expect(result[0]?.processName).toBe('抽水');
  });

  it('execute 无 process.name 时从 change 的 processName 提取', () => {
    // 此场景下 processName 在渲染时动态提取，groupByProcess 不负责
    // processName 为 undefined，ProcessCard 渲染时再通过 extractProcessNames 获取
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z' }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z', message: '{processName:浇花}...' }),
    ];
    const result = groupByProcess(logs);
    expect(result[0]?.processName).toBeUndefined();
  });
});
```

- [ ] **Step 3: 运行测试，确认全部失败**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts
```

预期：groupByProcess 相关测试全部 FAIL（groupByProcess 未定义/未导出）。

- [ ] **Step 4: 实现 groupByProcess 函数**

在 `log-card.tsx` 中，`LogGroup` 类型定义之后，新增 `groupByProcess`：

```typescript
/**
 * 按流程分组日志
 *
 * 以 execute 事件为流程切割点，bootstrap 永远独立为开机记录，
 * change/finish/terminate 归入当前流程组。
 * 过滤 heartbeat，卡片倒序（最新在前），卡片内部正序。
 */
export function groupByProcess(logs: LogItem[]): ProcessGroup[] {
  // 过滤 heartbeat
  const filtered = logs.filter((l) => l.event !== 'heartbeat');
  if (filtered.length === 0) return [];

  // 按时间正序排列（输入可能为倒序）
  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
  );

  const groups: ProcessGroup[] = [];
  let currentProcess: ProcessGroup | null = null;

  for (const log of sorted) {
    switch (log.event) {
      case 'bootstrap': {
        // 进程中意外 reboot：先闭合前一个流程为 pending
        if (currentProcess && !currentProcess.endType) {
          currentProcess.endType = 'pending';
          currentProcess = null;
        }
        // 产出一个独立的开机记录
        groups.push({ type: 'boot', bootItem: log, items: [] });
        break;
      }

      case 'execute': {
        // 闭合前一个流程（如果有且未结束）
        if (currentProcess && !currentProcess.endType) {
          currentProcess.endType = 'pending';
        }
        // 提取流程名
        const stateObj = log.state as Record<string, unknown> | undefined;
        const processName =
          log.process?.name ||
          (typeof stateObj?.process === 'object' && stateObj?.process
            ? (stateObj.process as { name?: string }).name
            : undefined);
        // 开始新流程组
        currentProcess = {
          type: 'process',
          processName,
          items: [],
          endType: undefined,
        };
        groups.push(currentProcess);
        break;
      }

      case 'change': {
        // 归属到当前流程组；无前驱 execute 时丢弃
        if (currentProcess) {
          currentProcess.items.push(log);
        }
        break;
      }

      case 'finish': {
        if (currentProcess) {
          currentProcess.items.push(log);
          currentProcess.endType = 'finish';
          currentProcess = null; // 流程结束
        }
        break;
      }

      case 'terminate': {
        if (currentProcess) {
          currentProcess.items.push(log);
          currentProcess.endType = 'terminate';
          currentProcess = null; // 流程结束
        }
        break;
      }

      default:
        // 未知事件类型忽略
        break;
    }
  }

  // 仍有未结束的流程 → 标记为 pending
  if (currentProcess && !currentProcess.endType) {
    currentProcess.endType = 'pending';
  }

  // 倒序：最新卡片在前
  return groups.reverse();
}
```

- [ ] **Step 5: 在 log-card.tsx 的导出列表不动**（导入已通过 import 使用，不用改导出声明；但需确保 `groupByProcess` 被导出）

确认 `groupByProcess` 有 `export` 关键字。

- [ ] **Step 6: 运行测试，确认全部通过**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts
```

预期：全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add __tests__/watering/log-card-utils.test.ts app/watering/components/log-card.tsx
git commit -m "feat: add groupByProcess with tests"
```

---

### Task 3: formatLoadValue — 测试 + 实现

**Files:**
- Modify: `__tests__/watering/log-card-utils.test.ts`（新增测试块）
- Modify: `app/watering/components/log-card.tsx`（新增函数）

- [ ] **Step 1: 写 formatLoadValue 测试**

在 `log-card-utils.test.ts` 末尾新增：

```typescript
// ================================================================
// formatLoadValue
// ================================================================

import { formatLoadValue } from '@/app/watering/components/log-card';

describe('formatLoadValue', () => {
  it('load_0, 192 → "load_0(192)"', () => {
    expect(formatLoadValue('load_0', 192)).toBe('load_0(192)');
  });

  it('load_1, 0 → "load_1(0)"', () => {
    expect(formatLoadValue('load_1', 0)).toBe('load_1(0)');
  });

  it('load_0, null → "load_0(空)"', () => {
    expect(formatLoadValue('load_0', null)).toBe('load_0(空)');
  });

  it('load_1, undefined → "load_1(空)"', () => {
    expect(formatLoadValue('load_1', undefined)).toBe('load_1(空)');
  });

  it('load_3, 48 → "load_3(48)"', () => {
    expect(formatLoadValue('load_3', 48)).toBe('load_3(48)');
  });
});
```

- [ ] **Step 2: 运行测试确认 FAIL**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts -t "formatLoadValue"
```

预期：全部 FAIL。

- [ ] **Step 3: 实现 formatLoadValue**

在 `log-card.tsx` 的辅助函数区域（`calcSleepDuration` 之后）新增：

```typescript
/**
 * 格式化负载值展示
 *
 * load_0, 192  → "load_0(192)"
 * load_0, null → "load_0(空)"
 */
export function formatLoadValue(component: string, value: unknown): string {
  if (value === null || value === undefined) return `${component}(空)`;
  return `${component}(${String(value)})`;
}
```

- [ ] **Step 4: 运行测试确认 PASS**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts -t "formatLoadValue"
```

预期：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add __tests__/watering/log-card-utils.test.ts app/watering/components/log-card.tsx
git commit -m "feat: add formatLoadValue with tests"
```

---

### Task 4: BootCard 组件

**Files:**
- Modify: `app/watering/components/log-card.tsx`（新增 BootCard 组件）

- [ ] **Step 1: 实现 BootCard 组件**

在 `log-card.tsx` 中，`LogCard` 组件之前，新增：

```typescript
/**
 * 开机记录卡片
 *
 * 纯信息展示，不使用 Steps。
 * 显示开机时间、唤醒原因、休眠时长、传感器读数。
 */
export function BootCard({ group, allLogs }: { group: ProcessGroup; allLogs: LogItem[] }) {
  const item = group.bootItem;
  if (!item) return null;

  const causeLabel = formatCause(item.cause);
  const sleepSec = calcSleepDuration(item, allLogs);
  const sleepText = sleepSec >= 60 ? `休眠 ${formatSimpleDuration(sleepSec)}` : '';

  // 描述行：唤醒原因 · 休眠时长
  const descParts: string[] = [];
  if (causeLabel) descParts.push(causeLabel);
  if (sleepText) descParts.push(sleepText);
  const descText = descParts.join(' · ');

  // 传感器读数行
  const readingText =
    item.readings && item.readings.length > 0
      ? item.readings.map((r) => `${r.label}: ${r.value}`).join(' · ')
      : '';

  return (
    <Card
      key={`boot-${item.createdTime}`}
      title={
        <Space align="center">
          <Tag color="success">开机</Tag>
          <span>开机记录</span>
        </Space>
      }
      extra={
        <span className="text-xs text-gray-400">
          {formatTime(item.createdTime)}
        </span>
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

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: add BootCard component for standalone boot records"
```

---

### Task 5: ProcessCard 组件

**Files:**
- Modify: `app/watering/components/log-card.tsx`（新增 ProcessCard 组件）

- [ ] **Step 1: 实现 ProcessCard 组件**

在 `BootCard` 之后，新增：

```typescript
/**
 * 流程卡片
 *
 * 展示一次完整流程执行：摘要行 + Steps 步骤列表 + 结束标记。
 * 缺失 finish/terminate 时显示"进行中"状态。
 */
export function ProcessCard({ group }: { group: ProcessGroup }) {
  if (group.items.length === 0) return null;

  // 流程名：优先 execute 的 process.name，否则从 change 的 processName 提取
  const processName =
    group.processName ||
    (group.items.length > 0 ? extractProcessNames(group.items)[0] : undefined) ||
    '未知流程';

  // 步骤数
  const stepCount = countSteps(group.items);

  // 时间区间
  const firstTime = formatTime(group.items[0]?.createdTime ?? '');
  const lastTime =
    group.endType === 'pending'
      ? '???'
      : formatTime(group.items[group.items.length - 1]?.createdTime ?? '');

  // 用时
  let durationText = '';
  if (group.endType === 'pending') {
    // 已运行时间：最后一条事件到当前时间
    const lastItem = group.items[group.items.length - 1];
    if (lastItem) {
      const elapsed =
        (Date.now() - new Date(lastItem.createdTime).getTime()) / 1000;
      durationText = `已运行 ${formatSimpleDuration(Math.floor(elapsed))}`;
    }
  } else {
    const d = formatDuration(group.items);
    if (d) durationText = `用时 ${d}`;
  }

  // 状态标签
  let statusTag: { label: string; color: string };
  switch (group.endType) {
    case 'finish':
      statusTag = { label: '已完成', color: 'success' };
      break;
    case 'terminate':
      statusTag = { label: '已终止', color: 'warning' };
      break;
    case 'pending':
    default:
      statusTag = { label: '进行中', color: 'warning' };
      break;
  }

  // 摘要行
  const summaryParts: string[] = [];
  summaryParts.push(`${firstTime} ~ ${lastTime}`);
  if (stepCount > 0) summaryParts.push(`${String(stepCount)}个步骤`);
  if (durationText) summaryParts.push(durationText);
  const summaryText = summaryParts.join(' · ');

  // 结束消息
  const lastItem = group.items[group.items.length - 1];
  const endTime = lastItem ? formatTime(lastItem.createdTime) : '';

  return (
    <Card
      extra={<Tag color={statusTag.color}>{statusTag.label}</Tag>}
      title={processName}
    >
      {/* 摘要行 */}
      {summaryText && (
        <div className="mb-2 text-xs text-gray-400">{summaryText}</div>
      )}

      {/* 步骤列表 */}
      <Steps direction="vertical">
        {group.items
          .filter((item) => item.event === 'change')
          .map((item, idx) => {
            const stateObj = item.state as Record<string, unknown> | undefined;
            const type = stateObj?.type;
            const changeType =
              typeof type === 'string' || typeof type === 'number'
                ? String(type)
                : '';
            const component = stateObj?.component;
            const value = stateObj?.value as
              | { begin?: number; end?: number }
              | undefined;
            const interrupts = stateObj?.interrupts as
              | Array<{ name: string; disabled: boolean }>
              | undefined;

            // 负载展示：只显示目标值（end）
            const loadDisplay =
              typeof component === 'string'
                ? formatLoadValue(component, value?.end ?? null)
                : '';

            // 中断描述
            const interruptText =
              interrupts && interrupts.length > 0
                ? `传感器: ${interrupts
                    .map(
                      (ir) =>
                        `${ir.name}${ir.disabled ? '(禁用)' : ''}`,
                    )
                    .join(' · ')}`
                : '';

            return (
              <Steps.Step
                description={
                  <span className="text-[13px] text-gray-700">
                    {item.message ? (
                      formatMessage({ ...item })
                    ) : (
                      loadDisplay
                    )}
                    {loadDisplay && item.message ? (
                      <>
                        {' · '}
                        <span style={{ color: 'var(--adm-color-primary)' }}>
                          {loadDisplay}
                        </span>
                      </>
                    ) : null}
                    {interruptText && (
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {interruptText}
                      </span>
                    )}
                  </span>
                }
                key={`step-${idx}`}
                status={getStepStatus(item.event)}
                title={
                  <Space align="center">
                    {changeType && changeTypeLabels[changeType] ? (
                      <Tag
                        color={
                          (changeTypeColors[changeType] as
                            | 'default'
                            | 'primary'
                            | 'success'
                            | 'warning'
                            | 'danger') || 'default'
                        }
                      >
                        {changeTypeLabels[changeType]}
                      </Tag>
                    ) : (
                      <Tag color="primary">变更</Tag>
                    )}
                    <span className="text-xs text-gray-400">
                      {formatTime(item.createdTime)}
                    </span>
                  </Space>
                }
              />
            );
          })}
      </Steps>

      {/* 结束标记 */}
      <div className="mt-2 text-right text-xs text-gray-400">
        {group.endType === 'finish' && (
          <span>
            流程完成 · {endTime}
          </span>
        )}
        {group.endType === 'terminate' && (
          <span style={{ color: 'var(--adm-color-warning)' }}>
            手动终止 · {endTime}
          </span>
        )}
        {group.endType === 'pending' && (
          <span style={{ color: 'var(--adm-color-warning)' }}>
            缺少完成事件（设备可能断电或离线）
          </span>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: add ProcessCard component with steps display and pending handling"
```

---

### Task 6: 更新 page.tsx

**Files:**
- Modify: `app/watering/(subpages)/logs/[chipId]/page.tsx`

- [ ] **Step 1: 更新导入和渲染逻辑**

修改 `page.tsx`（第 25 行和第 109-117 行）：

```typescript
// 第 25 行：替换导入
import { BootCard, ProcessCard, groupByProcess, type ProcessGroup } from '../../../components/log-card';

// 第 109-117 行：渲染逻辑
const groups: ProcessGroup[] = groupByProcess(logs);
return (
  <PullToRefresh onRefresh={handleRefresh}>
    <List>
      {groups.map((group) =>
        group.type === 'boot' ? (
          <BootCard
            allLogs={logs}
            group={group}
            key={`boot-${group.bootItem?.createdTime ?? ''}`}
          />
        ) : (
          <ProcessCard
            group={group}
            key={`process-${group.items[0]?.createdTime ?? ''}`}
          />
        ),
      )}
    </List>
  </PullToRefresh>
);
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run check
```

修复类型错误（如有）。

- [ ] **Step 3: Commit**

```bash
git add app/watering/\(subpages\)/logs/\[chipId\]/page.tsx
git commit -m "feat: wire BootCard and ProcessCard into log page"
```

---

### Task 7: 清理旧代码

**Files:**
- Modify: `app/watering/components/log-card.tsx`（删除旧函数和组件）
- Modify: `__tests__/watering/log-card-utils.test.ts`（删除旧 groupByStateId 的 import）

- [ ] **Step 1: 删除 log-card.tsx 中的旧代码**

删除以下导出（保留文件中其余函数不变）：
- `LogGroup` 类型（第 74 行）
- `groupByStateId` 函数（第 82-106 行）
- `getGroupStatus` 函数（第 332-339 行）
- `LogCard` 组件（第 376-462 行）
- `hasExecute` 函数（第 215-217 行，如果只被 LogCard/getGroupStatus 使用）

确认以下函数**保留**（被 BootCard/ProcessCard 使用）：
- `formatDuration` → ProcessCard 用时
- `formatSimpleDuration` → BootCard 休眠时长
- `formatSeconds` → parseLogMessage 使用
- `parseLogMessage` → formatMessage 使用
- `formatMessage` → ProcessCard 步骤描述
- `formatCause` → BootCard 唤醒原因
- `extractProcessNames` → ProcessCard 流程名
- `countSteps` → ProcessCard 步骤数
- `calcSleepDuration` → BootCard 休眠时长
- `formatTime` → BootCard/ProcessCard 时间
- `getStepStatus` → ProcessCard 步骤状态
- `changeTypeLabels` / `changeTypeColors` / `eventLabels` / `eventColors` → ProcessCard 标签
- `LogItem` / `ProcessGroup` / `Segment` 类型

- [ ] **Step 2: 更新测试文件 import**

在 `log-card-utils.test.ts` 中，将 import 中的 `groupByStateId` 替换为 `groupByProcess`：

```typescript
// 原：
import { groupByStateId, formatDuration, ... } from '@/app/watering/components/log-card';
// 改：
import { groupByProcess, formatDuration, ... } from '@/app/watering/components/log-card';
```

以及测试文件顶部新增 `formatLoadValue` 的 import（已在 Task 3 中添加）。

- [ ] **Step 3: 运行全部测试**

```bash
npm run test -- --run
```

预期：全部 PASS。

- [ ] **Step 4: 运行格式化和检查**

```bash
npm run format
npm run check
```

修复所有错误。

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/log-card.tsx __tests__/watering/log-card-utils.test.ts
git commit -m "refactor: remove old groupByStateId, LogGroup, LogCard, getGroupStatus"
```

---

### Task 8: 最终验证

- [ ] **Step 1: 运行全部测试**

```bash
npm run test -- --run
```

- [ ] **Step 2: 运行格式化 + 检查**

```bash
npm run format
npm run check
```

- [ ] **Step 3: 如果环境允许，启动开发服务器手动验证**

```bash
npm run dev
```

访问 `/watering/logs/{chipId}` 确认日志页面渲染正常。

- [ ] **Step 4: 最终 commit**

如有未提交的变更：
```bash
git status
git add -A
git commit -m "chore: final cleanup for log process grouping"
```
