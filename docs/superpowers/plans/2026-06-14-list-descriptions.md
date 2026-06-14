# 列表描述信息增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为功能、步骤、中断、计划任务四种列表自动生成配置描述文本，让用户在列表中直接看到配置摘要。

**Architecture:** 新增 `format-desc.ts` 工具模块，提供 `formatMs` 时间格式化和四个描述生成函数；然后在三个组件的 `List.Item` 中替换/添加 `description` 属性调用。

**Tech Stack:** TypeScript, React, vitest, antd-mobile

**Spec:** `docs/superpowers/specs/2026-06-14-list-descriptions-design.md`

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| **创建** | `app/watering/utils/format-desc.ts` | `formatMs` + 四个描述生成函数 |
| **创建** | `__tests__/watering/format-desc.test.ts` | 所有格式化函数的单元测试 |
| **修改** | `app/watering/components/device-config-form.tsx` | 功能列表添加 description；计划任务替换 description |
| **修改** | `app/watering/components/process-config-picker.tsx` | 步骤列表替换 description |
| **修改** | `app/watering/components/step-config-picker.tsx` | 中断列表替换 description |

---

### Task 1: 创建 `format-desc.ts` 工具模块

**Files:**
- Create: `app/watering/utils/format-desc.ts`

- [ ] **Step 1: 创建 utils 目录并编写模块代码**

```typescript
/**
 * 列表描述文本生成工具
 *
 * 为功能、步骤、中断、计划任务四种配置自动生成简洁描述，
 * 字段有值才显示，disabled 时追加【已禁用】标记。
 */

import type { ProcessConfig, StepConfig, InterruptConfig, ScheduleConfig } from '../types';

/**
 * 将毫秒转为中文时间字符串
 * 规则：<1秒用毫秒，1~59秒用秒，≥60秒用 X分X秒（整分省略秒）
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}毫秒`;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}秒`;

  if (seconds === 0) return `${minutes}分`;

  return `${minutes}分${seconds}秒`;
}

/**
 * 生成步骤列表描述
 * 格式：组件名 · 值:begin~end · 延迟X秒 · 超时X分X秒 · N个中断【已禁用】
 */
export function formatStepDesc(step: StepConfig): string {
  const parts: string[] = [];

  if (step.component) parts.push(step.component);

  const hasBegin = step.value?.begin !== undefined && step.value?.begin !== null;
  const hasEnd = step.value?.end !== undefined && step.value?.end !== null;
  if (hasBegin || hasEnd) {
    const begin = hasBegin ? String(step.value.begin) : '?';
    const end = hasEnd ? String(step.value.end) : '?';
    parts.push(`值:${begin}~${end}`);
  }

  if (step.delay && step.delay > 0) parts.push(`延迟${formatMs(step.delay)}`);

  if (step.timeout !== undefined && step.timeout > 0) parts.push(`超时${formatMs(step.timeout)}`);

  if (step.interrupts && step.interrupts.length > 0) parts.push(`${step.interrupts.length}个中断`);

  if (step.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}

/**
 * 生成中断列表描述
 * 格式：组件名 · 条件 · 拦截N次 · 延迟X秒 · 持续X分X秒【已禁用】
 */
export function formatInterruptDesc(intr: InterruptConfig): string {
  const parts: string[] = [];

  if (intr.component) parts.push(intr.component);

  // 条件：模拟信号用 logic+threshold，数字信号用 state 布尔值
  if (intr.signalType === 'analog' && intr.logic && intr.threshold !== undefined) {
    parts.push(`${intr.logic}${intr.threshold}`);
  } else if (intr.signalType === 'digital') {
    parts.push(`=${intr.state ? '开' : '关'}`);
  }

  if (intr.intercept && intr.intercept > 0) parts.push(`拦截${intr.intercept}次`);

  if (intr.delay && intr.delay > 0) parts.push(`延迟${formatMs(intr.delay)}`);

  if (intr.duration && intr.duration > 0) parts.push(`持续${formatMs(intr.duration)}`);

  if (intr.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}

/**
 * 生成计划任务列表描述
 * 格式：流程名 · 间隔N天/分钟【已禁用】
 * @param sch 计划任务配置
 * @param processes 流程列表，用于根据索引查找流程名称
 */
export function formatScheduleDesc(sch: ScheduleConfig, processes: ProcessConfig[]): string {
  const parts: string[] = [];

  if (sch.process < processes.length && processes[sch.process]?.name) {
    parts.push(processes[sch.process].name);
  }

  if (sch.interval > 1) {
    const unit = sch.type === 'minute' ? '分钟' : '天';
    parts.push(`间隔${sch.interval}${unit}`);
  }

  if (sch.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}

/**
 * 生成功能列表描述
 * 格式：N个步骤 · 触发:XXX
 */
export function formatProcessDesc(proc: ProcessConfig): string {
  const parts: string[] = [];

  parts.push(`${proc.steps.length}个步骤`);

  if (proc.trigger) parts.push(`触发:${proc.trigger}`);

  return parts.join(' · ');
}
```

---

### Task 2: 编写格式化函数单元测试

**Files:**
- Create: `__tests__/watering/format-desc.test.ts`

- [ ] **Step 1: 编写测试文件**

```typescript
// @vitest-environment jsdom

/**
 * format-desc 工具函数单元测试
 *
 * 测试 formatMs / formatStepDesc / formatInterruptDesc /
 * formatScheduleDesc / formatProcessDesc。
 */

import { describe, it, expect } from 'vitest';

import {
  formatMs,
  formatStepDesc,
  formatInterruptDesc,
  formatScheduleDesc,
  formatProcessDesc,
} from '@/app/watering/utils/format-desc';
import type { StepConfig, InterruptConfig, ScheduleConfig, ProcessConfig } from '@/app/watering/types';

// ================================================================
// formatMs
// ================================================================

describe('formatMs', () => {
  it('< 1000 毫秒显示毫秒', () => {
    expect(formatMs(500)).toBe('500毫秒');
    expect(formatMs(0)).toBe('0毫秒');
  });

  it('1000 ~ 59999 毫秒显示秒', () => {
    expect(formatMs(1000)).toBe('1秒');
    expect(formatMs(2000)).toBe('2秒');
    expect(formatMs(59000)).toBe('59秒');
  });

  it('≥ 60000 毫秒显示分秒，整分省略秒', () => {
    expect(formatMs(60000)).toBe('1分');
    expect(formatMs(120000)).toBe('2分');
    expect(formatMs(90000)).toBe('1分30秒');
    expect(formatMs(125000)).toBe('2分5秒');
  });
});

// ================================================================
// formatStepDesc
// ================================================================

describe('formatStepDesc', () => {
  it('仅组件名', () => {
    const step: StepConfig = { name: '测试步骤', value: { begin: undefined, end: undefined }, component: 'pump_1' };
    expect(formatStepDesc(step)).toBe('pump_1');
  });

  it('所有字段都有的完整步骤', () => {
    const step: StepConfig = {
      name: '浇花',
      component: 'motor_0',
      value: { begin: 0, end: 100 },
      delay: 2000,
      timeout: 90000,
      interrupts: [{ name: '过热', component: 'sensor_0', state: 1 }],
    };
    expect(formatStepDesc(step)).toBe('motor_0 · 值:0~100 · 延迟2秒 · 超时1分30秒 · 1个中断');
  });

  it('value 缺 begin 显示 ?', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: 50 }, component: 'p' };
    expect(formatStepDesc(step)).toBe('p · 值:?~50');
  });

  it('value 缺 end 显示 ?', () => {
    const step: StepConfig = { name: 's', value: { begin: 10, end: undefined }, component: 'p' };
    expect(formatStepDesc(step)).toBe('p · 值:10~?');
  });

  it('disabled 追加【已禁用】', () => {
    const step: StepConfig = { name: '禁', component: 'motor_0', value: { begin: undefined, end: undefined }, disabled: true };
    expect(formatStepDesc(step)).toBe('motor_0 · 【已禁用】');
  });

  it('disabled 为 false 时不显示', () => {
    const step: StepConfig = { name: '启', component: 'motor_0', value: { begin: undefined, end: undefined }, disabled: false };
    expect(formatStepDesc(step)).toBe('motor_0');
  });

  it('delay/timeout 为 0 时不显示', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: undefined }, delay: 0, timeout: 0 };
    expect(formatStepDesc(step)).toBe('');
  });

  it('timeout 为 undefined 时不显示', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: undefined }, timeout: undefined, component: 'p' };
    expect(formatStepDesc(step)).toBe('p');
  });

  it('中断数组为空时不显示', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: undefined }, component: 'p', interrupts: [] };
    expect(formatStepDesc(step)).toBe('p');
  });
});

// ================================================================
// formatInterruptDesc
// ================================================================

describe('formatInterruptDesc', () => {
  it('模拟信号 + 完整字段', () => {
    const intr: InterruptConfig = {
      name: '温度过高',
      component: 'sensor_0',
      state: 30,
      signalType: 'analog',
      logic: '>',
      threshold: 30,
      intercept: 3,
      delay: 1000,
      duration: 65000,
      disabled: false,
    };
    expect(formatInterruptDesc(intr)).toBe('sensor_0 · >30 · 拦截3次 · 延迟1秒 · 持续1分5秒');
  });

  it('数字信号 — state true 显示 =开', () => {
    const intr: InterruptConfig = { name: '按钮', component: 'button_0', state: true, signalType: 'digital' };
    expect(formatInterruptDesc(intr)).toBe('button_0 · =开');
  });

  it('数字信号 — state false 显示 =关', () => {
    const intr: InterruptConfig = { name: '按钮', component: 'button_0', state: false, signalType: 'digital' };
    expect(formatInterruptDesc(intr)).toBe('button_0 · =关');
  });

  it('无 signalType 时不显示条件', () => {
    const intr: InterruptConfig = { name: '空', component: 's', state: 1 };
    expect(formatInterruptDesc(intr)).toBe('s');
  });

  it('模拟信号缺 logic 时不显示条件', () => {
    const intr: InterruptConfig = { name: 'x', component: 's', state: 0, signalType: 'analog', threshold: 10 };
    expect(formatInterruptDesc(intr)).toBe('s');
  });

  it('已禁用', () => {
    const intr: InterruptConfig = { name: '禁', component: 'sensor_0', state: 1, disabled: true };
    expect(formatInterruptDesc(intr)).toBe('sensor_0 · 【已禁用】');
  });

  it('intercept/delay/duration 为 0 时跳过', () => {
    const intr: InterruptConfig = { name: 'x', component: 's', state: 1, intercept: 0, delay: 0, duration: 0 };
    expect(formatInterruptDesc(intr)).toBe('s');
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

  it('显示流程名和间隔天', () => {
    const sch: ScheduleConfig = { type: 'day', value: 28800000, interval: 2, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 间隔2天');
  });

  it('type=minute 显示间隔分钟', () => {
    const sch: ScheduleConfig = { type: 'minute', value: 0, interval: 5, process: 1 };
    expect(formatScheduleDesc(sch, processes)).toBe('施肥 · 间隔5分钟');
  });

  it('interval=1 不显示间隔', () => {
    const sch: ScheduleConfig = { type: 'day', value: 28800000, interval: 1, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌');
  });

  it('已禁用', () => {
    const sch: ScheduleConfig = { type: 'day', value: 28800000, interval: 2, process: 0, disabled: true };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 间隔2天 · 【已禁用】');
  });

  it('process 索引越界时不显示流程名', () => {
    const sch: ScheduleConfig = { type: 'day', value: 0, interval: 3, process: 99 };
    expect(formatScheduleDesc(sch, processes)).toBe('间隔3天');
  });
});

// ================================================================
// formatProcessDesc
// ================================================================

describe('formatProcessDesc', () => {
  it('仅步骤数', () => {
    const proc: ProcessConfig = { name: '浇花', steps: [{ name: 's1', value: { begin: undefined, end: undefined } }, { name: 's2', value: { begin: undefined, end: undefined } }] };
    expect(formatProcessDesc(proc)).toBe('2个步骤');
  });

  it('有触发时追加触发', () => {
    const proc: ProcessConfig = { name: '浇花', trigger: 'button_1', steps: [{ name: 's1', value: { begin: undefined, end: undefined } }] };
    expect(formatProcessDesc(proc)).toBe('1个步骤 · 触发:button_1');
  });

  it('0个步骤时显示 0个步骤', () => {
    const proc: ProcessConfig = { name: '空', steps: [] };
    expect(formatProcessDesc(proc)).toBe('0个步骤');
  });
});
```

- [ ] **Step 2: 运行测试确认失败（format-desc.ts 尚未创建）**

```bash
npm run test -- __tests__/watering/format-desc.test.ts
```

预期：测试因模块不存在而失败。

---

### Task 3: 提交工具模块和测试

**Files:**
- `app/watering/utils/format-desc.ts` (已创建)
- `__tests__/watering/format-desc.test.ts` (已创建)

- [ ] **Step 1: 运行测试确认全部通过**

```bash
npm run test -- __tests__/watering/format-desc.test.ts
```

预期：全部通过。

- [ ] **Step 2: 提交**

```bash
git add app/watering/utils/format-desc.ts __tests__/watering/format-desc.test.ts
git commit -m "feat(watering): add formatDesc utilities for list description generation"
```

---

### Task 4: 更新中断列表描述

**Files:**
- Modify: `app/watering/components/step-config-picker.tsx`

- [ ] **Step 1: 添加 import 并替换 description**

在文件顶部的 import 区域添加：

```typescript
import { formatInterruptDesc } from '../utils/format-desc';
```

将第 173-177 行的：

```tsx
              <List.Item
                description={intr.component}
                onClick={() => { onEditInterrupt?.(idx); }}
              >
```

替换为：

```tsx
              <List.Item
                description={formatInterruptDesc(intr)}
                onClick={() => { onEditInterrupt?.(idx); }}
              >
```

---

### Task 5: 更新步骤列表描述

**Files:**
- Modify: `app/watering/components/process-config-picker.tsx`

- [ ] **Step 1: 添加 import 并替换 description**

在文件顶部的 import 区域添加：

```typescript
import { formatStepDesc } from '../utils/format-desc';
```

将第 145-151 行的：

```tsx
              <List.Item
                clickable
                description={s.component}
                onClick={() => { onEditStep?.(idx); }}
              >
```

替换为：

```tsx
              <List.Item
                clickable
                description={formatStepDesc(s)}
                onClick={() => { onEditStep?.(idx); }}
              >
```

---

### Task 6: 更新功能列表和计划任务列表描述

**Files:**
- Modify: `app/watering/components/device-config-form.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部的 import 区域添加：

```typescript
import { formatProcessDesc, formatScheduleDesc } from '../utils/format-desc';
```

- [ ] **Step 2: 更新功能列表 — 添加 description**

将第 415-423 行的：

```tsx
            <List.Item
              clickable
              onClick={() => {
                setProcessIndex(index);
                setProcessVisible(true);
              }}
            >
              {proc.name}
            </List.Item>
```

替换为：

```tsx
            <List.Item
              clickable
              description={formatProcessDesc(proc)}
              onClick={() => {
                setProcessIndex(index);
                setProcessVisible(true);
              }}
            >
              {proc.name}
            </List.Item>
```

- [ ] **Step 3: 更新计划任务列表 — 替换 description 并移除 extra**

将第 457-467 行的：

```tsx
              <List.Item
                clickable
                description={`间隔 ${sch.interval} 天`}
                extra={sch.process < form.processes.length ? form.processes[sch.process]?.name ?? '' : ''}
                onClick={() => {
                  setScheduleIndex(index);
                  setScheduleVisible(true);
                }}
              >
                {formatScheduleTime(sch)}
              </List.Item>
```

替换为：

```tsx
              <List.Item
                clickable
                description={formatScheduleDesc(sch, form.processes)}
                onClick={() => {
                  setScheduleIndex(index);
                  setScheduleVisible(true);
                }}
              >
                {formatScheduleTime(sch)}
              </List.Item>
```

---

### Task 7: 格式化、类型检查与验证

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行类型检查和 lint**

```bash
npm run check
```

修复所有报错。

- [ ] **Step 3: 运行全部测试确认无回归**

```bash
npm run test
```

预期：所有测试通过，无回归。

- [ ] **Step 4: 提交**

```bash
git add app/watering/components/step-config-picker.tsx app/watering/components/process-config-picker.tsx app/watering/components/device-config-form.tsx
git commit -m "feat(watering): show config details in list descriptions"
```
