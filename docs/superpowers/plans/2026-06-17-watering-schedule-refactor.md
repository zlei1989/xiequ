# 浇花定时任务重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构浇花定时任务，将循环类型改为单次/天/分钟/星期四种，增加开始时间和循环时间字段，实现服务端全类型触发逻辑，完善列表描述。

**Architecture:** 保持扁平 ScheduleConfig 类型 + 可选字段模式，UI 按类型条件渲染表单字段，服务端在现有 switch-case 中扩展新类型分支。不考虑旧数据兼容。

**Tech Stack:** TypeScript, Next.js App Router, antd-mobile, dayjs, vitest

---

### Task 1: 更新 ScheduleConfig 类型定义

**Files:**
- Modify: `app/watering/types.ts:59-73`

- [ ] **Step 1: 替换 ScheduleConfig 类型定义**

将 `app/watering/types.ts` 中的 `ScheduleConfig` 替换为：

```typescript
/** 定时任务 — 按循环类型触发指定流程 */
export type ScheduleConfig = {
  key?: string;
  /** 循环类型：once=单次, day=按天, minute=按分钟, week=按星期 */
  type: 'once' | 'day' | 'minute' | 'week';
  /** 开始时间（Unix 时间戳 ms）
   *  - once: 执行时间
   *  - day/week: 启用日期（此日期起生效）
   *  - minute: 首次执行时间 */
  startTime: number;
  /** 循环时间（距 00:00 毫秒偏移）— 仅 day/week 类型，表示每天/每周几的触发时刻 */
  value?: number;
  /** 间隔数 — day: 间隔天数(0=每天, 1=隔天), minute: 间隔分钟数(最小30) */
  interval?: number;
  /** 星期几 (1=周一...7=周日) — 仅 week 类型 */
  week?: number;
  /** 要触发的流程索引 */
  process: number;
  /** 是否禁用（单次任务执行后自动设为 true） */
  disabled?: boolean;
};
```

- [ ] **Step 2: 运行类型检查，确认编译错误符合预期**

Run: `npx tsc --noEmit 2>&1 | head -50`

预期有编译错误出现在以下文件（因为旧字段/类型值被移除）：
- `schedule-config-picker.tsx` — `TYPE_OPTIONS` 使用旧类型值
- `device-config-form.tsx` — `addSchedule` 使用旧字段
- `format-desc.ts` — `formatScheduleDesc` 使用旧字段
- `get-state/route.ts` — 使用旧字段
- 各测试文件

这是正常的，后续 Task 会逐一修复。

- [ ] **Step 3: 提交**

```bash
git add app/watering/types.ts
git commit -m "refactor: 更新 ScheduleConfig 类型定义，支持单次/天/分钟/星期循环类型"
```

---

### Task 2: 重构 format-desc.ts — formatScheduleTitle + formatScheduleDesc

**Files:**
- Modify: `app/watering/utils/format-desc.ts:83-105`
- Modify: `__tests__/watering/format-desc.test.ts:158-188`

- [ ] **Step 1: 编写 formatScheduleTitle 和 formatScheduleDesc 的失败测试**

在 `__tests__/watering/format-desc.test.ts` 中，替换整个 `formatScheduleDesc` describe 块为：

```typescript
import {
  formatMs,
  formatStepDesc,
  formatInterruptDesc,
  formatScheduleDesc,
  formatScheduleTitle,
  formatProcessDesc,
  formatSensorDesc,
} from '@/app/watering/utils/format-desc';
```

替换 `formatScheduleDesc` describe 块：

```typescript
// ================================================================
// formatScheduleTitle
// ================================================================

describe('formatScheduleTitle', () => {
  const processes: ProcessConfig[] = [
    { name: '浇灌', steps: [] },
  ];

  it('once 类型 — 显示"单次 · yyyy-MM-dd HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'once', startTime: new Date('2026-06-17T08:30:00+08:00').getTime(), process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('单次 · 2026-06-17 08:30');
  });

  it('day 类型 interval=0 — 显示"每天 HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: Date.now(), value: 8 * 3600000 + 30 * 60000, interval: 0, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每天 08:30');
  });

  it('day 类型 interval=2 — 显示"每隔2天 HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: Date.now(), value: 14 * 3600000, interval: 2, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每隔2天 14:00');
  });

  it('minute 类型 — 显示"每隔N分钟"', () => {
    const sch: ScheduleConfig = { type: 'minute', startTime: Date.now(), interval: 30, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每隔30分钟');
  });

  it('week 类型 — 显示"每周X HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'week', startTime: Date.now(), week: 1, value: 8 * 3600000, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每周一 08:00');
  });

  it('week 类型周日 — 显示"每周日"', () => {
    const sch: ScheduleConfig = { type: 'week', startTime: Date.now(), week: 7, value: 18 * 3600000, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每周日 18:00');
  });
});

// ================================================================
// formatScheduleDesc
// ================================================================

describe('formatScheduleDesc', () => {
  const processes: ProcessConfig[] = [
    { name: '浇灌', steps: [] },
    { name: '施肥', steps: [] },
  ];

  it('once 类型 — 仅显示流程名', () => {
    const sch: ScheduleConfig = { type: 'once', startTime: new Date('2026-06-17T08:30:00+08:00').getTime(), process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌');
  });

  it('day 类型 — 显示流程名 + 开始日期', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), value: 28800000, interval: 0, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 开始 2026-06-17');
  });

  it('minute 类型 — 显示流程名 + 开始日期时间', () => {
    const sch: ScheduleConfig = { type: 'minute', startTime: new Date('2026-06-17T10:00:00+08:00').getTime(), interval: 30, process: 1 };
    expect(formatScheduleDesc(sch, processes)).toBe('施肥 · 开始 2026-06-17 10:00');
  });

  it('week 类型 — 显示流程名 + 开始日期', () => {
    const sch: ScheduleConfig = { type: 'week', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), week: 1, value: 28800000, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 开始 2026-06-17');
  });

  it('已禁用 — 追加【已禁用】', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), value: 28800000, interval: 0, process: 0, disabled: true };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 开始 2026-06-17 · 【已禁用】');
  });

  it('process 索引越界时不显示流程名', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), value: 28800000, interval: 0, process: 99 };
    expect(formatScheduleDesc(sch, processes)).toBe('开始 2026-06-17');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run __tests__/watering/format-desc.test.ts`

预期：FAIL — `formatScheduleTitle` 未导出

- [ ] **Step 3: 实现 formatScheduleTitle 和重构 formatScheduleDesc**

替换 `app/watering/utils/format-desc.ts` 中 `formatScheduleDesc` 函数（第 83-105 行），并在其后添加 `formatScheduleTitle`：

```typescript
/** 星期中文映射（1=周一...7=周日） */
const WEEKDAY_LABELS: Record<number, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '日',
};

/**
 * 生成定时任务列表标题
 * 格式按类型：单次 · yyyy-MM-dd HH:mm / 每天 HH:mm / 每隔N天 HH:mm / 每隔N分钟 / 每周X HH:mm
 */
export function formatScheduleTitle(sch: ScheduleConfig, _processes: ProcessConfig[]): string {
  switch (sch.type) {
    case 'once':
      return `单次 · ${dayjs(sch.startTime).format('YYYY-MM-DD HH:mm')}`;
    case 'day': {
      const timeStr = dayjs().startOf('day').add(sch.value ?? 0, 'millisecond').format('HH:mm');
      return sch.interval && sch.interval > 0
        ? `每隔${sch.interval}天 ${timeStr}`
        : `每天 ${timeStr}`;
    }
    case 'minute':
      return `每隔${sch.interval ?? 30}分钟`;
    case 'week': {
      const weekLabel = WEEKDAY_LABELS[sch.week ?? 1] ?? '一';
      const timeStr = dayjs().startOf('day').add(sch.value ?? 0, 'millisecond').format('HH:mm');
      return `每周${weekLabel} ${timeStr}`;
    }
  }
}

/**
 * 生成定时任务列表描述
 * 格式：流程名 · 开始 yyyy-MM-dd[ HH:mm]【已禁用】
 * once 类型不显示"开始"（标题已含完整时间），minute 类型"开始"含时间。
 */
export function formatScheduleDesc(sch: ScheduleConfig, processes: ProcessConfig[]): string {
  const parts: string[] = [];

  const proc = sch.process < processes.length ? processes[sch.process] : undefined;
  if (proc?.name) {
    parts.push(proc.name);
  }

  // once 不显示"开始"（标题已含完整时间）
  if (sch.type !== 'once') {
    if (sch.type === 'minute') {
      // minute 类型"开始"含日期和时间
      parts.push(`开始 ${dayjs(sch.startTime).format('YYYY-MM-DD HH:mm')}`);
    } else {
      // day/week 类型只显示日期
      parts.push(`开始 ${dayjs(sch.startTime).format('YYYY-MM-DD')}`);
    }
  }

  if (sch.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}
```

同时确保文件顶部有 `import dayjs from 'dayjs';`（如果尚不存在则添加）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run __tests__/watering/format-desc.test.ts`

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add app/watering/utils/format-desc.ts __tests__/watering/format-desc.test.ts
git commit -m "refactor: 重构 formatScheduleTitle + formatScheduleDesc，支持新循环类型描述"
```

---

### Task 3: 重构 ScheduleConfigPicker UI

**Files:**
- Modify: `app/watering/components/schedule-config-picker.tsx`
- Modify: `__tests__/watering/components/schedule-editor.test.tsx`

- [ ] **Step 1: 更新 schedule-editor 测试**

替换 `__tests__/watering/components/schedule-editor.test.tsx` 全部内容：

```typescript
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ScheduleConfigPicker } from '@/app/watering/components/schedule-config-picker';
import type { ScheduleConfig } from '@/app/watering/types';

const defaultSchedule: ScheduleConfig = {
  type: 'day',
  startTime: new Date('2026-06-17T00:00:00+08:00').getTime(),
  value: 28800000,
  interval: 0,
  process: 0,
};

const mockProcesses = [
  { name: '浇水流程' },
  { name: '施肥流程' },
];

describe('ScheduleConfigPicker', () => {
  it('渲染循环类型选择器', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={defaultSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('天')).toBeDefined();
  });

  it('day 类型渲染间隔 Stepper', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={defaultSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const steppers = screen.getAllByRole('button', { name: /加|减/ });
    expect(steppers.length).toBeGreaterThan(0);
  });

  it('渲染禁用任务开关（改名为"禁用任务"）', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={{ ...defaultSchedule, disabled: false }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('禁用任务')).toBeDefined();
  });

  it('minute 类型不显示循环时间字段', () => {
    const minuteSchedule: ScheduleConfig = {
      type: 'minute',
      startTime: Date.now(),
      interval: 30,
      process: 0,
    };
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={minuteSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText('循环时间')).toBeNull();
  });

  it('week 类型显示星期字段', () => {
    const weekSchedule: ScheduleConfig = {
      type: 'week',
      startTime: Date.now(),
      week: 1,
      value: 28800000,
      process: 0,
    };
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={weekSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('星期')).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run __tests__/watering/components/schedule-editor.test.tsx`

预期：FAIL — 旧 ScheduleConfigPicker 与新 ScheduleConfig 类型不匹配

- [ ] **Step 3: 重写 ScheduleConfigPicker**

替换 `app/watering/components/schedule-config-picker.tsx` 全部内容：

```typescript
/**
 * 定时任务配置 Picker — 按循环类型编辑触发条件、时间、执行流程
 *
 * 根据循环类型（once/day/minute/week）条件渲染不同表单字段。
 * 循环时间用 Picker 实现小时+分钟两列选择，值存储为距 00:00 毫秒偏移。
 * 切换类型时保留 process 和 disabled，重置其余字段为默认值。
 */

'use client';

import { Stepper, Switch, Picker, Selector, DatePicker, Popup, NavBar, Form, Dialog, Button } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { DeleteOutline } from 'antd-mobile-icons';
import dayjs from 'dayjs';
import React, { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';

import type { ScheduleConfig } from '../types';

/** 循环类型选项 */
const TYPE_OPTIONS = [
  { label: '单次', value: 'once' },
  { label: '天', value: 'day' },
  { label: '分钟', value: 'minute' },
  { label: '星期', value: 'week' },
];

/** 星期选项（值 1=周一...7=周日） */
const WEEK_OPTIONS = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '7' },
];

/** 小时列 0~23 */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: String(i) }));

/** 分钟列 0~59 */
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => ({ label: String(i), value: String(i) }));

/** 循环时间 Picker 列定义 */
const LOOP_TIME_COLUMNS = [HOUR_OPTIONS, MINUTE_OPTIONS];

/** 生成新类型的默认值（保留 process 和 disabled） */
function defaultScheduleForType(type: ScheduleConfig['type'], base: Partial<ScheduleConfig>): ScheduleConfig {
  const now = Date.now();
  const todayStart = dayjs().startOf('day').valueOf();

  switch (type) {
    case 'once':
      return { type, startTime: now, process: base.process ?? 0, disabled: base.disabled };
    case 'day':
      return { type, startTime: todayStart, value: 8 * 3600000, interval: 0, process: base.process ?? 0, disabled: base.disabled };
    case 'minute':
      return { type, startTime: now, interval: 30, process: base.process ?? 0, disabled: base.disabled };
    case 'week':
      return { type, startTime: todayStart, value: 8 * 3600000, week: 1, process: base.process ?? 0, disabled: base.disabled };
  }
}

interface ScheduleConfigPickerProps {
  open: boolean;
  schedule: ScheduleConfig;
  processes: { name: string }[];
  onConfirm: (result: ScheduleConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  afterClose?: () => void;
}

interface ScheduleConfigPromptProps {
  schedule: ScheduleConfig;
  processes: { name: string }[];
  onConfirm?: (result: ScheduleConfig) => void;
  onDelete?: () => void;
}

export function ScheduleConfigPicker({
  open,
  schedule,
  processes,
  onConfirm,
  onClose,
  onDelete,
  afterClose,
}: ScheduleConfigPickerProps) {
  const [draft, setDraft] = useState(schedule);

  /* eslint-disable react-hooks/set-state-in-effect -- ID-based stale closure prevention */
  useEffect(() => {
    setDraft(schedule);
  }, [open, schedule]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useBackButton(open, onClose);

  function update(updated: ScheduleConfig) {
    setDraft(updated);
    onConfirm(updated);
  }

  /** 循环时间（距 00:00 毫秒偏移）转为 Picker 默认值 */
  const loopTimeDefault = [
    String(Math.floor((draft.value ?? 0) / 3600000)),
    String(Math.floor(((draft.value ?? 0) % 3600000) / 60000)),
  ];

  /** 星期 Picker 默认值 */
  const weekDefault = [String(draft.week ?? 1)];

  /** 开始时间（DatePicker 用） */
  const startTimeDate = new Date(draft.startTime);

  /** 流程选项 */
  const processOptions = processes.map((p, i) => ({
    label: p.name || `流程 ${String(i)}`,
    value: String(i),
  }));

  function confirmDelete() {
    void Dialog.confirm({
      title: '确认删除此定时任务？',
      onConfirm: () => { onDelete?.(); },
    });
  }

  return (
    <Popup
      afterClose={afterClose}
      bodyStyle={{ height: '70vh' }}
      closeOnMaskClick={true}
      position="bottom"
      visible={open}
      onClose={onClose}
      onMaskClick={onClose}
    >
      <NavBar
        right={onDelete ? (
          <Button size="small" onClick={confirmDelete}>
            <DeleteOutline />
          </Button>
        ) : null}
        onBack={onClose}
      >
        编辑定时任务
      </NavBar>

      <div style={{ overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
        <Form layout="vertical">
          {/* 循环类型 */}
          <Form.Item label="循环类型">
            <Selector
              options={TYPE_OPTIONS}
              value={[draft.type]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  const newType = vals[0] as ScheduleConfig['type'];
                  update(defaultScheduleForType(newType, draft));
                }
              }}
            />
          </Form.Item>

          {/* 间隔（天）— 仅 day 类型 */}
          {draft.type === 'day' && (
            <Form.Item label="间隔（天）" help="0 表示每天执行">
              <Stepper
                min={0}
                step={1}
                value={draft.interval ?? 0}
                onChange={(v) => { update({ ...draft, interval: v }); }}
              />
            </Form.Item>
          )}

          {/* 星期 — 仅 week 类型 */}
          {draft.type === 'week' && (
            <Form.Item
              label="星期"
              onClick={() => {
                void Picker.prompt({
                  columns: [WEEK_OPTIONS],
                  defaultValue: weekDefault,
                  onConfirm: (val) => {
                    if (val.length > 0 && typeof val[0] === 'string') {
                      update({ ...draft, week: Number(val[0]) });
                    }
                  },
                });
              }}
            >
              <span>{WEEK_OPTIONS.find((o) => o.value === String(draft.week ?? 1))?.label ?? ''}</span>
            </Form.Item>
          )}

          {/* 间隔（分钟）— 仅 minute 类型 */}
          {draft.type === 'minute' && (
            <Form.Item label="间隔（分钟）" help="最小 30 分钟">
              <Stepper
                min={30}
                step={1}
                value={draft.interval ?? 30}
                onChange={(v) => { update({ ...draft, interval: v }); }}
              />
            </Form.Item>
          )}

          {/* 开始时间 — 所有类型 */}
          <Form.Item
            label="开始时间"
            onClick={() => {
              void DatePicker.prompt({
                precision: 'minute',
                defaultValue: startTimeDate,
                onConfirm: (val) => {
                  update({ ...draft, startTime: val.getTime() });
                },
              });
            }}
          >
            <span>{dayjs(draft.startTime).format('YYYY-MM-DD HH:mm')}</span>
          </Form.Item>

          {/* 循环时间 — 仅 day/week 类型 */}
          {(draft.type === 'day' || draft.type === 'week') && (
            <Form.Item
              label="循环时间"
              onClick={() => {
                void Picker.prompt({
                  columns: LOOP_TIME_COLUMNS,
                  defaultValue: loopTimeDefault,
                  onConfirm: (val) => {
                    const hours = typeof val[0] === 'string' ? Number(val[0]) : 0;
                    const minutes = typeof val[1] === 'string' ? Number(val[1]) : 0;
                    const ms = hours * 3600000 + minutes * 60000;
                    update({ ...draft, value: ms });
                  },
                });
              }}
            >
              <span>{dayjs().startOf('day').add(draft.value ?? 0, 'millisecond').format('HH:mm')}</span>
            </Form.Item>
          )}

          {/* 执行流程 */}
          <Form.Item
            label="执行流程"
            onClick={() => {
              void Picker.prompt({
                columns: [processOptions],
                defaultValue: [String(draft.process)],
                onConfirm: (val) => {
                  if (val.length > 0 && typeof val[0] === 'string') {
                    update({ ...draft, process: Number(val[0]) });
                  }
                },
              });
            }}
          >
            <span>
              {processOptions.find((o) => o.value === String(draft.process))?.label ?? ''}
            </span>
          </Form.Item>

          {/* 禁用任务（改名） */}
          <Form.Item label="禁用任务">
            <Switch
              checked={draft.disabled}
              onChange={(checked) => { update({ ...draft, disabled: checked }); }}
            />
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

ScheduleConfigPicker.prompt = (
  props: ScheduleConfigPromptProps,
): Promise<ScheduleConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderToBody 初始化模式
      useEffect(() => { setVisible(true); }, []);
      return React.createElement(ScheduleConfigPicker, {
        open: visible,
        schedule: props.schedule,
        processes: props.processes,
        onConfirm: (result: ScheduleConfig) => {
          props.onConfirm?.(result);
          resolve(result);
        },
        onClose: () => { setVisible(false); resolve(null); },
        onDelete: props.onDelete,
        afterClose: () => { unmount(); },
      });
    };
    const unmount = renderToBody(React.createElement(Wrapper));
  });
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run __tests__/watering/components/schedule-editor.test.tsx`

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add app/watering/components/schedule-config-picker.tsx __tests__/watering/components/schedule-editor.test.tsx
git commit -m "refactor: 重构 ScheduleConfigPicker，按循环类型条件渲染表单字段"
```

---

### Task 4: 更新 DeviceConfigForm — 列表调用和默认值

**Files:**
- Modify: `app/watering/components/device-config-form.tsx:32,253-254,292-299,524`

- [ ] **Step 1: 更新 import**

在 `app/watering/components/device-config-form.tsx` 第 32 行，添加 `formatScheduleTitle`：

```typescript
import { formatProcessDesc, formatScheduleTitle, formatScheduleDesc, formatSensorDesc } from '../utils/format-desc';
```

- [ ] **Step 2: 更新 addSchedule 默认值**

将第 253-259 行的 `addSchedule` 函数替换为：

```typescript
  function addSchedule() {
    const todayStart = dayjs().startOf('day').valueOf();
    const item = attachKey<ScheduleConfig>({
      type: 'day',
      startTime: todayStart,
      value: 8 * 3600000,
      interval: 0,
      process: 0,
    });
    const newSchedules = [...form.schedules, item];
    setForm({ ...form, schedules: newSchedules });
    setScheduleIndex(newSchedules.length - 1);
    setScheduleVisible(true);
  }
```

同时在文件顶部添加 `import dayjs from 'dayjs';`（如果尚不存在）。

- [ ] **Step 3: 删除 formatScheduleTime 函数，更新列表标题渲染**

删除第 292-299 行的 `formatScheduleTime` 函数。

将第 524 行的 `{formatScheduleTime(sch)}` 替换为：

```typescript
{formatScheduleTitle(sch, form.processes)}
```

- [ ] **Step 4: 更新 ScheduleConfigPicker 的 schedule prop 默认值**

将第 601 行的：

```typescript
schedule={scheduleIndex > -1 ? form.schedules[scheduleIndex]! : { type: 'day', value: 0, interval: 1, process: 0 }}
```

替换为：

```typescript
schedule={scheduleIndex > -1 ? form.schedules[scheduleIndex]! : { type: 'day', startTime: dayjs().startOf('day').valueOf(), value: 8 * 3600000, interval: 0, process: 0 }}
```

- [ ] **Step 5: 运行类型检查**

Run: `npx tsc --noEmit 2>&1 | grep -i "device-config-form\|format-desc" || echo "No errors in modified files"`

预期：无类型错误

- [ ] **Step 6: 提交**

```bash
git add app/watering/components/device-config-form.tsx
git commit -m "refactor: 更新 DeviceConfigForm，使用新的 ScheduleConfig 默认值和标题格式"
```

---

### Task 5: 扩展服务端定时触发逻辑 — once + day + minute + week

**Files:**
- Modify: `app/watering/api/get-state/route.ts:107-187`
- Modify: `__tests__/watering/schedule-check.test.ts`

- [ ] **Step 1: 编写新类型的失败测试**

替换 `__tests__/watering/schedule-check.test.ts` 全部内容：

```typescript
/**
 * 计划任务检查逻辑单元测试
 *
 * 测试 once/day/minute/week 四种循环类型的触发判断：
 * - 触发时间计算
 * - 45 分钟误差容忍
 * - interval 去重
 * - disabled 跳过
 * - switch=on 跳过
 */

import { describe, it, expect } from 'vitest';

/** 计划任务检查的最大误差容忍（毫秒） */
const SCHEDULE_OFFSET = 45 * 60 * 1000;

/**
 * 计算 day 类型定时任务的今日触发时间戳（毫秒）
 * @param now 当前时间
 * @param value 距 00:00 的毫秒偏移
 */
function calcDayLoopTriggerTime(now: Date, value: number): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.getTime() + value;
}

/**
 * 计算 minute 类型定时任务的当前理论触发时间戳（毫秒）
 * @param startTime 首次执行时间
 * @param intervalMinutes 间隔分钟数
 * @param now 当前时间
 */
function calcMinuteTriggerTime(startTime: number, intervalMinutes: number, now: Date): number {
  const intervalMs = intervalMinutes * 60000;
  const elapsed = now.getTime() - startTime;
  if (elapsed < 0) return startTime;
  const n = Math.floor(elapsed / intervalMs);
  return startTime + n * intervalMs;
}

/**
 * 计算 week 类型定时任务的今日触发时间戳（毫秒）
 * @param now 当前时间
 * @param value 距 00:00 的毫秒偏移
 * @param week 星期几 (1=周一...7=周日)
 */
function calcWeekTriggerTime(now: Date, value: number, week: number): number | null {
  // JS getDay(): 0=周日, 1=周一, ..., 6=周六 → 转换为 1=周一...7=周日
  const jsDay = now.getDay();
  const currentWeekDay = jsDay === 0 ? 7 : jsDay;
  if (currentWeekDay !== week) return null;
  return calcDayLoopTriggerTime(now, value);
}

/** JS getDay() 到 week 映射 (1=周一...7=周日) */
function jsDayToWeekDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

/** 创建模拟的 hasLog 函数 */
function mockHasLog(executedTimes: number[]): (time: number) => boolean {
  return (time: number) => executedTimes.includes(time);
}

// ---- once 类型 ----

describe('once 类型触发判断', () => {
  it('到达开始时间且在容忍范围内应触发', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:05:00+08:00');
    const triggerTime = startTime;
    const withinOffset = Math.abs(now.getTime() - triggerTime) <= SCHEDULE_OFFSET;
    const reached = triggerTime <= now.getTime();
    expect(reached && withinOffset).toBe(true);
  });

  it('未到开始时间不应触发', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T07:50:00+08:00');
    const reached = startTime <= now.getTime();
    expect(reached).toBe(false);
  });

  it('过期超过 45 分钟不应触发', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:50:00+08:00');
    const withinOffset = Math.abs(now.getTime() - startTime) <= SCHEDULE_OFFSET;
    expect(withinOffset).toBe(false);
  });

  it('已执行过不应触发（去重）', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const hasLog = mockHasLog([startTime]);
    expect(hasLog(startTime)).toBe(true);
  });
});

// ---- day 类型 ----

describe('day 类型触发判断', () => {
  /** 固定基准时间：2026-06-14 (周日) 10:05 CST */
  function makeNow(hours: number, minutes: number): Date {
    const d = new Date('2026-06-14T00:00:00+08:00');
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  it('interval=0 每天都应触发', () => {
    const now = makeNow(10, 5);
    const triggerTime = calcDayLoopTriggerTime(now, 10 * 3600000);
    const withinOffset = Math.abs(now.getTime() - triggerTime) <= SCHEDULE_OFFSET;
    const reached = triggerTime <= now.getTime();
    expect(reached && withinOffset).toBe(true);
  });

  it('interval=2 前天执行过不应触发', () => {
    const now = makeNow(10, 5);
    const triggerTime = calcDayLoopTriggerTime(now, 10 * 3600000);
    const twoDaysAgo = triggerTime - 2 * 86400000;
    const hasLog = mockHasLog([twoDaysAgo]);
    // interval=2: 检查前 2 天是否有执行记录
    let previouslyExecuted = false;
    for (let i = 1; i <= 2; i++) {
      if (hasLog(triggerTime - i * 86400000)) {
        previouslyExecuted = true;
        break;
      }
    }
    expect(previouslyExecuted).toBe(true);
  });

  it('startTime 未到（启用日期在未来）不应触发', () => {
    const now = makeNow(10, 5);
    const startTime = new Date('2026-06-20T00:00:00+08:00').getTime(); // 未来
    const startDate = new Date(startTime);
    startDate.setHours(0, 0, 0, 0);
    const nowDate = new Date(now);
    nowDate.setHours(0, 0, 0, 0);
    expect(startDate.getTime() > nowDate.getTime()).toBe(true);
  });
});

// ---- minute 类型 ----

describe('minute 类型触发判断', () => {
  it('从 startTime 开始每隔 N 分钟的理论触发时间', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T09:40:00+08:00');
    const triggerTime = calcMinuteTriggerTime(startTime, 30, now);
    // 8:00, 8:30, 9:00, 9:30 — 9:30 是最后一个 ≤ now 的
    const expected = new Date('2026-06-17T09:30:00+08:00').getTime();
    expect(triggerTime).toBe(expected);
  });

  it('now < startTime 时返回 startTime', () => {
    const startTime = new Date('2026-06-17T10:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:00:00+08:00');
    const triggerTime = calcMinuteTriggerTime(startTime, 30, now);
    expect(triggerTime).toBe(startTime);
  });

  it('恰好等于某个触发点', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:30:00+08:00');
    const triggerTime = calcMinuteTriggerTime(startTime, 30, now);
    expect(triggerTime).toBe(new Date('2026-06-17T08:30:00+08:00').getTime());
  });
});

// ---- week 类型 ----

describe('week 类型触发判断', () => {
  it('今天是目标星期且在容忍范围内应触发', () => {
    // 2026-06-15 是周一
    const now = new Date('2026-06-15T10:05:00+08:00');
    const weekDay = jsDayToWeekDay(now.getDay());
    expect(weekDay).toBe(1); // 周一
    const triggerTime = calcWeekTriggerTime(now, 10 * 3600000, 1);
    expect(triggerTime).not.toBeNull();
  });

  it('今天不是目标星期不应触发', () => {
    // 2026-06-15 是周一
    const now = new Date('2026-06-15T10:05:00+08:00');
    const triggerTime = calcWeekTriggerTime(now, 10 * 3600000, 3); // 周三
    expect(triggerTime).toBeNull();
  });

  it('周日对应 week=7', () => {
    // 2026-06-14 是周日
    const now = new Date('2026-06-14T10:05:00+08:00');
    const weekDay = jsDayToWeekDay(now.getDay());
    expect(weekDay).toBe(7);
  });
});

// ---- calcDayLoopTriggerTime ----

describe('calcDayLoopTriggerTime', () => {
  it('8:00 → 28800000 毫秒偏移', () => {
    const now = new Date('2026-06-14T10:00:00+08:00');
    const trigger = calcDayLoopTriggerTime(now, 8 * 3600 * 1000);
    const expected = new Date('2026-06-14T08:00:00+08:00').getTime();
    expect(trigger).toBe(expected);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run __tests__/watering/schedule-check.test.ts`

预期：FAIL — 函数名与旧版不匹配

- [ ] **Step 3: 实现 get-state/route.ts 中的新类型逻辑**

在 `app/watering/api/get-state/route.ts` 中进行以下修改：

**3a. 将 `calcDayTriggerTime` 重命名为 `calcDayLoopTriggerTime`**

替换第 107-116 行：

```typescript
/**
 * 计算 day/week 类型定时任务的今日触发时间戳（毫秒）
 *
 * @param now 当前时间
 * @param value 距 00:00 的毫秒偏移
 */
function calcDayLoopTriggerTime(now: Date, value: number): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.getTime() + value;
}
```

**3b. 添加 `calcMinuteTriggerTime` 和 `calcWeekTriggerTime`**

在 `calcDayLoopTriggerTime` 之后添加：

```typescript
/**
 * 计算 minute 类型定时任务的当前理论触发时间戳（毫秒）
 *
 * 从 startTime 开始，按 interval 分钟等间隔触发。
 * 计算公式：startTime + floor((now - startTime) / intervalMs) * intervalMs
 * 结果为 ≤ now 的最大触发时间点。
 *
 * @param startTime 首次执行时间（Unix 时间戳 ms）
 * @param intervalMinutes 间隔分钟数
 * @param now 当前时间
 */
function calcMinuteTriggerTime(startTime: number, intervalMinutes: number, now: Date): number {
  const intervalMs = intervalMinutes * 60000;
  const elapsed = now.getTime() - startTime;
  if (elapsed < 0) return startTime;
  const n = Math.floor(elapsed / intervalMs);
  return startTime + n * intervalMs;
}

/**
 * 计算 week 类型定时任务的今日触发时间戳（毫秒）
 *
 * 仅当今天是指定星期时返回触发时间，否则返回 null。
 * JS getDay(): 0=周日, 1=周一, ..., 6=周六 → 转换为 1=周一...7=周日
 *
 * @param now 当前时间
 * @param value 距 00:00 的毫秒偏移
 * @param week 目标星期 (1=周一...7=周日)
 */
function calcWeekTriggerTime(now: Date, value: number, week: number): number | null {
  const jsDay = now.getDay();
  const currentWeekDay = jsDay === 0 ? 7 : jsDay;
  if (currentWeekDay !== week) return null;
  return calcDayLoopTriggerTime(now, value);
}
```

**3c. 重写 `checkAndExecuteSchedule` 函数**

替换第 127-187 行的 `checkAndExecuteSchedule` 为：

```typescript
/**
 * 检查计划任务并执行
 *
 * 遍历 config.schedules，找到第一个应触发的定时任务。
 * 支持 once/day/minute/week 四种循环类型。
 * 触发后标记 schedule_log、更新 state.switch/process/stateId。
 * once 类型触发后自动将 disabled 设为 true 并保存配置。
 *
 * @returns 是否触发了计划任务（用于判断 changed）
 */
async function checkAndExecuteSchedule(
  config: DeviceConfig,
  state: DeviceState,
  now: Date,
): Promise<boolean> {
  // 仅在设备空闲时检查
  if (state.switch !== 'off') return false;

  let configNeedsSave = false;

  for (const schedule of config.schedules) {
    if (schedule.disabled) continue;

    let triggerTime: number;

    switch (schedule.type) {
      case 'once': {
        // 单次任务：startTime 即执行时间
        triggerTime = schedule.startTime;
        const elapsed = now.getTime() - triggerTime;
        if (elapsed < 0 || Math.abs(elapsed) > SCHEDULE_OFFSET) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;
        break;
      }

      case 'day': {
        // 按天：检查启用日期是否已到
        const startDate = new Date(schedule.startTime);
        startDate.setHours(0, 0, 0, 0);
        const nowDate = new Date(now);
        nowDate.setHours(0, 0, 0, 0);
        if (startDate.getTime() > nowDate.getTime()) continue;

        triggerTime = calcDayLoopTriggerTime(now, schedule.value ?? 0);
        if (triggerTime > now.getTime()) continue;
        if (Math.abs(now.getTime() - triggerTime) > SCHEDULE_OFFSET) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;

        // interval 去重：interval=0 表示每天都执行，跳过间隔检查
        if (schedule.interval && schedule.interval > 0) {
          let previouslyExecuted = false;
          for (let i = 1; i <= schedule.interval; i++) {
            const prevTime = triggerTime - i * 86400000;
            if (await hasScheduleLog(config.chipId, prevTime)) {
              previouslyExecuted = true;
              break;
            }
          }
          if (previouslyExecuted) continue;
        }
        break;
      }

      case 'minute': {
        // 按分钟：从 startTime 开始等间隔触发
        triggerTime = calcMinuteTriggerTime(schedule.startTime, schedule.interval ?? 30, now);
        // 还没到首次执行时间
        if (triggerTime > now.getTime()) continue;
        // 当前时间距理论触发时间超过一个间隔则跳过（防止唤醒后批量执行）
        const intervalMs = (schedule.interval ?? 30) * 60000;
        if (now.getTime() - triggerTime > intervalMs) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;
        break;
      }

      case 'week': {
        // 按星期：检查启用日期和星期
        const startDate = new Date(schedule.startTime);
        startDate.setHours(0, 0, 0, 0);
        const nowDate = new Date(now);
        nowDate.setHours(0, 0, 0, 0);
        if (startDate.getTime() > nowDate.getTime()) continue;

        const weekTriggerTime = calcWeekTriggerTime(now, schedule.value ?? 0, schedule.week ?? 1);
        if (weekTriggerTime === null) continue; // 今天不是目标星期
        triggerTime = weekTriggerTime;
        if (triggerTime > now.getTime()) continue;
        if (Math.abs(now.getTime() - triggerTime) > SCHEDULE_OFFSET) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;
        break;
      }

      default:
        continue;
    }

    // 下发流程（深拷贝防止修改原始配置）
    if (
      config.processes.length > 0 &&
      config.processes.length > schedule.process
    ) {
      state.switch = 'on';
      state.index = schedule.process;
      state.process = filterProcess(
        JSON.parse(JSON.stringify(config.processes[schedule.process])) as ProcessConfig,
      );
      // 标记执行
      await insertScheduleLog(config.chipId, triggerTime, schedule.process);
      // once 类型触发后自动禁用
      if (schedule.type === 'once') {
        schedule.disabled = true;
        configNeedsSave = true;
      }
      state.stateId = newId();
      state.lastWriteTime = new Date().toISOString();
      await saveDeviceState(state);
      // once 类型需要持久化 disabled 状态到配置
      if (configNeedsSave) {
        await saveDeviceConfig(config);
      }
      return true;
    }
  }

  return false;
}
```

注意：需要在文件顶部 import 中添加 `saveDeviceConfig`：

```typescript
import { getDeviceState, getDeviceConfig, updateTick, insertScheduleLog, hasScheduleLog, saveDeviceState, saveDeviceConfig, writeSensorLog, getSensorLogs } from '@/app/watering/services/db';
```

**3d. 更新 `calcNextScheduleDelay` 函数**

替换第 195-215 行的 `calcNextScheduleDelay` 为：

```typescript
/**
 * 计算单个定时任务距现在还有多少毫秒
 *
 * once: startTime - now（已过期返回 SLEEP_DURATION）
 * day: 今天循环时间未过 → 差值；否则 → 明天 + interval天数
 * minute: 下一个等间隔触发点
 * week: 下一个目标星期的循环时间
 */
function calcNextScheduleDelay(schedule: ScheduleConfig, now: Date): number {
  if (schedule.disabled) return SLEEP_DURATION;

  switch (schedule.type) {
    case 'once': {
      if (schedule.startTime <= now.getTime()) return SLEEP_DURATION;
      return schedule.startTime - now.getTime();
    }

    case 'day': {
      // 检查启用日期
      const startDate = new Date(schedule.startTime);
      startDate.setHours(0, 0, 0, 0);
      const nowDate = new Date(now);
      nowDate.setHours(0, 0, 0, 0);
      if (startDate.getTime() > nowDate.getTime()) {
        return startDate.getTime() + (schedule.value ?? 0) - now.getTime();
      }

      const todayTrigger = calcDayLoopTriggerTime(now, schedule.value ?? 0);
      if (todayTrigger > now.getTime()) {
        return todayTrigger - now.getTime();
      }

      const intervalMs = ((schedule.interval ?? 0) + 1) * 86400000;
      return todayTrigger + intervalMs - now.getTime();
    }

    case 'minute': {
      if (schedule.startTime > now.getTime()) {
        return schedule.startTime - now.getTime();
      }
      const triggerTime = calcMinuteTriggerTime(schedule.startTime, schedule.interval ?? 30, now);
      const intervalMs = (schedule.interval ?? 30) * 60000;
      return triggerTime + intervalMs - now.getTime();
    }

    case 'week': {
      // 检查启用日期
      const startDate = new Date(schedule.startTime);
      startDate.setHours(0, 0, 0, 0);
      const nowDate = new Date(now);
      nowDate.setHours(0, 0, 0, 0);
      if (startDate.getTime() > nowDate.getTime()) {
        return startDate.getTime() + (schedule.value ?? 0) - now.getTime();
      }

      const weekTriggerTime = calcWeekTriggerTime(now, schedule.value ?? 0, schedule.week ?? 1);
      if (weekTriggerTime !== null && weekTriggerTime > now.getTime()) {
        return weekTriggerTime - now.getTime();
      }

      // 计算下一个目标星期
      const jsDay = now.getDay();
      const currentWeekDay = jsDay === 0 ? 7 : jsDay;
      const targetWeekDay = schedule.week ?? 1;
      let daysUntil = targetWeekDay - currentWeekDay;
      if (daysUntil <= 0) daysUntil += 7;
      // 如果今天是目标星期但循环时间已过，也算 7 天后
      if (weekTriggerTime !== null && weekTriggerTime <= now.getTime()) {
        daysUntil = daysUntil === 0 ? 7 : daysUntil;
      }
      const nextWeekDate = new Date(now);
      nextWeekDate.setDate(nextWeekDate.getDate() + daysUntil);
      nextWeekDate.setHours(0, 0, 0, 0);
      return nextWeekDate.getTime() + (schedule.value ?? 0) - now.getTime();
    }

    default:
      return SLEEP_DURATION;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run __tests__/watering/schedule-check.test.ts`

预期：PASS

- [ ] **Step 5: 运行 get-state 测试**

Run: `npx vitest run __tests__/watering/get-state.test.ts`

预期：PASS

- [ ] **Step 6: 提交**

```bash
git add app/watering/api/get-state/route.ts __tests__/watering/schedule-check.test.ts
git commit -m "feat: 扩展服务端定时触发逻辑，支持 once/day/minute/week 全类型"
```

---

### Task 6: 全量类型检查和格式化

**Files:**
- 可能需要微调的任何文件

- [ ] **Step 1: 运行格式化**

Run: `npm run format`

- [ ] **Step 2: 运行类型检查 + lint**

Run: `npm run check`

- [ ] **Step 3: 修复所有错误**

如果有类型或 lint 错误，逐一修复。常见问题：
- `schedule-config-picker.tsx` 中旧类型值残留
- `device-config-form.tsx` 中 `formatScheduleTime` 引用残留
- 测试文件中旧 `ScheduleConfig` 字段引用

- [ ] **Step 4: 运行全量测试**

Run: `npm run test`

预期：所有测试 PASS

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "fix: 修复全量类型检查和 lint 错误"
```

---

### Task 7: 手动验证

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`

- [ ] **Step 2: 验证 UI 交互**

在浏览器中打开设备配置页面，验证：
1. 添加定时任务 → 默认为"天"类型，interval=0，循环时间 08:00
2. 切换到"单次" → 仅显示开始时间、执行流程、禁用任务
3. 切换到"分钟" → 显示间隔（分钟）最小 30、开始时间
4. 切换到"星期" → 显示星期选择、开始时间、循环时间
5. 列表标题和描述格式正确
6. "禁用任务"标签正确显示
7. 切换类型后字段重置，process 和 disabled 保留

- [ ] **Step 3: 提交最终状态**

如有 UI 微调，提交修复。
