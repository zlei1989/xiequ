# 浇水日志页 antd-mobile 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app/watering/logs/[chipId]/page.tsx` 从 antd 迁移到 antd-mobile，引入 PullToRefresh + Steps + Card 布局

**Architecture:** SafeArea → NavBar → PullToRefresh → 状态分发 (DotLoading / ErrorBlock / LogViewer) → LogViewer 内用 Space+Card+Steps 渲染事件时间线

**Tech Stack:** Next.js 16 App Router, React 19, antd-mobile 5, TypeScript, Tailwind CSS, vitest

---

### Task 1: 工具函数单元测试

**Files:**
- Create: `__tests__/watering/log-viewer-utils.test.ts`
- Modify: `app/watering/hooks/use-device-logs.ts:22-33` (在 load 中添加 error 状态)
- Reference: `app/watering/components/log-viewer.tsx` (现有函数签名)

- [ ] **Step 1: 给 `useDeviceLogs` hook 添加 `error` 状态**

在 `app/watering/hooks/use-device-logs.ts` 中添加 error state，使页面能展示加载失败状态：

```typescript
/**
 * 设备日志管理 Hook
 *
 * 提供日志加载和清空功能。
 * 与 useDevices 不同，日志不自动轮询（数据量大），需手动 load。
 */

'use client';

import { useState, useCallback } from 'react';

import { clearLogs } from '../actions/clear-logs';
import { getLogs } from '../actions/get-logs';

import type { LogItem } from '../components/log-viewer';

/** 设备日志管理 */
export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLogs(chipId);
      setLogs(data);
    } catch (err) {
      console.error('[Watering] 加载设备日志失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const clear = useCallback(async () => {
    try {
      await clearLogs(chipId);
      setLogs([]);
      setError(null);
    } catch (err) {
      console.error('[Watering] 清空设备日志失败:', { chipId, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err; // 向上抛出让 page 处理 Toast
    }
  }, [chipId]);

  return { logs, loading, error, load, clear };
}
```

- [ ] **Step 2: 检查 hook 类型导出完整性**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -i "use-device-logs\|useDeviceLogs"`
Expected: 无输出（无类型错误）

- [ ] **Step 3: 编写工具函数单元测试**

创建 `__tests__/watering/log-viewer-utils.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';

// 直接从 log-viewer 导入纯函数（无副作用）
import {
  groupByStateId,
  formatDuration,
  formatMessage,
} from '@/app/watering/components/log-viewer';

import type { LogItem } from '@/app/watering/components/log-viewer';

// ── 辅助工厂函数 ──

function makeLog(overrides: Partial<LogItem> = {}): LogItem {
  return {
    event: 'execute',
    createdTime: '2026-06-13T10:00:00.000Z',
    stateId: 'state_001',
    ...overrides,
  };
}

// ── groupByStateId ──

describe('groupByStateId', () => {
  it('空数组返回空列表', () => {
    expect(groupByStateId([])).toEqual([]);
  });

  it('单组单条日志直接返回一组', () => {
    const logs = [makeLog({ stateId: 'abc' })];
    const result = groupByStateId(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.stateId).toBe('abc');
    expect(result[0]?.items).toHaveLength(1);
  });

  it('多条同 stateId 归入同组，组内按时间正序', () => {
    const logs = [
      makeLog({ stateId: 'abc', createdTime: '2026-06-13T10:00:02.000Z', event: 'finish' }),
      makeLog({ stateId: 'abc', createdTime: '2026-06-13T10:00:00.000Z', event: 'bootstrap' }),
      makeLog({ stateId: 'abc', createdTime: '2026-06-13T10:00:01.000Z', event: 'execute' }),
    ];
    const result = groupByStateId(logs);
    expect(result).toHaveLength(1);
    const events = result[0]?.items.map((i) => i.event);
    expect(events).toEqual(['bootstrap', 'execute', 'finish']);
  });

  it('不同 stateId 分组，组间按最新事件倒序', () => {
    const logs = [
      // 组 A：最新 10:05
      makeLog({ stateId: 'old', createdTime: '2026-06-13T10:05:00.000Z', event: 'finish' }),
      makeLog({ stateId: 'old', createdTime: '2026-06-13T10:00:00.000Z', event: 'bootstrap' }),
      // 组 B：最新 10:10 — 应排在前面
      makeLog({ stateId: 'new', createdTime: '2026-06-13T10:10:00.000Z', event: 'finish' }),
      makeLog({ stateId: 'new', createdTime: '2026-06-13T10:08:00.000Z', event: 'bootstrap' }),
    ];
    const result = groupByStateId(logs);
    expect(result).toHaveLength(2);
    expect(result[0]?.stateId).toBe('new');  // 最新组在前
    expect(result[1]?.stateId).toBe('old');
  });

  it('缺失 stateId 归入 _unknown 组', () => {
    const logs = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z', event: 'heartbeat' }),
    ];
    // 移除 stateId 字段模拟缺失
    const logWithoutStateId = { ...logs[0] } as Partial<LogItem>;
    delete logWithoutStateId.stateId;
    const result = groupByStateId([logWithoutStateId as LogItem]);
    expect(result).toHaveLength(1);
    expect(result[0]?.stateId).toBe('_unknown');
  });
});

// ── formatDuration ──

describe('formatDuration', () => {
  it('少于 2 条返回空字符串', () => {
    expect(formatDuration([makeLog()])).toBe('');
    expect(formatDuration([])).toBe('');
  });

  it('小于 60 秒仅显示秒数', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:00:45.000Z' }),
    ];
    expect(formatDuration(items)).toBe('45秒');
  });

  it('60~3600 秒以分秒格式显示', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:05:30.000Z' }),
    ];
    expect(formatDuration(items)).toBe('5分30秒');
  });

  it('超过 3600 秒以时分秒格式显示', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T12:05:30.000Z' }),
    ];
    expect(formatDuration(items)).toBe('2时5分30秒');
  });
});

// ── formatMessage ──

describe('formatMessage', () => {
  it('有 message 字段时优先返回 message', () => {
    const log = makeLog({ event: 'execute', message: '自定义消息' });
    expect(formatMessage(log)).toBe('自定义消息');
  });

  it('bootstrap 事件格式化', () => {
    const log = makeLog({ event: 'bootstrap' });
    expect(formatMessage(log)).toBe('设备开机');
  });

  it('execute 事件带 process.name', () => {
    const log = makeLog({
      event: 'execute',
      process: { name: '浇水' },
    });
    expect(formatMessage(log)).toBe('执行流程: 浇水');
  });

  it('execute 事件无 process 对象', () => {
    const log = makeLog({ event: 'execute' });
    expect(formatMessage(log)).toBe('执行流程');
  });

  it('terminate 事件格式化', () => {
    const log = makeLog({ event: 'terminate' });
    expect(formatMessage(log)).toBe('终止流程');
  });

  it('finish 事件格式化', () => {
    const log = makeLog({ event: 'finish' });
    expect(formatMessage(log)).toBe('完成流程');
  });

  it('offline 事件格式化', () => {
    const log = makeLog({ event: 'offline' });
    expect(formatMessage(log)).toBe('设备离线');
  });

  it('未知事件类型返回事件名原文', () => {
    const log = makeLog({ event: 'unknown_event' });
    expect(formatMessage(log)).toBe('unknown_event');
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run __tests__/watering/log-viewer-utils.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app/watering/hooks/use-device-logs.ts __tests__/watering/log-viewer-utils.test.ts
git commit -m "feat(watering): useDeviceLogs 添加 error 状态 + 工具函数单元测试"
```

---

### Task 2: 重写 LogViewer 组件（Steps + Card + Space）

**Files:**
- Modify: `app/watering/components/log-viewer.tsx` (完整重写)

- [ ] **Step 1: 重写 log-viewer.tsx**

将 `app/watering/components/log-viewer.tsx` 替换为以下内容：

```typescript
/**
 * 日志查看器 — 用 antd-mobile Steps + Card + Space 展示 IoT 通信日志
 *
 * 每个 stateId 组为一个 Card，组内每条事件为一个 Steps.Step。
 * 保留原有的分组、排序、格式化逻辑。
 */

'use client';

import { Card, Space, Steps, Tag, ErrorBlock } from 'antd-mobile';

/** ── 常量 ── */

const eventLabels: Record<string, string> = {
  bootstrap: '开机',
  execute: '执行',
  finish: '完成',
  terminate: '终止',
  change: '变更',
  heartbeat: '心跳',
  offline: '离线',
};

const eventColors: Record<string, string> = {
  bootstrap: 'success',
  execute: 'warning',
  finish: 'success',
  terminate: 'danger',
  change: 'primary',
  heartbeat: 'default',
  offline: 'default',
};

/** ── 类型 ── */

export type LogItem = {
  event: string;
  createdTime: string;
  state?: unknown;
  stateId?: string;
  message?: string;
  process?: { name?: string };
  cause?: string;
};

/** ── 工具函数 ── */

/**
 * 按 stateId 分组，每组按时间排序
 * 组内按时间正序，组间按最新一条时间倒序（最新的组在前）
 */
export function groupByStateId(logs: LogItem[]): Array<{ stateId: string; items: LogItem[] }> {
  const map: Record<string, LogItem[]> = {};
  for (const log of logs) {
    const key = log.stateId || '_unknown';
    if (!map[key]) map[key] = [];
    map[key]!.push(log);
  }
  // 组内按时间正序
  for (const key of Object.keys(map)) {
    const bucket = map[key];
    if (bucket) {
      bucket.sort(
        (a, b) =>
          new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
      );
    }
  }
  // 组间按最新一条时间倒序（最新的组在前）
  return Object.entries(map)
    .map(([stateId, items]) => ({ stateId, items }))
    .sort((a, b) => {
      const lastA = new Date(a.items[a.items.length - 1]?.createdTime ?? 0).getTime();
      const lastB = new Date(b.items[b.items.length - 1]?.createdTime ?? 0).getTime();
      return lastB - lastA;
    });
}

/** 计算用时 */
export function formatDuration(items: LogItem[]): string {
  if (items.length < 2) return '';
  const begin = new Date(items[0]?.createdTime ?? 0).getTime();
  const end = new Date(items[items.length - 1]?.createdTime ?? 0).getTime();
  const seconds = Math.round((end - begin) / 1000);
  if (seconds > 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h)}时${String(m)}分${String(s)}秒`;
  }
  if (seconds > 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m)}分${String(s)}秒`;
  }
  return `${String(seconds)}秒`;
}

/** 判断是否包含执行事件 */
function hasExecute(items: LogItem[]): boolean {
  return items.some((item) => item.event === 'execute' || item.event === 'change');
}

/**
 * 格式化日志消息
 * 优先使用 item.message，否则根据事件类型生成中文描述
 */
export function formatMessage(item: LogItem): string {
  if (item.message) return item.message;
  switch (item.event) {
    case 'bootstrap':
      return `设备${item.cause ? `(原因:${item.cause})` : ''}开机`;
    case 'execute':
      return `执行流程${item.process?.name ? `: ${item.process.name}` : ''}`;
    case 'terminate':
      return '终止流程';
    case 'finish':
      return '完成流程';
    case 'offline':
      return '设备离线';
    default:
      return item.event;
  }
}

/**
 * 判定事件对应的 Step status
 *
 * - 正常结束类事件 → finish
 * - 异常中断类事件 → error
 * - 心跳等持续类事件 → wait
 */
function getStepStatus(event: string): 'wait' | 'finish' | 'error' {
  switch (event) {
    case 'bootstrap':
    case 'execute':
    case 'finish':
    case 'change':
      return 'finish';
    case 'terminate':
    case 'offline':
      return 'error';
    case 'heartbeat':
      return 'wait';
    default:
      return 'finish';
  }
}

/**
 * 判定组的整体状态
 *
 * 包含 finish/execute 且不含 offline/terminate → 已完成
 * 其他 → 异常
 */
function getGroupStatus(items: LogItem[]): { status: 'finish' | 'error'; label: string; color: string } {
  const hasFinish = items.some((i) => i.event === 'finish' || i.event === 'execute');
  const hasAbnormal = items.some((i) => i.event === 'offline' || i.event === 'terminate');
  if (hasFinish && !hasAbnormal) {
    return { status: 'finish', label: '已完成', color: 'success' };
  }
  return { status: 'error', label: '异常', color: 'danger' };
}

/** 格式化时间为 HH:MM:SS */
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** ── 组件 ── */

export function LogViewer({ logs }: { logs: LogItem[] }) {
  if (logs.length === 0) {
    return (
      <ErrorBlock
        status="empty"
        title="暂无日志"
      />
    );
  }

  const groups = groupByStateId(logs);

  return (
    <Space direction="vertical" block>
      {groups.map((group) => {
        const groupStatus = getGroupStatus(group.items);
        const duration = hasExecute(group.items) ? formatDuration(group.items) : null;

        return (
          <Card
            key={group.stateId}
            title={
              <Space align="center">
                <span className="text-sm font-medium">
                  stateId: {group.stateId}
                </span>
                <Tag color={groupStatus.color} fill="solid">
                  {groupStatus.label}
                </Tag>
              </Space>
            }
          >
            <Steps direction="vertical">
              {group.items.map((item, idx) => (
                <Steps.Step
                  key={`${group.stateId}-${idx}`}
                  title={
                    <Space align="center">
                      <Tag color={eventColors[item.event] || 'default'} fill="solid">
                        {eventLabels[item.event] || item.event}
                      </Tag>
                      <span className="text-xs text-gray-400">
                        {formatTime(item.createdTime)}
                      </span>
                    </Space>
                  }
                  description={
                    <span className="text-[13px] text-gray-700">
                      {formatMessage(item)}
                    </span>
                  }
                  status={getStepStatus(item.event)}
                />
              ))}
            </Steps>
            {duration && (
              <div className="mt-2 flex justify-end text-xs text-gray-400">
                用时 {duration}
              </div>
            )}
          </Card>
        );
      })}
    </Space>
  );
}
```

- [ ] **Step 2: 运行测试确认现有逻辑未被破坏**

Run: `npx vitest run __tests__/watering/log-viewer-utils.test.ts`
Expected: 全部 PASS（函数签名未变，测试应继续通过）

- [ ] **Step 3: 检查 TypeScript 类型**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无新增类型错误

- [ ] **Step 4: 提交**

```bash
git add app/watering/components/log-viewer.tsx
git commit -m "refactor(watering): LogViewer 迁移到 antd-mobile Steps+Card+Space 布局"
```

---

### Task 3: 重写日志页（NavBar + PullToRefresh）

**Files:**
- Modify: `app/watering/logs/[chipId]/page.tsx` (完整重写)

- [ ] **Step 1: 重写 page.tsx**

将 `app/watering/logs/[chipId]/page.tsx` 替换为以下内容：

```typescript
/**
 * 设备日志页
 *
 * 展示设备 IoT 通信日志，支持下拉刷新和清空。
 * 使用 antd-mobile NavBar + PullToRefresh + ErrorBlock 构建移动端友好界面。
 * 日志数据由 services/db.ts 存储，不自动轮询。
 */

'use client';

import {
  NavBar,
  PullToRefresh,
  DotLoading,
  ErrorBlock,
  SafeArea,
  Dialog,
  Toast,
} from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

import { LogViewer } from '../../components/log-viewer';
import { useDeviceLogs } from '../../hooks/use-device-logs';

/** 设备日志页 */
export default function DeviceLogsPage({
  params,
}: {
  /** Next.js 15 将动态路由参数以 Promise 形式传递，需 use() 解包 */
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, error, load, clear } = useDeviceLogs(chipId);

  // 组件挂载时加载日志
  useEffect(() => {
    void load();
  }, [load]);

  /** 清空日志：弹窗确认 → 执行清空 → Toast 提示 */
  async function handleClear() {
    const confirmed = await Dialog.confirm({
      title: '确认清空日志？',
      content: '操作不可撤销',
    });
    if (!confirmed) return;

    try {
      await clear();
      Toast.show({ icon: 'success', content: '日志已清空' });
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '清空日志失败';
      console.error('[Watering] 清空日志失败:', { chipId, message, stack: err instanceof Error ? err.stack : undefined });
      Toast.show({ icon: 'fail', content: message });
    }
  }

  /** 渲染内容区：按状态分发 */
  function renderContent() {
    // 首次加载中
    if (loading && logs.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <DotLoading />
        </div>
      );
    }

    // 首次加载失败
    if (error && logs.length === 0) {
      return (
        <ErrorBlock
          status="default"
          title="加载失败"
          description={error.message}
        >
          <a onClick={() => { void load(); }}>点击重试</a>
        </ErrorBlock>
      );
    }

    // 空数据
    if (!loading && logs.length === 0) {
      return (
        <ErrorBlock
          status="empty"
          title="暂无日志"
        />
      );
    }

    // 有日志数据 — 下拉刷新包裹
    return (
      <PullToRefresh onRefresh={load}>
        <LogViewer logs={logs} />
      </PullToRefresh>
    );
  }

  return (
    <SafeArea position="top">
      <NavBar
        onBack={() => { router.back(); }}
        right={
          <DeleteOutline
            fontSize={22}
            className="text-gray-500"
            onClick={() => { void handleClear(); }}
          />
        }
      >
        设备: {chipId}
      </NavBar>
      {renderContent()}
    </SafeArea>
  );
}
```

- [ ] **Step 2: 检查 TypeScript 类型**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: 无新增类型错误

- [ ] **Step 3: 检查 antd-mobile-icons 是否已安装**

Run: `node -e "require('antd-mobile-icons')" 2>&1`
Expected: 无错误输出（模块存在）

- [ ] **Step 4: ESLint 检查**

Run: `npx eslint app/watering/logs/\[chipId\]/page.tsx --max-warnings=0 2>&1`
Expected: 无错误/警告

- [ ] **Step 5: 提交**

```bash
git add app/watering/logs/\[chipId\]/page.tsx
git commit -m "refactor(watering): 日志页迁移到 antd-mobile NavBar+PullToRefresh+ErrorBlock"
```

---

### Task 4: 格式化、全量检查、手动验证

**Files:**
- 无新建/修改文件（本任务为验证阶段）

- [ ] **Step 1: ESLint + Stylelint 自动修复**

Run: `npm run format 2>&1`
Expected: 无 error（warnings 由 format 自动修复）

- [ ] **Step 2: TypeScript 全量类型检查 + Lint 检查**

Run: `npm run check 2>&1`
Expected: 零错误

- [ ] **Step 3: 全量单元测试**

Run: `npm run test 2>&1`
Expected: 全部 PASS（包括新增的 log-viewer-utils 测试）

- [ ] **Step 4: 追加验证 — 确认 antd 已从日志相关文件中彻底移除**

Run: `grep -r "from 'antd'" app/watering/logs/ app/watering/components/log-viewer.tsx app/watering/hooks/use-device-logs.ts 2>&1`
Expected: 无输出（无匹配）

- [ ] **Step 5: 启动开发服务器手动验证**

Run: `npm run dev 2>&1` （后台启动并等待就绪）

然后在浏览器中访问日志页面（选择一个已有 device 的 chipId），验证：
- 页面使用 NavBar 导航（左侧返回，右侧清空图标）
- 无日志时显示 ErrorBlock "暂无日志"
- 有日志时显示 Card + Steps 时间线布局
- 下拉触发刷新动画
- 点击清空按钮弹出 Dialog 确认 → 清空后显示 Toast → 自动刷新
- 各组按时间倒序排列，组内事件正序
- 组状态标签正确（已完成/异常）
- 所有日志事件都从 antd-mobile 组件渲染，无 antd 残骸

Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: 格式化 + 全量检查通过，确认日志页 antd 已全部移除"
```
