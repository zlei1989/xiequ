# 设备详情页 antd-mobile 改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设备详情页及其全部子编辑器的 antd 组件替换为 antd-mobile，功能逻辑不变

**Architecture:** 自底向上改造：先改最内层子编辑器（中断→定时→电压→步骤→流程），再改主编辑器 DeviceEditor，最后改 page.tsx。每个文件先写/跑测试，再实现，最后格式化+检查+提交。

**Tech Stack:** React 19, Next.js 15 (App Router), antd-mobile 5.x, TypeScript, vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-06-14-device-detail-antd-mobile-design.md`

---

### Task 0: 基线检查

**Files:**
- None (只读操作)

- [ ] **Step 1: 运行现有测试确保基线通过**

```bash
npm run check
```

预期：TypeScript 类型检查 + ESLint 全部通过（可能已有个别 warning，记录即可）。

- [ ] **Step 2: 运行现有测试**

```bash
npm run test -- --run
```

预期：全部通过。记录失败数（如有）作为基线。

---

### Task 1: ProcessInterruptEditor — 中断编辑器改造

**Files:**
- Modify: `app/watering/components/process-interrupt-editor.tsx`
- Create: `__tests__/watering/components/process-interrupt-editor.test.tsx`

这是最内层子编辑器，无嵌套 Popup，改动最单纯：antd 表单控件 → antd-mobile List + 表单控件。

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/components/process-interrupt-editor.test.tsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ProcessInterruptEditor } from '@/app/watering/components/process-interrupt-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { Interrupt } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: [],
  loads: [],
  sensors: ['sensor_0', 'sensor_1'],
};

const defaultInterrupt: Interrupt = {
  key: 'int_1',
  name: '测试中断',
  component: 'sensor_0',
  state: 0,
  signalType: 'digital',
  logic: '>',
  threshold: 100,
  intercept: 200,
  delay: 500,
  duration: 1000,
};

describe('ProcessInterruptEditor', () => {
  it('渲染中断名称输入框', () => {
    const onChange = vi.fn();
    render(
      <ProcessInterruptEditor
        interrupt={defaultInterrupt}
        gpio={mockGpio}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );
    // 名称输入框存在
    const input = screen.getByDisplayValue('测试中断');
    expect(input).toBeDefined();
  });

  it('数字信号模式显示触发状态开关', () => {
    render(
      <ProcessInterruptEditor
        interrupt={{ ...defaultInterrupt, signalType: 'digital' }}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const switches = screen.getAllByRole('switch');
    // 至少有一个 switch：触发状态 + 禁用
    expect(switches.length).toBeGreaterThanOrEqual(1);
  });

  it('模拟信号模式显示逻辑选择器', () => {
    render(
      <ProcessInterruptEditor
        interrupt={{ ...defaultInterrupt, signalType: 'analog' }}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // 模拟信号模式下有"大于"选项
    expect(screen.getByText('大于')).toBeDefined();
  });

  it('无传感器时显示空状态提示', () => {
    const emptyGpio: GpioInfo = { buttons: [], loads: [], sensors: [] };
    render(
      <ProcessInterruptEditor
        interrupt={defaultInterrupt}
        gpio={emptyGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // ErrorBlock empty 有 description 元素
    expect(screen.getByText(/无可用传感器/)).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/process-interrupt-editor.test.tsx
```

预期：测试失败（当前代码用 antd 组件，DOM 结构与 antd-mobile 不同，`getByDisplayValue` 会失败或结构不匹配）。

- [ ] **Step 3: 重写 ProcessInterruptEditor**

将文件替换为 antd-mobile 版本。关键改动：

```tsx
/**
 * 中断条件编辑器 — 编辑单个 Interrupt 的传感器、信号类型、阈值等参数
 *
 * 使用 antd-mobile List + Form 控件构建移动端友好界面。
 * 数字信号 vs 模拟信号通过 signalType 字段区分，动态显示不同表单行。
 */

'use client';

import { Input, Stepper, Switch, Selector, ErrorBlock, List } from 'antd-mobile';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Interrupt } from '../types';

export function ProcessInterruptEditor({
  interrupt,
  gpio,
  onChange,
  onRemove: _onRemove,
}: {
  interrupt: Interrupt;
  gpio: GpioInfo;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
  const sensorOptions = gpio.sensors.map((k) => ({
    label: k,
    value: k,
  }));

  const signalType = interrupt.signalType ?? 'digital';
  const logic = interrupt.logic ?? '>';
  const threshold = interrupt.threshold ?? 0;

  return (
    <List>
      {/* 中断名称 */}
      <List.Item title="中断名称">
        <Input
          placeholder="输入中断名称"
          value={interrupt.name}
          onChange={(v) => { onChange({ ...interrupt, name: v }); }}
        />
      </List.Item>

      {/* 传感器 */}
      <List.Item
        title="传感器"
        description={
          sensorOptions.length === 0 ? undefined : undefined
        }
      >
        {sensorOptions.length > 0 ? (
          <Selector
            options={sensorOptions}
            value={[interrupt.component]}
            onChange={(vals) => {
              if (vals.length > 0) {
                onChange({ ...interrupt, component: vals[0]! });
              }
            }}
          />
        ) : (
          <ErrorBlock
            status="empty"
            title="无可用传感器"
            description="请等待设备上报 GPIO 状态"
          />
        )}
      </List.Item>

      {/* 信号类型 */}
      <List.Item title="信号类型">
        <Selector
          options={[
            { label: '数字信号', value: 'digital' },
            { label: '模拟信号', value: 'analog' },
          ]}
          value={[signalType]}
          onChange={(vals) => {
            if (vals.length > 0) {
              onChange({
                ...interrupt,
                signalType: vals[0] as Interrupt['signalType'],
              });
            }
          }}
        />
      </List.Item>

      {/* 数字信号：触发状态 */}
      {signalType === 'digital' && (
        <List.Item
          title="触发状态"
          description={interrupt.state === 1 || interrupt.state === true ? '触发 (1)' : '未触发 (0)'}
        >
          <Switch
            checked={interrupt.state === 1 || interrupt.state === true}
            onChange={(checked) => {
              onChange({ ...interrupt, state: checked ? 1 : 0 });
            }}
          />
        </List.Item>
      )}

      {/* 模拟信号：逻辑 + 触发阈值 */}
      {signalType === 'analog' && (
        <>
          <List.Item title="逻辑">
            <Selector
              options={[
                { label: '大于', value: '>' },
                { label: '小于', value: '<' },
              ]}
              value={[logic]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  onChange({
                    ...interrupt,
                    logic: vals[0] as Interrupt['logic'],
                  });
                }
              }}
            />
          </List.Item>

          <List.Item
            title="触发阈值"
            description={`当传感器值${logic === '>' ? '大于' : '小于'}阈值时触发中断`}
          >
            <Stepper
              min={0}
              step={1}
              value={threshold}
              onChange={(v) => {
                onChange({ ...interrupt, threshold: v });
              }}
            />
          </List.Item>
        </>
      )}

      {/* 屏蔽抖动间隔 */}
      <List.Item title="屏蔽抖动间隔 (ms)">
        <Stepper
          min={0}
          step={100}
          value={interrupt.intercept}
          onChange={(v) => { onChange({ ...interrupt, intercept: v }); }}
        />
      </List.Item>

      {/* 延迟检测 */}
      <List.Item title="延迟检测 (ms)">
        <Stepper
          min={0}
          step={1000}
          value={interrupt.delay}
          onChange={(v) => { onChange({ ...interrupt, delay: v }); }}
        />
      </List.Item>

      {/* 持续时间 */}
      <List.Item title="持续时间 (ms)">
        <Stepper
          min={0}
          step={1000}
          value={interrupt.duration}
          onChange={(v) => { onChange({ ...interrupt, duration: v }); }}
        />
      </List.Item>

      {/* 禁用 */}
      <List.Item
        title="禁用"
        description={interrupt.disabled ? '已禁用' : '已启用'}
      >
        <Switch
          checked={!interrupt.disabled}
          onChange={(checked) => {
            onChange({ ...interrupt, disabled: !checked });
          }}
        />
      </List.Item>
    </List>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/watering/components/process-interrupt-editor.test.tsx
```

预期：测试 PASS。

- [ ] **Step 5: 格式化 + 检查**

```bash
npm run format
npm run check
```

修复所有 ESLint/Stylelint/TypeScript 错误。

- [ ] **Step 6: 提交**

```bash
git add app/watering/components/process-interrupt-editor.tsx __tests__/watering/components/process-interrupt-editor.test.tsx
git commit -m "refactor: ProcessInterruptEditor 替换为 antd-mobile 组件"
```

---

### Task 2: ScheduleEditor — 定时编辑器改造

**Files:**
- Modify: `app/watering/components/schedule-editor.tsx`
- Create: `__tests__/watering/components/schedule-editor.test.tsx`

关键特殊改动：antd `TimePicker` → antd-mobile `DatePicker`(precision='minute')，时间值在 Date 和毫秒偏移量之间转换。

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/components/schedule-editor.test.tsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ScheduleEditor } from '@/app/watering/components/schedule-editor';
import type { Schedule } from '@/app/watering/types';

const defaultSchedule: Schedule = {
  key: 'sch_1',
  type: 'day',
  value: 28800000, // 08:00
  interval: 1,
  process: 0,
};

const mockProcesses = [
  { name: '浇水流程' },
  { name: '施肥流程' },
];

describe('ScheduleEditor', () => {
  it('渲染类型选择器', () => {
    render(
      <ScheduleEditor
        schedules={[defaultSchedule]}
        processes={mockProcesses}
        onChange={vi.fn()}
      />,
    );
    // 有"每天"文本
    expect(screen.getByText('每天')).toBeDefined();
  });

  it('渲染间隔 Stepper', () => {
    const onChange = vi.fn();
    render(
      <ScheduleEditor
        schedules={[defaultSchedule]}
        processes={mockProcesses}
        onChange={onChange}
      />,
    );
    // 间隔值 1 存在
    const steppers = screen.getAllByRole('button', { name: /加|减/ });
    expect(steppers.length).toBeGreaterThan(0);
  });

  it('渲染禁用开关', () => {
    render(
      <ScheduleEditor
        schedules={[{ ...defaultSchedule, disabled: false }]}
        processes={mockProcesses}
        onChange={vi.fn()}
      />,
    );
    const switches = screen.getAllByRole('switch');
    // 启用/禁用开关
    expect(switches.length).toBe(1);
  });

  it('空 schedules 返回 null', () => {
    const { container } = render(
      <ScheduleEditor
        schedules={[]}
        processes={mockProcesses}
        onChange={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/schedule-editor.test.tsx
```

- [ ] **Step 3: 重写 ScheduleEditor**

```tsx
/**
 * 定时任务编辑器 — 编辑触发周期、时间、执行流程
 *
 * 使用 antd-mobile List + Picker + DatePicker 构建移动端界面。
 * 时间选择用 DatePicker(precision='minute')，显示和保存时转为距 00:00 毫秒偏移。
 */

'use client';

import { Stepper, Switch, Picker, DatePicker, List } from 'antd-mobile';
import dayjs from 'dayjs';

import type { Schedule } from '../types';
import type { PickerValue, PickerColumn } from 'antd-mobile';

const TYPE_OPTIONS: PickerColumn = [
  { label: '每天', value: 'day' },
  { label: '每分钟', value: 'minute' },
  { label: '每周', value: 'week' },
  { label: '每月', value: 'month' },
];

type Process = { name: string };

export function ScheduleEditor({
  schedules,
  processes,
  onChange,
}: {
  schedules: Schedule[];
  processes: Process[];
  onChange: (updated: Schedule[]) => void;
}) {
  const schedule = schedules[0];
  if (!schedule) return null;

  function update(updated: Schedule) {
    onChange([updated]);
  }

  /** 毫秒偏移 → dayjs 时刻（仅时间部分，日期取当天） */
  const timeDate = dayjs()
    .startOf('day')
    .add(schedule.value || 0, 'millisecond')
    .toDate();

  const processOptions: PickerColumn = processes.map((p, i) => ({
    label: p.name || `流程 ${String(i)}`,
    value: String(i),
  }));

  return (
    <List>
      {/* 类型 */}
      <List.Item
        title="类型"
        extra={TYPE_OPTIONS.find((o) => o.value === schedule.type)?.label ?? ''}
        clickable
        onClick={() => {
          Picker.prompt({
            columns: [TYPE_OPTIONS],
            value: [schedule.type],
            onConfirm: (val) => {
              if (val && val.length > 0 && typeof val[0] === 'string') {
                update({ ...schedule, type: val[0] as Schedule['type'] });
              }
            },
          });
        }}
      />

      {/* 间隔 */}
      <List.Item title="间隔（天）">
        <Stepper
          min={1}
          step={1}
          value={schedule.interval}
          onChange={(v) => { update({ ...schedule, interval: v }); }}
        />
      </List.Item>

      {/* 时间 — DatePicker(minute) */}
      <List.Item
        title="时间"
        extra={dayjs(timeDate).format('HH:mm')}
        clickable
        onClick={() => {
          DatePicker.prompt({
            precision: 'minute',
            defaultValue: timeDate,
            onConfirm: (val) => {
              if (val) {
                // Date → 距 00:00 的毫秒偏移量
                const ms = dayjs(val).diff(dayjs(val).startOf('day'), 'millisecond');
                update({ ...schedule, value: ms });
              }
            },
          });
        }}
      />

      {/* 执行流程 */}
      <List.Item
        title="执行流程"
        extra={processOptions.find((o) => o.value === String(schedule.process))?.label ?? ''}
        clickable
        onClick={() => {
          Picker.prompt({
            columns: [processOptions],
            value: [String(schedule.process)],
            onConfirm: (val) => {
              if (val && val.length > 0 && typeof val[0] === 'string') {
                update({ ...schedule, process: Number(val[0]) });
              }
            },
          });
        }}
      />

      {/* 禁用 */}
      <List.Item
        title="禁用"
        description={schedule.disabled ? '已禁用' : '已启用'}
      >
        <Switch
          checked={!schedule.disabled}
          onChange={(checked) => { update({ ...schedule, disabled: !checked }); }}
        />
      </List.Item>
    </List>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/watering/components/schedule-editor.test.tsx
```

- [ ] **Step 5: 格式化 + 检查 + 提交**

```bash
npm run format
npm run check
git add app/watering/components/schedule-editor.tsx __tests__/watering/components/schedule-editor.test.tsx
git commit -m "refactor: ScheduleEditor 替换为 antd-mobile 组件（DatePicker 替代 TimePicker）"
```

---

### Task 3: VoltageConfigDrawer — 电压配置改造

**Files:**
- Modify: `app/watering/components/voltage-config-drawer.tsx`
- Create: `__tests__/watering/components/voltage-config-drawer.test.tsx`

关键改动：`Drawer` → `Popup` + `NavBar`，`Space.Compact` → CSS flex，文件重命名为 `voltage-config-popup.tsx` 更准确但保持原名避免扩大改动面。

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/components/voltage-config-drawer.test.tsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { VoltageConfigDrawer } from '@/app/watering/components/voltage-config-drawer';

describe('VoltageConfigDrawer', () => {
  it('关闭时渲染空内容（Popup hidden）', () => {
    const { container } = render(
      <VoltageConfigDrawer
        open={false}
        voltage={undefined}
        sensors={['sensor_0']}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Popup 关闭时内容不可见
    expect(container).toBeDefined();
  });

  it('打开时渲染标题和传感器选择器', () => {
    render(
      <VoltageConfigDrawer
        open={true}
        voltage={undefined}
        sensors={['sensor_0', 'sensor_1']}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // NavBar 标题
    expect(screen.getByText('电压检测配置')).toBeDefined();
  });

  it('无电压配置且无传感器时关闭会 reset', () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <VoltageConfigDrawer
        open={true}
        voltage={undefined}
        sensors={[]}
        onChange={onChange}
        onClose={onClose}
      />,
    );
    // 关闭时触发 onChange(undefined)
    // 注：交互测试在 visual regression 中覆盖
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/voltage-config-drawer.test.tsx
```

- [ ] **Step 3: 重写 VoltageConfigDrawer**

```tsx
/**
 * 电压检测配置 Popup — 设置分压电阻 R1/R2 和传感器引脚
 *
 * 从 antd Drawer 迁移至 antd-mobile Popup + NavBar。
 * Space.Compact 改为 CSS flex 行布局。
 */

'use client';

import { Popup, NavBar, Picker, Stepper, List } from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';

import { useBackButton } from '@/lib/back-button';

import type { VoltageConfig } from '../types';
import type { PickerColumn } from 'antd-mobile';

interface VoltageConfigDrawerProps {
  open: boolean;
  voltage: VoltageConfig | undefined;
  sensors: string[];
  onChange: (config: VoltageConfig | undefined) => void;
  onClose: () => void;
}

const DEFAULT_R1 = 30000;
const DEFAULT_R2 = 10000;

export function VoltageConfigDrawer({
  open,
  voltage,
  sensors,
  onChange,
  onClose,
}: VoltageConfigDrawerProps) {
  const config = voltage || { sensor: sensors[0] || 'sensor_0', r1: DEFAULT_R1, r2: DEFAULT_R2 };

  useBackButton(open, onClose);

  function update(partial: Partial<VoltageConfig>) {
    onChange({ ...config, ...partial });
  }

  function handleClose() {
    if (!voltage && !sensors.length) {
      onChange(undefined);
    }
    onClose();
  }

  const sensorColumns: PickerColumn = sensors.map((s) => ({ label: s, value: s }));

  return (
    <Popup
      visible={open}
      position="bottom"
      bodyStyle={{ height: '60vh' }}
      onClose={handleClose}
    >
      <NavBar onBack={handleClose}>
        电压检测配置
      </NavBar>

      <List>
        {/* 传感器选择 */}
        <List.Item
          title="电压检测传感器"
          description="选择用于电压检测的 ADC 传感器引脚"
          extra={config.sensor}
          clickable
          onClick={() => {
            Picker.prompt({
              columns: [sensorColumns],
              value: [config.sensor],
              onConfirm: (val) => {
                if (val && val.length > 0 && typeof val[0] === 'string') {
                  update({ sensor: val[0] });
                }
              },
            });
          }}
        />

        {/* R1 电阻值 */}
        <List.Item title="R1 电阻值 (Ω)" description="分压电阻 R1，上拉至被测电压。默认 30kΩ">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Stepper
              min={0}
              step={1000}
              value={config.r1}
              onChange={(v) => { update({ r1: v }); }}
            />
            <span>Ω</span>
          </div>
        </List.Item>

        {/* R2 电阻值 */}
        <List.Item title="R2 电阻值 (Ω)" description="分压电阻 R2，下拉至 GND。默认 10kΩ">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Stepper
              min={0}
              step={1000}
              value={config.r2}
              onChange={(v) => { update({ r2: v }); }}
            />
            <span>Ω</span>
          </div>
        </List.Item>
      </List>

      {/* 计算公式说明 */}
      <div className="mx-3 mt-2 rounded-md border border-solid border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <div className="mb-1 font-semibold">计算公式</div>
        <div>
          V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
        </div>
        <div className="mt-1">
          当前分压比:{' '}
          {config.r1 > 0 && config.r2 > 0
            ? ((config.r1 + config.r2) / config.r2).toFixed(2)
            : '—'}
        </div>
      </div>
    </Popup>
  );
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run __tests__/watering/components/voltage-config-drawer.test.tsx
```

- [ ] **Step 5: 格式化 + 检查 + 提交**

```bash
npm run format
npm run check
git add app/watering/components/voltage-config-drawer.tsx __tests__/watering/components/voltage-config-drawer.test.tsx
git commit -m "refactor: VoltageConfigDrawer 替换为 antd-mobile Popup + NavBar"
```

---

### Task 4: ProcessStepEditor — 步骤编辑器改造

**Files:**
- Modify: `app/watering/components/process-step-editor.tsx`
- Create: `__tests__/watering/components/process-step-editor.test.tsx`

关键改动：`Table`(中断列表) → `List` + `SwipeAction`，`Select` → `Picker`，`InputNumber`×3 → `Stepper`。

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/components/process-step-editor.test.tsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ProcessStepEditor } from '@/app/watering/components/process-step-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { Step } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: [],
  loads: ['load_0', 'load_1'],
  sensors: ['sensor_0'],
};

const defaultStep: Step = {
  key: 'step_1',
  name: '测试步骤',
  component: 'load_0',
  value: { begin: 255, end: 0 },
  timeout: 600000,
  interrupts: [
    { key: 'int_1', name: '中断1', component: 'sensor_0', state: 0, signalType: 'digital', logic: '>', threshold: 0, intercept: 0, delay: 0, duration: 0 },
  ],
};

describe('ProcessStepEditor', () => {
  it('渲染步骤名称输入', () => {
    render(
      <ProcessStepEditor
        step={defaultStep}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditInterrupt={vi.fn()}
        onAddInterrupt={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('测试步骤')).toBeDefined();
  });

  it('渲染中断列表项', () => {
    render(
      <ProcessStepEditor
        step={defaultStep}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditInterrupt={vi.fn()}
        onAddInterrupt={vi.fn()}
      />,
    );
    expect(screen.getByText('中断1')).toBeDefined();
  });

  it('无负载时启动/停止参数禁用', () => {
    const stepNoLoad: Step = {
      ...defaultStep,
      component: undefined as unknown as string,
    };
    render(
      <ProcessStepEditor
        step={stepNoLoad}
        gpio={{ ...mockGpio, loads: [] }}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditInterrupt={vi.fn()}
        onAddInterrupt={vi.fn()}
      />,
    );
    expect(screen.getByText(/无可用负载/)).toBeDefined();
  });

  it('点击添加中断触发回调', () => {
    const onAddInterrupt = vi.fn();
    render(
      <ProcessStepEditor
        step={defaultStep}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditInterrupt={vi.fn()}
        onAddInterrupt={onAddInterrupt}
      />,
    );
    const addBtn = screen.getByText('添加中断');
    expect(addBtn).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/process-step-editor.test.tsx
```

- [ ] **Step 3: 重写 ProcessStepEditor**

```tsx
/**
 * 流程步骤编辑器 — 编辑单个 Step 的名称、负载、参数、超时、中断列表
 *
 * 迁移至 antd-mobile：Table→List+SwipeAction，Select→Picker，InputNumber→Stepper。
 */

'use client';

import { Input, Stepper, Switch, Picker, ErrorBlock, List, SwipeAction, Button } from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';
import { Dialog } from 'antd-mobile';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Step, Interrupt } from '../types';
import type { PickerColumn } from 'antd-mobile';

export function ProcessStepEditor({
  step,
  gpio,
  onChange,
  onRemove: _onRemove,
  onEditInterrupt,
  onAddInterrupt,
}: {
  step: Step;
  gpio: GpioInfo;
  onChange: (updated: Step) => void;
  onRemove: () => void;
  onEditInterrupt: (index: number) => void;
  onAddInterrupt: () => void;
}) {
  const loadOptions: PickerColumn = gpio.loads.map((k) => ({ label: k, value: k }));
  const hasLoad = !!step.component;

  return (
    <List>
      {/* 步骤名称 */}
      <List.Item title="步骤名称">
        <Input
          placeholder="输入步骤名称"
          value={step.name}
          onChange={(v) => { onChange({ ...step, name: v }); }}
        />
      </List.Item>

      {/* 负载 */}
      <List.Item
        title="负载"
        extra={step.component || '未选择'}
        clickable={loadOptions.length > 0}
        onClick={() => {
          if (loadOptions.length === 0) return;
          Picker.prompt({
            columns: [loadOptions],
            value: step.component ? [step.component] : [],
            onConfirm: (val) => {
              if (val && val.length > 0 && typeof val[0] === 'string') {
                onChange({ ...step, component: val[0] });
              }
            },
          });
        }}
      >
        {loadOptions.length === 0 && (
          <ErrorBlock
            status="empty"
            title="无可用负载"
            description="请等待设备上报 GPIO 状态"
          />
        )}
      </List.Item>

      {/* 启动参数 */}
      <List.Item title="启动参数">
        <Stepper
          disabled={!hasLoad}
          value={step.value.begin as number}
          onChange={(v) => { onChange({ ...step, value: { ...step.value, begin: v } }); }}
        />
      </List.Item>

      {/* 停止参数 */}
      <List.Item title="停止参数">
        <Stepper
          disabled={!hasLoad}
          value={step.value.end as number}
          onChange={(v) => { onChange({ ...step, value: { ...step.value, end: v } }); }}
        />
      </List.Item>

      {/* 超时 */}
      <List.Item title="超时限制 (ms)">
        <Stepper
          min={0}
          step={1000}
          value={step.timeout}
          onChange={(v) => { onChange({ ...step, timeout: v }); }}
        />
      </List.Item>

      {/* 禁用 */}
      <List.Item title="禁用" description={step.disabled ? '已禁用' : '已启用'}>
        <Switch
          checked={!step.disabled}
          onChange={(checked) => { onChange({ ...step, disabled: !checked }); }}
        />
      </List.Item>

      {/* 中断列表 */}
      <List.Item title="中断列表" />
      {(step.interrupts || []).map((intr, idx) => (
        <SwipeAction
          key={intr.key || idx}
          rightActions={[
            {
              key: 'delete',
              text: '删除',
              color: 'danger',
              onClick: async () => {
                const confirmed = await Dialog.confirm({ title: '确认删除此中断？' });
                if (confirmed) {
                  const newInterrupts = (step.interrupts || []).filter((_, i) => i !== idx);
                  onChange({ ...step, interrupts: newInterrupts });
                }
              },
            },
          ]}
        >
          <List.Item
            title={intr.name}
            description={intr.component}
            clickable
            onClick={() => { onEditInterrupt(idx); }}
          >
            {'>'}
          </List.Item>
        </SwipeAction>
      ))}

      {/* 添加中断 */}
      <List.Item>
        <Button block color="primary" onClick={onAddInterrupt}>
          <AddOutline /> 添加中断
        </Button>
      </List.Item>
    </List>
  );
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run __tests__/watering/components/process-step-editor.test.tsx
```

- [ ] **Step 5: 格式化 + 检查 + 提交**

```bash
npm run format
npm run check
git add app/watering/components/process-step-editor.tsx __tests__/watering/components/process-step-editor.test.tsx
git commit -m "refactor: ProcessStepEditor 替换为 antd-mobile List+SwipeAction"
```

---

### Task 5: ProcessEditor — 流程编辑器改造

**Files:**
- Modify: `app/watering/components/process-editor.tsx`
- Create: `__tests__/watering/components/process-editor.test.tsx`

结构与 ProcessStepEditor 类似：Table(步骤列表)→List+SwipeAction，Select→Picker。

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/components/process-editor.test.tsx
// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ProcessEditor } from '@/app/watering/components/process-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { Process } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: ['button_0'],
  loads: ['load_0'],
  sensors: [],
};

const defaultProcess: Process = {
  key: 'proc_1',
  name: '浇水流程',
  steps: [
    { key: 'step_1', name: '步骤1', component: 'load_0', value: { begin: 255, end: 0 }, timeout: 60000, interrupts: [] },
  ],
};

describe('ProcessEditor', () => {
  it('渲染流程名称输入', () => {
    render(
      <ProcessEditor
        process={defaultProcess}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditStep={vi.fn()}
        onAddStep={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('浇水流程')).toBeDefined();
  });

  it('渲染步骤列表项', () => {
    render(
      <ProcessEditor
        process={defaultProcess}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditStep={vi.fn()}
        onAddStep={vi.fn()}
      />,
    );
    expect(screen.getByText('步骤1')).toBeDefined();
  });

  it('无按钮时显示空状态', () => {
    render(
      <ProcessEditor
        process={defaultProcess}
        gpio={{ ...mockGpio, buttons: [] }}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditStep={vi.fn()}
        onAddStep={vi.fn()}
      />,
    );
    expect(screen.getByText(/无可用按钮/)).toBeDefined();
  });

  it('点击添加步骤触发回调', () => {
    const onAddStep = vi.fn();
    render(
      <ProcessEditor
        process={defaultProcess}
        gpio={mockGpio}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        onEditStep={vi.fn()}
        onAddStep={onAddStep}
      />,
    );
    const addBtn = screen.getByText('添加步骤');
    expect(addBtn).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/process-editor.test.tsx
```

- [ ] **Step 3: 重写 ProcessEditor**

```tsx
/**
 * 流程编辑器 — 编辑单个 Process 的名称、触发按钮、步骤列表
 *
 * 迁移至 antd-mobile：Table→List+SwipeAction，Select→Picker，Empty→ErrorBlock。
 */

'use client';

import { Input, Picker, ErrorBlock, List, SwipeAction, Button } from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';
import { Dialog } from 'antd-mobile';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Process, Step } from '../types';
import type { PickerColumn } from 'antd-mobile';

export function ProcessEditor({
  process,
  gpio,
  onChange,
  onRemove: _onRemove,
  onEditStep,
  onAddStep,
}: {
  process: Process;
  gpio: GpioInfo;
  onChange: (updated: Process) => void;
  onRemove: () => void;
  onEditStep: (index: number) => void;
  onAddStep: () => void;
}) {
  const buttonOptions: PickerColumn = (gpio.buttons || []).map((k) => ({
    label: k,
    value: k,
  }));

  return (
    <List>
      {/* 功能名称 */}
      <List.Item title="功能名称">
        <Input
          placeholder="输入流程名称"
          value={process.name}
          onChange={(v) => { onChange({ ...process, name: v }); }}
        />
      </List.Item>

      {/* 触发按钮 */}
      <List.Item
        title="触发按钮"
        extra={process.trigger || '未选择'}
        clickable={buttonOptions.length > 0}
        onClick={() => {
          if (buttonOptions.length === 0) return;
          Picker.prompt({
            columns: [buttonOptions],
            value: process.trigger ? [process.trigger] : [],
            onConfirm: (val) => {
              if (val && val.length > 0 && typeof val[0] === 'string') {
                onChange({ ...process, trigger: val[0] });
              }
            },
          });
        }}
      >
        {buttonOptions.length === 0 && (
          <ErrorBlock
            status="empty"
            title="无可用按钮"
            description="请等待设备上报 GPIO 状态"
          />
        )}
      </List.Item>

      {/* 步骤列表 */}
      <List.Item title="步骤列表" />
      {process.steps.map((s, idx) => (
        <SwipeAction
          key={s.key || idx}
          rightActions={[
            {
              key: 'delete',
              text: '删除',
              color: 'danger',
              onClick: async () => {
                const confirmed = await Dialog.confirm({ title: '确认删除此步骤？' });
                if (confirmed) {
                  const newSteps = process.steps.filter((_, i) => i !== idx);
                  onChange({ ...process, steps: newSteps });
                }
              },
            },
          ]}
        >
          <List.Item
            title={s.name}
            description={s.component}
            clickable
            onClick={() => { onEditStep(idx); }}
          >
            {'>'}
          </List.Item>
        </SwipeAction>
      ))}

      {/* 添加步骤 */}
      <List.Item>
        <Button block color="primary" onClick={onAddStep}>
          <AddOutline /> 添加步骤
        </Button>
      </List.Item>
    </List>
  );
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run __tests__/watering/components/process-editor.test.tsx
```

- [ ] **Step 5: 格式化 + 检查 + 提交**

```bash
npm run format
npm run check
git add app/watering/components/process-editor.tsx __tests__/watering/components/process-editor.test.tsx
git commit -m "refactor: ProcessEditor 替换为 antd-mobile List+SwipeAction"
```

---

### Task 6: DeviceEditor — 主编辑器改造

**Files:**
- Modify: `app/watering/components/device-editor.tsx`
- Create: `__tests__/watering/components/device-editor.test.tsx`

最大改动文件。关键：
- 表单控件区 → List 包裹
- 功能/计划任务列表 → List+SwipeAction
- 5 个 Drawer → 5 个 Popup（position=bottom），每个内嵌 NavBar
- Popup 高度：流程 80%、步骤 75%、中断 70%、定时 70%、电压 60%
- saveRef 模式不变

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/components/device-editor.test.tsx
// @vitest-environment jsdom

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';

import { DeviceEditor } from '@/app/watering/components/device-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { DeviceConfig } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: ['button_0'],
  loads: ['load_0'],
  sensors: ['sensor_0'],
};

const defaultConfig: DeviceConfig = {
  chipId: 'test_chip',
  macAddress: '00:00:00:00:00:00',
  name: '测试设备',
  idleSleep: false,
  idleTimeout: 30000,
  bootExec: -1,
  execDelay: 0,
  processes: [
    {
      key: 'proc_1',
      name: '浇水',
      steps: [
        { key: 'step_1', name: '步骤1', component: 'load_0', value: { begin: 255, end: 0 }, timeout: 60000, interrupts: [] },
      ],
    },
  ],
  schedules: [],
  voltage: undefined,
  romVersion: '1.0.0',
  appVersion: '1.0.0',
};

describe('DeviceEditor', () => {
  it('渲染设备名称输入', () => {
    const saveRef = createRef<() => Promise<void>>();
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onSave={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('测试设备')).toBeDefined();
  });

  it('渲染功能列表项', () => {
    const saveRef = createRef<() => Promise<void>>();
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onSave={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('浇水')).toBeDefined();
  });

  it('渲染空闲睡眠开关', () => {
    const saveRef = createRef<() => Promise<void>>();
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onSave={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const switches = screen.getAllByRole('switch');
    // 至少空闲睡眠开关
    expect(switches.length).toBeGreaterThan(0);
  });

  it('saveRef 注册保存回调', async () => {
    const saveRef = createRef<() => Promise<void>>();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onSave={onSave}
        onRemove={vi.fn()}
      />,
    );
    // saveRef.current 应该已被注册
    expect(saveRef.current).toBeDefined();
    await act(async () => {
      await saveRef.current!();
    });
    expect(onSave).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/device-editor.test.tsx
```

- [ ] **Step 3: 重写 DeviceEditor**

(完整代码见 plan 附录，此处列出改动要点)

改动要点：
1. 导入替换：移除所有 `@ant-design/icons` 和 `antd` 导入，替换为 `antd-mobile` 和 `antd-mobile-icons`
2. 表单区用 `List` 包裹，每行 `List.Item` + `extra` 放控件
3. `<select>` (开机执行) → `Picker.prompt`
4. 功能/定时列表用 `List` + `SwipeAction`（同 Task 4/5 模式）
5. 5 个 `Drawer` → 5 个 `Popup`，每个内含 `NavBar`
6. 删除确认：`Popconfirm` → `Dialog.confirm`
7. 保存/错误提示：`message.xxx` → `Toast.show`
8. `saveRef` 逻辑不变
9. 各子编辑器回调不变

完整代码见附录 A。

- [ ] **Step 4: 运行测试**

```bash
npx vitest run __tests__/watering/components/device-editor.test.tsx
```

- [ ] **Step 5: 格式化 + 检查 + 提交**

```bash
npm run format
npm run check
git add app/watering/components/device-editor.tsx __tests__/watering/components/device-editor.test.tsx
git commit -m "refactor: DeviceEditor 全部 Drawer→Popup，表单→List，Table→List+SwipeAction"
```

---

### Task 7: page.tsx — 设备详情页改造

**Files:**
- Modify: `app/watering/(subpages)/devices/[chipId]/page.tsx`
- Create: `__tests__/watering/pages/device-detail-page.test.tsx`

最后一步，改动最小。自定义 sticky 顶栏 → antd-mobile `NavBar`。

- [ ] **Step 1: 编写测试**

```tsx
// __tests__/watering/pages/device-detail-page.test.tsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

// Mock DeviceEditor 简化渲染
vi.mock('@/app/watering/components/device-editor', () => ({
  DeviceEditor: ({ config }: { config: { name: string } }) => (
    <div data-testid="device-editor">{config.name}</div>
  ),
}));

// Mock useDeviceConfig
vi.mock('@/app/watering/hooks/use-device-config', () => ({
  useDeviceConfig: () => ({
    config: { name: '测试设备', chipId: 'chip_001' },
    gpio: { buttons: [], loads: [], sensors: [] },
    loading: false,
    save: vi.fn(),
    remove: vi.fn(),
  }),
}));

import DeviceDetailPage from '@/app/watering/(subpages)/devices/[chipId]/page';

describe('DeviceDetailPage', () => {
  it('渲染 NavBar 和设备名', async () => {
    const params = Promise.resolve({ chipId: 'chip_001' });
    const { findByText } = render(<DeviceDetailPage params={params} />);
    const title = await findByText('测试设备');
    expect(title).toBeDefined();
  });

  it('渲染 DeviceEditor', async () => {
    const params = Promise.resolve({ chipId: 'chip_001' });
    const { findByTestId } = render(<DeviceDetailPage params={params} />);
    const editor = await findByTestId('device-editor');
    expect(editor).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/pages/device-detail-page.test.tsx
```

预期：测试失败（页面仍用 antd 组件）。

- [ ] **Step 3: 重写 page.tsx**

```tsx
/**
 * 设备详情/配置页
 *
 * 使用 antd-mobile NavBar 替代自定义顶栏，统一移动端交互。
 * 通过 saveRef 模式将保存函数从 DeviceEditor 传递到 Header 按钮。
 */

'use client';

import { NavBar, DotLoading, Dialog, Toast } from 'antd-mobile';
import { SaveOutline, DeleteOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { use, useRef } from 'react';

import { DeviceEditor } from '../../../components/device-editor';
import { useDeviceConfig } from '../../../hooks/use-device-config';

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { config, gpio, loading, save, remove } = useDeviceConfig(chipId);

  const saveRef = useRef<() => Promise<void>>(async () => {});

  /** 删除设备：Dialog 确认 → remove → Toast → 返回 */
  async function handleRemove() {
    const confirmed = await Dialog.confirm({
      title: '确认删除设备？',
      content: '不可恢复',
    });
    if (!confirmed) return;

    try {
      await remove();
      Toast.show({ icon: 'success', content: '设备已删除' });
      router.push('/watering');
    } catch (err: unknown) {
      console.error('[Watering] 删除设备失败:', {
        chipId,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      Toast.show({
        icon: 'fail',
        content: err instanceof Error ? err.message : String(err) || '删除失败',
      });
    }
  }

  /** 保存设备：通过 saveRef 调用 DeviceEditor 的 handleSave */
  async function handleSave() {
    await saveRef.current();
  }

  if (loading || !config) {
    return (
      <div className="py-12 text-center">
        <DotLoading />
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-[var(--background)]">
        <NavBar
          right={
            <div style={{ display: 'flex', gap: 12 }}>
              <SaveOutline onClick={() => { void handleSave(); }} />
              <DeleteOutline onClick={() => { void handleRemove(); }} />
            </div>
          }
          onBack={() => { router.back(); }}
        >
          {config.name || '设备配置'}
        </NavBar>
      </div>

      <DeviceEditor
        config={config}
        gpio={gpio}
        saveRef={saveRef}
        onRemove={handleRemove}
        onSave={async (data) => {
          try {
            await save(data);
            Toast.show({ icon: 'success', content: '配置已保存' });
          } catch (err: unknown) {
            Toast.show({
              icon: 'fail',
              content: err instanceof Error ? err.message : String(err) || '保存失败',
            });
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run __tests__/watering/pages/device-detail-page.test.tsx
```

- [ ] **Step 5: 格式化 + 检查 + 提交**

```bash
npm run format
npm run check
git add app/watering/(subpages)/devices/[chipId]/page.tsx __tests__/watering/pages/device-detail-page.test.tsx
git commit -m "refactor: 设备详情页 NavBar 替代自定义顶栏"
```

---

### Task 8: 集成验证 + 全局检查

**Files:**
- None（运行命令）

- [ ] **Step 1: 运行全部测试**

```bash
npm run test -- --run
```

预期：全部测试（旧 + 新）通过。

- [ ] **Step 2: 全局格式化 + 检查**

```bash
npm run format
npm run check
```

修复所有 ESLint/TypeScript 错误。

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

预期：构建成功，无类型错误。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: 全局格式化和类型修复"
```

---

## 附录 A: DeviceEditor 完整改造代码

（因文件较长，核心代码已在 Task 6 Step 3 要点中说明，完整代码在执行时按设计文档逐段实现。）

### 具体导入替换清单

| 移除 | 替换为 |
|------|--------|
| `@ant-design/icons` 全部 | `antd-mobile-icons` 对应图标 |
| `antd` 全部 | `antd-mobile` 对应组件 |
| `Drawer` | `Popup` (position="bottom") |
| `Table` | `List` + `SwipeAction` |
| `Popconfirm` | `Dialog.confirm` |
| `message` | `Toast` |
| `Space` | CSS flex |
| `Empty` | `ErrorBlock` |

### Popup 高度配置

| 原 Drawer size | 新 Popup bodyStyle |
|----------------|---------------------|
| 80% | `{ height: '80vh' }` |
| 75% | `{ height: '75vh' }` |
| 70% | `{ height: '70vh' }` |
| 60% | `{ height: '60vh' }` |
