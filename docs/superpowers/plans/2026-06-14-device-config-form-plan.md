# DeviceConfigForm 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `DeviceEditor`/`device-editor.tsx` 重构为 `DeviceConfigForm`/`device-config-form.tsx`，基本设置区 List→Form，5 个子编辑器统一为 `XxxPicker` 命名（声明式组件 + 静态 `.prompt()`），类型统一加 `Config` 后缀。

**Architecture:** 自底向上迁移：先重命名类型，再逐个改造子编辑器为 Picker，最后重构主表单并接入所有 Picker。`.prompt()` 使用 antd-mobile 内部 `renderToBody` 实现命令式渲染。

**Tech Stack:** React 18, antd-mobile 5.42.3, Next.js App Router, TypeScript

---

### Task 1: 类型重命名（types.ts + 全量 import 更新）

**Files:**
- Modify: `app/watering/types.ts`
- Modify: `app/watering/hooks/use-device-config.ts`
- Modify: `app/watering/components/device-editor.tsx`
- Modify: `app/watering/components/process-editor.tsx`
- Modify: `app/watering/components/process-step-editor.tsx`
- Modify: `app/watering/components/process-interrupt-editor.tsx`
- Modify: `app/watering/components/schedule-editor.tsx`
- Modify: `__tests__/watering/components/process-editor.test.tsx`
- Modify: `__tests__/watering/components/process-step-editor.test.tsx`
- Modify: `__tests__/watering/components/process-interrupt-editor.test.tsx`
- Modify: `__tests__/watering/components/schedule-editor.test.tsx`

- [ ] **Step 1: 重命名 types.ts 中的类型定义**

将 `Process` → `ProcessConfig`，`Step` → `StepConfig`，`Interrupt` → `InterruptConfig`，`Schedule` → `ScheduleConfig`。`VoltageConfig` 不变。

```ts
/**
 * 浇花 IoT 模块类型定义
 *
 * 核心实体：DeviceConfig（设备配置）、DeviceState（设备状态）、DeviceItem（合并视图）。
 * IoT 协议实体：StepConfig（流程步骤）、InterruptConfig（中断条件）、ProcessConfig（流程）、ScheduleConfig（定时任务）。
 * 数据持久化在 SQLite，通过 services/db.ts 读写。
 */

/** 流程步骤 — 控制单个负载（水泵/电磁阀等）的执行单元 */
export type StepConfig = {
  key?: string;
  name: string;
  /** 负载组件名，如 "motor_0" */
  component?: string;
  /** 执行参数 { begin, end }，含义由组件类型决定 */
  value: { begin: unknown; end: unknown };
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 中断条件列表 */
  interrupts?: InterruptConfig[];
  disabled?: boolean;
};

/** 中断条件 — 满足时触发步骤中断 */
export type InterruptConfig = {
  key?: string;
  name: string;
  /** 触发组件名 */
  component: string;
  /** 触发阈值 */
  state: number | boolean;
  /** 信号类型：模拟（数值比较）/ 数字（布尔匹配） */
  signalType?: 'analog' | 'digital';
  /** 比较逻辑（仅模拟信号生效） */
  logic?: '>' | '<';
  /** 触发阈值（仅模拟信号生效） */
  threshold?: number;
  /** 拦截次数上限 */
  intercept?: number;
  /** 触发后延迟（毫秒） */
  delay?: number;
  /** 持续时间（毫秒） */
  duration?: number;
  disabled?: boolean;
};

/** 流程 — 包含多个步骤的自动化序列 */
export type ProcessConfig = {
  key?: string;
  name: string;
  /** 触发条件（保留字段） */
  trigger?: string;
  steps: StepConfig[];
};

/** 定时任务 — 按周期触发指定流程 */
export type ScheduleConfig = {
  key?: string;
  /** 周期类型 */
  type: 'minute' | 'day' | 'week' | 'month';
  day?: number;
  week?: number;
  month?: number;
  /** 触发值（如分钟数、小时数） */
  value: number;
  /** 间隔数（如每 N 分钟） */
  interval: number;
  /** 要触发的流程索引 */
  process: number;
  disabled?: boolean;
};

/** 电压检测配置 — 分压电阻参数，用于计算实际电压 */
export type VoltageConfig = {
  /** 传感器引脚名，如 "sensor_0" */
  sensor: string;
  /** R1 电阻值（欧姆），默认 30000 */
  r1: number;
  /** R2 电阻值（欧姆），默认 10000 */
  r2: number;
};

/** 设备配置 — 存储在 SQLite device_config 表中 */
export type DeviceConfig = {
  /** 芯片 ID（唯一标识） */
  chipId: string;
  name: string;
  macAddress: string;
  processes: ProcessConfig[];
  /** 空闲时是否进入深度睡眠 */
  idleSleep: boolean;
  /** 空闲超时（毫秒） */
  idleTimeout: number;
  /** 启动时执行的流程索引 */
  bootExec: number;
  /** 指令执行延迟（毫秒） */
  execDelay: number;
  schedules: ScheduleConfig[];
  voltage?: VoltageConfig;
  /** 流程配置版本（变更时更新，用于固件同步判断） */
  processesVersion?: string;
  createdTime: string;
  lastWriteTime: string;
};

/** 设备状态 — 存储在 SQLite device_state 表中 */
export type DeviceState = {
  chipId: string;
  /** 状态版本 ID（变更时刷新） */
  stateId: string;
  /** 开关状态 */
  switch: 'on' | 'off';
  /** 按钮状态（键为引脚名，值为按下次数） */
  buttons?: Record<string, number>;
  /** 传感器读数（键为引脚名，值为 ADC 原始值） */
  sensors?: Record<string, number>;
  /** 负载状态（键为负载名，值为 0/1） */
  loads?: Record<string, number>;
  /** 当前执行的流程步骤索引 */
  index?: number;
  /** 当前执行的流程副本 */
  process?: ProcessConfig;
  /** 状态消息 */
  message?: string;
  /** 固件轮询间隔（毫秒） */
  sleep?: number;
  /** 空闲深度睡眠时长（毫秒） */
  sleepDuration?: number;
  lastWriteTime: string;
};

/** 设备列表项 — 配置 + 状态 + 在线信息的合并视图 */
export type DeviceItem = DeviceConfig & {
  state?: DeviceState;
  /** 最后心跳时间戳（毫秒） */
  lastTickTime?: number;
  /** 是否在线（基于心跳超时判断） */
  isOnline?: boolean;
};
```

- [ ] **Step 2: 更新 hooks/use-device-config.ts 的 import**

```ts
import type { DeviceConfig, ProcessConfig, ScheduleConfig } from '../types';
```

同时更新函数体内的类型使用 — `parseJsonArray` 返回类型中的 `Process[]` → `ProcessConfig[]`，`Schedule[]` → `ScheduleConfig[]`：

```ts
const safeConfig: DeviceConfig = {
  ...(found as unknown as DeviceConfig),
  processes: parseJsonArray((found as Record<string, unknown>).processes) as ProcessConfig[],
  schedules: parseJsonArray((found as Record<string, unknown>).schedules) as ScheduleConfig[],
  voltage: parseJsonVoltage((found as Record<string, unknown>).voltage),
};
```

- [ ] **Step 3: 更新 device-editor.tsx 的 import**

```ts
import type { DeviceConfig, ProcessConfig, StepConfig, InterruptConfig, ScheduleConfig, VoltageConfig } from '../types';
```

和函数签名中的 `Process` → `ProcessConfig`，`Step` → `StepConfig`，`Interrupt` → `InterruptConfig`，`Schedule` → `ScheduleConfig`。

- [ ] **Step 4: 更新 process-editor.tsx 的 import**

```ts
import type { ProcessConfig } from '../types';
```
Props 中 `process: ProcessConfig`。

- [ ] **Step 5: 更新 process-step-editor.tsx 的 import**

```ts
import type { StepConfig } from '../types';
```
Props 中 `step: StepConfig`。

- [ ] **Step 6: 更新 process-interrupt-editor.tsx 的 import**

```ts
import type { InterruptConfig } from '../types';
```
Props 中 `interrupt: InterruptConfig`。

- [ ] **Step 7: 更新 schedule-editor.tsx 的 import**

```ts
import type { ScheduleConfig } from '../types';
```
Props 中 `schedules: ScheduleConfig[]`。

- [ ] **Step 8: 更新 4 个测试文件的 import**

`__tests__/watering/components/process-editor.test.tsx`:
```ts
import type { ProcessConfig } from '@/app/watering/types';
```

`__tests__/watering/components/process-step-editor.test.tsx`:
```ts
import type { StepConfig } from '@/app/watering/types';
```

`__tests__/watering/components/process-interrupt-editor.test.tsx`:
```ts
import type { InterruptConfig } from '@/app/watering/types';
```

`__tests__/watering/components/schedule-editor.test.tsx`:
```ts
import type { ScheduleConfig } from '@/app/watering/types';
```

同步更新各测试文件内所有使用旧类型名的代码（mock 数据、变量类型标注等）。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "refactor: rename Process/Step/Interrupt/Schedule types with Config suffix"
```

---

### Task 2: VoltageConfigPicker（改名 + .prompt()）

**Files:**
- Rename: `app/watering/components/voltage-config-popup.tsx` → `app/watering/components/voltage-config-picker.tsx`
- Modify: `app/watering/components/device-editor.tsx` (更新 import)

- [ ] **Step 1: git mv 重命名文件**

```bash
git mv app/watering/components/voltage-config-popup.tsx app/watering/components/voltage-config-picker.tsx
```

- [ ] **Step 2: 修改 voltage-config-picker.tsx 内容**

重命名组件、接口并添加 `.prompt()` 静态方法。`sensors` 参数改为 `gpio: GpioInfo`。

```tsx
/**
 * 电压检测配置 Picker — 设置分压电阻 R1/R2 和传感器引脚
 *
 * 使用 antd-mobile Form 替代 List 构建表单。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 * 计算公式说明区使用 Card 卡片组件。
 */

'use client';

import { Popup, NavBar, Picker, Stepper, Form, Card, Input } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';

import type { VoltageConfig } from '../types';

interface VoltageConfigPickerProps {
  open: boolean;
  voltage: VoltageConfig | undefined;
  gpio: GpioInfo;
  onConfirm: (result: VoltageConfig) => void;
  onClose: () => void;
}

interface VoltageConfigPromptProps {
  voltage: VoltageConfig;
  gpio: GpioInfo;
  onConfirm?: (result: VoltageConfig) => void;
}

/**
 * 默认分压电阻值
 * R1=30kΩ 上拉至被测电压，R2=10kΩ 下拉至 GND
 * 分压比 = (R1+R2)/R2 = 4，适用于测量 0~13.2V 的电池电压（ESP32 ADC 最大 3.3V）
 */
const DEFAULT_R1 = 30000;
const DEFAULT_R2 = 10000;

export function VoltageConfigPicker({
  open,
  voltage,
  gpio,
  onConfirm,
  onClose,
}: VoltageConfigPickerProps) {
  const config = voltage || {
    sensor: gpio.sensors[0] || 'sensor_0',
    r1: DEFAULT_R1,
    r2: DEFAULT_R2,
  };

  useBackButton(open, onClose);

  function update(partial: Partial<VoltageConfig>) {
    onConfirm({ ...config, ...partial });
  }

  /**
   * 关闭 Popup
   *
   * 若原本无电压配置且设备无可用传感器，则放弃本次配置（设为 undefined），
   * 避免保存一个无意义的默认配置到设备。
   */
  function handleClose() {
    // 延迟判断：由调用方决定是否回退
    onClose();
  }

  const sensorColumns = gpio.sensors.map((s) => ({ label: s, value: s }));

  return (
    <Popup
      bodyStyle={{ height: '60vh' }}
      position="bottom"
      visible={open}
      onClose={handleClose}
    >
      <NavBar onBack={handleClose}>电压检测配置</NavBar>

      <Form layout="vertical"
            footer={
      (<Card
        title="计算公式"
      >
        <div className="text-xs text-gray-500">
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
      </Card>)
      }
      >
        {/* 传感器选择 — 点击 Form.Item 触发 Picker.prompt 弹窗 */}
        <Form.Item
          help="选择用于电压检测的 ADC 传感器引脚"
          label="电压检测传感器"
          onClick={() => {
            void Picker.prompt({
              columns: [sensorColumns],
              defaultValue: [config.sensor],
              onConfirm: (val) => {
                if (val.length > 0 && typeof val[0] === 'string') {
                  update({ sensor: val[0] });
                }
              },
            });
          }}
        >
          <Input
            readOnly
            placeholder="未选择传感器"
            value={config.sensor}
          />
        </Form.Item>

        {/* R1 电阻值 */}
        <Form.Item
          help="分压电阻 R1，上拉至被测电压。默认 30kΩ"
          label="R1 电阻值 (Ω)"
        >
          <Stepper
            min={0}
            step={1000}
            value={config.r1}
            onChange={(v) => { update({ r1: v }); }}
          />
        </Form.Item>

        {/* R2 电阻值 */}
        <Form.Item
          help="分压电阻 R2，下拉至 GND。默认 10kΩ"
          label="R2 电阻值 (Ω)"
        >
          <Stepper
            min={0}
            step={1000}
            value={config.r2}
            onChange={(v) => { update({ r2: v }); }}
          />
        </Form.Item>
      </Form>

      {/* 计算公式说明 — 使用 Card 卡片组件 */}
      <Card
        title="计算公式"
      >
        <div className="text-xs text-gray-500">
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
      </Card>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出电压配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 遵循 Picker.prompt() 相同的实现模式。
 * 返回 Promise，确认时 resolve VoltageConfig，取消时 resolve null。
 */
VoltageConfigPicker.prompt = (props: VoltageConfigPromptProps): Promise<VoltageConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => { setVisible(true); }, []);
      return (
        <VoltageConfigPicker
          open={visible}
          voltage={props.voltage}
          gpio={props.gpio}
          onConfirm={(result) => {
            props.onConfirm?.(result);
            resolve(result);
          }}
          onClose={() => {
            setVisible(false);
            resolve(null);
          }}
          afterClose={() => { unmount(); }}
        />
      );
    };
    const unmount = renderToBody(<Wrapper />);
  });
};
```

- [ ] **Step 3: 更新 device-editor.tsx 的 import**

将原来的：
```ts
// 电压检测配置区域当前内联在 device-editor 中，待后续抽取
```

改为：
```ts
import { VoltageConfigPicker } from './voltage-config-picker';
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: rename VoltageConfigPopup to VoltageConfigPicker with .prompt()"
```

---

### Task 3: InterruptConfigPicker（改名 + List→Form + .prompt()）

**Files:**
- Rename: `app/watering/components/process-interrupt-editor.tsx` → `app/watering/components/interrupt-config-picker.tsx`
- Modify: `app/watering/components/device-editor.tsx` (更新 import)

- [ ] **Step 1: git mv 重命名文件**

```bash
git mv app/watering/components/process-interrupt-editor.tsx app/watering/components/interrupt-config-picker.tsx
```

- [ ] **Step 2: 修改 interrupt-config-picker.tsx — 完全重写为 Form + Picker 模式**

当前使用 `List`，需改为 `Form layout="vertical"` + `Form.Item`。同时添加 `Popup` + `NavBar` 外壳和 `.prompt()`。

```tsx
/**
 * 中断条件配置 Picker — 编辑单个 InterruptConfig 的传感器、信号类型、阈值等参数
 *
 * 使用 antd-mobile Form 替代 List 构建移动端友好界面。
 * 数字信号 vs 模拟信号通过 signalType 字段区分，动态显示不同表单项。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Popup, NavBar, Input, Stepper, Switch, Selector, Form } from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { useState, useEffect } from 'react';
import { Dialog } from 'antd-mobile';

import { useBackButton } from '@/lib/back-button';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';

import type { InterruptConfig } from '../types';

interface InterruptConfigPickerProps {
  open: boolean;
  interrupt: InterruptConfig;
  gpio: GpioInfo;
  onConfirm: (result: InterruptConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
}

interface InterruptConfigPromptProps {
  interrupt: InterruptConfig;
  gpio: GpioInfo;
  onConfirm?: (result: InterruptConfig) => void;
  onDelete?: () => void;
}

export function InterruptConfigPicker({
  open,
  interrupt,
  gpio,
  onConfirm,
  onClose,
  onDelete,
}: InterruptConfigPickerProps) {
  const [draft, setDraft] = useState(interrupt);

  // open 变化时重置为最新 props
  useEffect(() => {
    setDraft(interrupt);
  }, [open, interrupt]);

  useBackButton(open, onClose);

  function update(partial: Partial<InterruptConfig>) {
    const updated = { ...draft, ...partial };
    setDraft(updated);
    onConfirm(updated);
  }

  const signalType = draft.signalType ?? 'digital';
  const sensorOptions = gpio.sensors.map((k) => ({ label: k, value: k }));

  function confirmDelete() {
    void Dialog.confirm({ title: '确认删除此中断？' }).then((confirmed) => {
      if (confirmed) onDelete?.();
    });
  }

  return (
    <Popup
      bodyStyle={{ height: '70vh' }}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar
        right={onDelete ? (
          <DeleteOutline
            style={{ fontSize: 20, cursor: 'pointer' }}
            onClick={confirmDelete}
          />
        ) : null}
        onBack={onClose}
      >
        编辑中断
      </NavBar>

      <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
        <Form layout="vertical">
          {/* 中断名称 */}
          <Form.Item label="中断名称">
            <Input
              placeholder="输入中断名称"
              value={draft.name}
              onChange={(v) => { update({ name: v }); }}
            />
          </Form.Item>

          {/* 传感器选择 */}
          <Form.Item label="传感器">
            <Selector
              options={sensorOptions}
              value={[draft.component]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  update({ component: vals[0]! });
                }
              }}
            />
          </Form.Item>

          {/* 信号类型 */}
          <Form.Item label="信号类型">
            <Selector
              options={[
                { label: '数字信号', value: 'digital' },
                { label: '模拟信号', value: 'analog' },
              ]}
              value={[signalType]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  update({ signalType: vals[0] as 'digital' | 'analog' });
                }
              }}
            />
          </Form.Item>

          {/* 数字信号：触发状态 */}
          {signalType === 'digital' && (
            <Form.Item
              description={draft.state === 1 || draft.state === true ? '触发 (1)' : '未触发 (0)'}
              label="触发状态"
            >
              <Switch
                checked={draft.state === 1 || draft.state === true}
                onChange={(checked) => {
                  update({ state: checked ? 1 : 0 });
                }}
              />
            </Form.Item>
          )}

          {/* 模拟信号：逻辑 + 触发阈值 */}
          {signalType === 'analog' && (
            <>
              <Form.Item label="比较逻辑">
                <Selector
                  options={[
                    { label: '大于', value: '>' },
                    { label: '小于', value: '<' },
                  ]}
                  value={[draft.logic ?? '>']}
                  onChange={(vals) => {
                    if (vals.length > 0) {
                      update({ logic: vals[0] as '>' | '<' });
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                description={`当传感器值${draft.logic === '>' ? '大于' : '小于'}阈值时触发中断`}
                label="触发阈值"
              >
                <Stepper
                  min={0}
                  step={1}
                  value={draft.threshold ?? 0}
                  onChange={(v) => { update({ threshold: v }); }}
                />
              </Form.Item>
            </>
          )}

          {/* 屏蔽抖动间隔 */}
          <Form.Item label="屏蔽抖动间隔 (ms)">
            <Stepper
              min={0}
              step={100}
              value={draft.intercept}
              onChange={(v) => { update({ intercept: v }); }}
            />
          </Form.Item>

          {/* 延迟检测 */}
          <Form.Item label="延迟检测 (ms)">
            <Stepper
              min={0}
              step={1000}
              value={draft.delay}
              onChange={(v) => { update({ delay: v }); }}
            />
          </Form.Item>

          {/* 持续时间 */}
          <Form.Item label="持续时间 (ms)">
            <Stepper
              min={0}
              step={1000}
              value={draft.duration}
              onChange={(v) => { update({ duration: v }); }}
            />
          </Form.Item>

          {/* 禁用 */}
          <Form.Item
            description={draft.disabled ? '已禁用' : '已启用'}
            label="禁用"
          >
            <Switch
              checked={!draft.disabled}
              onChange={(checked) => { update({ disabled: !checked }); }}
            />
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出中断配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 遵循 Picker.prompt() 相同的实现模式。
 * 返回 Promise，确认时 resolve InterruptConfig，取消时 resolve null。
 */
InterruptConfigPicker.prompt = (props: InterruptConfigPromptProps): Promise<InterruptConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => { setVisible(true); }, []);
      return (
        <InterruptConfigPicker
          open={visible}
          interrupt={props.interrupt}
          gpio={props.gpio}
          onConfirm={(result) => {
            props.onConfirm?.(result);
            resolve(result);
          }}
          onClose={() => {
            setVisible(false);
            resolve(null);
          }}
          onDelete={props.onDelete}
          afterClose={() => { unmount(); }}
        />
      );
    };
    const unmount = renderToBody(<Wrapper />);
  });
};
```

- [ ] **Step 3: 更新 device-editor.tsx 的 import**

将原来的：
```ts
import { ProcessInterruptEditor } from './process-interrupt-editor';
```

改为：
```ts
import { InterruptConfigPicker } from './interrupt-config-picker';
```

并将 JSX 中的 `<ProcessInterruptEditor ... />` 改为 `<InterruptConfigPicker ... />`，同时更新 props 类型名。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: rename ProcessInterruptEditor to InterruptConfigPicker with Form + .prompt()"
```

---

### Task 4: StepConfigPicker（改名 + List→Form + .prompt()）

**Files:**
- Rename: `app/watering/components/process-step-editor.tsx` → `app/watering/components/step-config-picker.tsx`
- Modify: `app/watering/components/device-editor.tsx` (更新 import)

- [ ] **Step 1: git mv 重命名文件**

```bash
git mv app/watering/components/process-step-editor.tsx app/watering/components/step-config-picker.tsx
```

- [ ] **Step 2: 修改 step-config-picker.tsx — List→Form + Popup 外壳 + .prompt()**

当前使用 `List`，需改为 `Form layout="vertical"` + `Form.Item`。添加 `Popup` + `NavBar` 外壳（原在 device-editor.tsx 中）。

```tsx
/**
 * 流程步骤配置 Picker — 编辑单个 StepConfig 的名称、负载、参数、超时、中断列表
 *
 * 使用 antd-mobile Form 替代 List 构建移动端界面。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 * 中断列表保持 SwipeAction + 触发 InterruptConfigPicker。
 */

'use client';

import { Input, Stepper, Switch, Picker, Button, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
import { AddOutline, DeleteOutline } from 'antd-mobile-icons';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';

import type { StepConfig, InterruptConfig } from '../types';

interface StepConfigPickerProps {
  open: boolean;
  step: StepConfig;
  gpio: GpioInfo;
  onConfirm: (result: StepConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  onAddInterrupt?: () => void;
  onEditInterrupt?: (index: number) => void;
}

interface StepConfigPromptProps {
  step: StepConfig;
  gpio: GpioInfo;
  onConfirm?: (result: StepConfig) => void;
  onDelete?: () => void;
  onAddInterrupt?: () => void;
  onEditInterrupt?: (index: number) => void;
}

export function StepConfigPicker({
  open,
  step,
  gpio,
  onConfirm,
  onClose,
  onDelete,
  onAddInterrupt,
  onEditInterrupt,
}: StepConfigPickerProps) {
  const [draft, setDraft] = useState(step);

  // open 变化时重置为最新 props
  useEffect(() => {
    setDraft(step);
  }, [open, step]);

  useBackButton(open, onClose);

  function update(partial: Partial<StepConfig>) {
    const updated = { ...draft, ...partial };
    setDraft(updated);
    onConfirm(updated);
  }

  const loadOptions = gpio.loads.map((k) => ({ label: k, value: k }));
  const hasLoad = !!draft.component;

  function confirmDelete() {
    void Dialog.confirm({ title: '确认删除此步骤？' }).then((confirmed) => {
      if (confirmed) onDelete?.();
    });
  }

  return (
    <Popup
      bodyStyle={{ height: '75vh' }}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar
        right={onDelete ? (
          <DeleteOutline
            style={{ fontSize: 20, cursor: 'pointer' }}
            onClick={confirmDelete}
          />
        ) : null}
        onBack={onClose}
      >
        编辑步骤
      </NavBar>

      <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(75vh - 45px)' }}>
        <Form layout="vertical">
          {/* 步骤名称 */}
          <Form.Item label="步骤名称">
            <Input
              placeholder="输入步骤名称"
              value={draft.name}
              onChange={(v) => { update({ name: v }); }}
            />
          </Form.Item>

          {/* 负载选择 */}
          <Form.Item
            help={hasLoad ? undefined : '请等待设备上报 GPIO 状态'}
            label="负载"
            onClick={() => {
              if (loadOptions.length === 0) return;
              void Picker.prompt({
                columns: [loadOptions],
                defaultValue: draft.component ? [draft.component] : [],
                onConfirm: (val) => {
                  if (typeof val[0] === 'string') {
                    update({ component: val[0] });
                  }
                },
              });
            }}
          >
            <Input
              readOnly
              placeholder={loadOptions.length === 0 ? '无可用负载' : '未选择'}
              value={draft.component || ''}
            />
          </Form.Item>

          {/* 启动参数 */}
          <Form.Item label="启动参数">
            <Stepper
              disabled={!hasLoad}
              value={draft.value.begin as number}
              onChange={(v) => { update({ value: { ...draft.value, begin: v } }); }}
            />
          </Form.Item>

          {/* 停止参数 */}
          <Form.Item label="停止参数">
            <Stepper
              disabled={!hasLoad}
              value={draft.value.end as number}
              onChange={(v) => { update({ value: { ...draft.value, end: v } }); }}
            />
          </Form.Item>

          {/* 超时 */}
          <Form.Item label="超时限制 (ms)">
            <Stepper
              min={0}
              step={1000}
              value={draft.timeout}
              onChange={(v) => { update({ timeout: v }); }}
            />
          </Form.Item>

          {/* 禁用 */}
          <Form.Item
            description={draft.disabled ? '已禁用' : '已启用'}
            label="禁用"
          >
            <Switch
              checked={!draft.disabled}
              onChange={(checked) => { update({ disabled: !checked }); }}
            />
          </Form.Item>

          {/* 中断列表 */}
          <Form.Header>中断列表</Form.Header>
          {(draft.interrupts || []).map((intr, idx) => (
            <SwipeAction
              key={idx}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    void Dialog.confirm({ title: '确认删除此中断？' }).then((confirmed) => {
                      if (confirmed) {
                        const newInterrupts = (draft.interrupts || []).filter((_, i) => i !== idx);
                        update({ interrupts: newInterrupts });
                      }
                    });
                  },
                },
              ]}
            >
              <Form.Item
                description={intr.component}
                label={intr.name}
                onClick={() => { onEditInterrupt?.(idx); }}
              >
                <div />
              </Form.Item>
            </SwipeAction>
          ))}

          {/* 添加中断 */}
          <Form.Item>
            <Button block color="primary" onClick={onAddInterrupt}>
              <AddOutline /> 添加中断
            </Button>
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出步骤配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 遵循 Picker.prompt() 相同的实现模式。
 * 返回 Promise，确认时 resolve StepConfig，取消时 resolve null。
 */
StepConfigPicker.prompt = (props: StepConfigPromptProps): Promise<StepConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => { setVisible(true); }, []);
      return (
        <StepConfigPicker
          open={visible}
          step={props.step}
          gpio={props.gpio}
          onConfirm={(result) => {
            props.onConfirm?.(result);
            resolve(result);
          }}
          onClose={() => {
            setVisible(false);
            resolve(null);
          }}
          onDelete={props.onDelete}
          afterClose={() => { unmount(); }}
        />
      );
    };
    const unmount = renderToBody(<Wrapper />);
  });
};
```

- [ ] **Step 3: 更新 device-editor.tsx 的 import**

```ts
import { StepConfigPicker } from './step-config-picker';
```

并将 JSX 和所有引用从 `ProcessStepEditor` → `StepConfigPicker`，类型 `Step` → `StepConfig`。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: rename ProcessStepEditor to StepConfigPicker with Form + .prompt()"
```

---

### Task 5: ProcessConfigPicker（改名 + .prompt()）

**Files:**
- Rename: `app/watering/components/process-editor.tsx` → `app/watering/components/process-config-picker.tsx`
- Modify: `app/watering/components/device-editor.tsx` (更新 import)

- [ ] **Step 1: git mv 重命名文件**

```bash
git mv app/watering/components/process-editor.tsx app/watering/components/process-config-picker.tsx
```

- [ ] **Step 2: 修改 process-config-picker.tsx — 添加 Popup 外壳 + .prompt()**

当前已是 Form 结构，只需添加 Popup + NavBar 外壳（原在 device-editor.tsx 中）和 `.prompt()`。

```tsx
/**
 * 流程配置 Picker — 编辑单个 ProcessConfig 的名称、触发按钮、步骤列表
 *
 * 使用 antd-mobile Form 替代 List，vertical 布局适合移动端表单。
 * 数据流保持受控模式，通过 process/onConfirm props 驱动。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Input, Picker, ErrorBlock, Button, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
import { AddOutline, DeleteOutline } from 'antd-mobile-icons';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';

import type { ProcessConfig } from '../types';

interface ProcessConfigPickerProps {
  open: boolean;
  process: ProcessConfig;
  gpio: GpioInfo;
  onConfirm: (result: ProcessConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  onAddStep?: () => void;
  onEditStep?: (index: number) => void;
}

interface ProcessConfigPromptProps {
  process: ProcessConfig;
  gpio: GpioInfo;
  onConfirm?: (result: ProcessConfig) => void;
  onDelete?: () => void;
  onAddStep?: () => void;
  onEditStep?: (index: number) => void;
}

export function ProcessConfigPicker({
  open,
  process,
  gpio,
  onConfirm,
  onClose,
  onDelete,
  onAddStep,
  onEditStep,
}: ProcessConfigPickerProps) {
  const [draft, setDraft] = useState(process);

  // open 变化时重置为最新 props
  useEffect(() => {
    setDraft(process);
  }, [open, process]);

  useBackButton(open, onClose);

  function update(partial: Partial<ProcessConfig>) {
    const updated = { ...draft, ...partial };
    setDraft(updated);
    onConfirm(updated);
  }

  const buttonOptions = gpio.buttons.map((k) => ({ label: k, value: k }));

  function confirmDelete() {
    void Dialog.confirm({ title: '确认删除此流程？' }).then((confirmed) => {
      if (confirmed) onDelete?.();
    });
  }

  return (
    <Popup
      bodyStyle={{ height: '80vh' }}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar
        right={onDelete ? (
          <DeleteOutline
            style={{ fontSize: 20, cursor: 'pointer' }}
            onClick={confirmDelete}
          />
        ) : null}
        onBack={onClose}
      >
        编辑流程
      </NavBar>

      <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(80vh - 45px)' }}>
        <Form layout="vertical">
          {/* 功能名称 */}
          <Form.Item label="功能名称">
            <Input
              placeholder="输入流程名称"
              value={draft.name}
              onChange={(v) => { update({ name: v }); }}
            />
          </Form.Item>

          {/* 触发按钮 — 点击 Form.Item 触发 Picker.prompt 弹窗选择 */}
          <Form.Item
            label="触发按钮"
            onClick={() => {
              if (buttonOptions.length === 0) return;
              void Picker.prompt({
                columns: [buttonOptions],
                defaultValue: draft.trigger ? [draft.trigger] : [],
                onConfirm: (val) => {
                  if (val.length > 0 && typeof val[0] === 'string') {
                    update({ trigger: val[0] });
                  }
                },
              });
            }}
          >
            <Input
              readOnly
              placeholder="未选择"
              value={draft.trigger || ''}
            />
          </Form.Item>

          {/* 无可用按钮时的提示 */}
          {buttonOptions.length === 0 && (
            <ErrorBlock
              description="请等待设备上报 GPIO 状态"
              status="empty"
              title="无可用按钮"
            />
          )}

          {/* 步骤列表 — 使用 Form.Header 作为分组标题 */}
          <Form.Header>步骤列表</Form.Header>
          {draft.steps.map((s, idx) => (
            <SwipeAction
              key={idx}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    void Dialog.confirm({ title: '确认删除此步骤？' }).then(
                      (confirmed) => {
                        if (confirmed) {
                          const newSteps = draft.steps.filter((_, i) => i !== idx);
                          update({ steps: newSteps });
                        }
                      },
                    );
                  },
                },
              ]}
            >
              <Form.Item
                help={s.component}
                label={s.name}
                onClick={() => { onEditStep?.(idx); }}
              >
                <div />
              </Form.Item>
            </SwipeAction>
          ))}

          {/* 添加步骤 */}
          <Form.Item>
            <Button block color="primary" onClick={onAddStep}>
              <span><AddOutline />添加步骤</span>
            </Button>
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出流程配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 遵循 Picker.prompt() 相同的实现模式。
 * 返回 Promise，确认时 resolve ProcessConfig，取消时 resolve null。
 */
ProcessConfigPicker.prompt = (props: ProcessConfigPromptProps): Promise<ProcessConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => { setVisible(true); }, []);
      return (
        <ProcessConfigPicker
          open={visible}
          process={props.process}
          gpio={props.gpio}
          onConfirm={(result) => {
            props.onConfirm?.(result);
            resolve(result);
          }}
          onClose={() => {
            setVisible(false);
            resolve(null);
          }}
          onDelete={props.onDelete}
          afterClose={() => { unmount(); }}
        />
      );
    };
    const unmount = renderToBody(<Wrapper />);
  });
};
```

- [ ] **Step 3: 更新 device-editor.tsx 的 import**

```ts
import { ProcessConfigPicker } from './process-config-picker';
```

并将 JSX 中 `<ProcessEditor ... />` → `<ProcessConfigPicker ... />`。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: rename ProcessEditor to ProcessConfigPicker with Popup shell + .prompt()"
```

---

### Task 6: ScheduleConfigPicker（改名 + List→Form + .prompt()）

**Files:**
- Rename: `app/watering/components/schedule-editor.tsx` → `app/watering/components/schedule-config-picker.tsx`
- Modify: `app/watering/components/device-editor.tsx` (更新 import)

- [ ] **Step 1: git mv 重命名文件**

```bash
git mv app/watering/components/schedule-editor.tsx app/watering/components/schedule-config-picker.tsx
```

- [ ] **Step 2: 修改 schedule-config-picker.tsx — List→Form + Popup 外壳 + .prompt()**

```tsx
/**
 * 定时任务配置 Picker — 编辑触发周期、时间、执行流程
 *
 * 使用 antd-mobile Form 替代 List 构建移动端界面。
 * 时间选择用 DatePicker(precision='minute')，显示和保存时转为距 00:00 毫秒偏移。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Stepper, Switch, Picker, DatePicker, Popup, NavBar, Form, Dialog } from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import dayjs from 'dayjs';
import { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';

import type { ScheduleConfig } from '../types';

const TYPE_OPTIONS = [
  { label: '每天', value: 'day' },
  { label: '每分钟', value: 'minute' },
  { label: '每周', value: 'week' },
  { label: '每月', value: 'month' },
];

interface ScheduleConfigPickerProps {
  open: boolean;
  schedule: ScheduleConfig;
  processes: { name: string }[];  // 流程列表用于"执行流程"选择
  onConfirm: (result: ScheduleConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
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
}: ScheduleConfigPickerProps) {
  const [draft, setDraft] = useState(schedule);

  // open 变化时重置为最新 props
  useEffect(() => {
    setDraft(schedule);
  }, [open, schedule]);

  useBackButton(open, onClose);

  function update(updated: ScheduleConfig) {
    setDraft(updated);
    onConfirm(updated);
  }

  /** 毫秒偏移 → Date 对象（仅时间部分，日期取当天） */
  const timeDate = dayjs()
    .startOf('day')
    .add(draft.value || 0, 'millisecond')
    .toDate();

  const processOptions = processes.map((p, i) => ({
    label: p.name || `流程 ${String(i)}`,
    value: String(i),
  }));

  function confirmDelete() {
    void Dialog.confirm({ title: '确认删除此定时任务？' }).then((confirmed) => {
      if (confirmed) onDelete?.();
    });
  }

  return (
    <Popup
      bodyStyle={{ height: '70vh' }}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar
        right={onDelete ? (
          <DeleteOutline
            style={{ fontSize: 20, cursor: 'pointer' }}
            onClick={confirmDelete}
          />
        ) : null}
        onBack={onClose}
      >
        编辑定时任务
      </NavBar>

      <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
        <Form layout="vertical">
          {/* 类型 */}
          <Form.Item
            label="类型"
            onClick={() => {
              Picker.prompt({
                columns: [TYPE_OPTIONS],
                defaultValue: [draft.type],
                onConfirm: (val) => {
                  if (val && val.length > 0 && typeof val[0] === 'string') {
                    update({ ...draft, type: val[0] as ScheduleConfig['type'] });
                  }
                },
              });
            }}
          >
            <div style={{ textAlign: 'right' }}>
              {TYPE_OPTIONS.find((o) => o.value === draft.type)?.label ?? ''}
            </div>
          </Form.Item>

          {/* 间隔 */}
          <Form.Item label="间隔（天）">
            <Stepper
              min={1}
              step={1}
              value={draft.interval}
              onChange={(v) => { update({ ...draft, interval: v }); }}
            />
          </Form.Item>

          {/* 时间 — DatePicker.prompt(minute) */}
          <Form.Item
            label="时间"
            onClick={() => {
              DatePicker.prompt({
                precision: 'minute',
                defaultValue: timeDate,
                onConfirm: (val) => {
                  if (val) {
                    // Date → 距 00:00 的毫秒偏移量
                    const ms = dayjs(val).diff(dayjs(val).startOf('day'), 'millisecond');
                    update({ ...draft, value: ms });
                  }
                },
              });
            }}
          >
            <div style={{ textAlign: 'right' }}>{dayjs(timeDate).format('HH:mm')}</div>
          </Form.Item>

          {/* 执行流程 */}
          <Form.Item
            label="执行流程"
            onClick={() => {
              Picker.prompt({
                columns: [processOptions],
                defaultValue: [String(draft.process)],
                onConfirm: (val) => {
                  if (val && val.length > 0 && typeof val[0] === 'string') {
                    update({ ...draft, process: Number(val[0]) });
                  }
                },
              });
            }}
          >
            <div style={{ textAlign: 'right' }}>
              {processOptions.find((o) => o.value === String(draft.process))?.label ?? ''}
            </div>
          </Form.Item>

          {/* 禁用 */}
          <Form.Item
            description={draft.disabled ? '已禁用' : '已启用'}
            label="禁用"
          >
            <Switch
              checked={!draft.disabled}
              onChange={(checked) => { update({ ...draft, disabled: !checked }); }}
            />
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出定时任务配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 遵循 Picker.prompt() 相同的实现模式。
 * 返回 Promise，确认时 resolve ScheduleConfig，取消时 resolve null。
 */
ScheduleConfigPicker.prompt = (props: ScheduleConfigPromptProps): Promise<ScheduleConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => { setVisible(true); }, []);
      return (
        <ScheduleConfigPicker
          open={visible}
          schedule={props.schedule}
          processes={props.processes}
          onConfirm={(result) => {
            props.onConfirm?.(result);
            resolve(result);
          }}
          onClose={() => {
            setVisible(false);
            resolve(null);
          }}
          onDelete={props.onDelete}
          afterClose={() => { unmount(); }}
        />
      );
    };
    const unmount = renderToBody(<Wrapper />);
  });
};
```

- [ ] **Step 3: 更新 device-editor.tsx 的 import**

```ts
import { ScheduleConfigPicker } from './schedule-config-picker';
```

并将 `<ScheduleEditor ... />` → `<ScheduleConfigPicker ... />`。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: rename ScheduleEditor to ScheduleConfigPicker with Form + .prompt()"
```

---

### Task 7: DeviceConfigForm（改名 + 基本设置 Form 迁移 + 集成 Picker）

**Files:**
- Rename: `app/watering/components/device-editor.tsx` → `app/watering/components/device-config-form.tsx`

这是最大的一个任务。`git mv` 后将：
1. 组件名从 `DeviceEditor` → `DeviceConfigForm`
2. 基本设置区 `List` → `Form layout="vertical"` + `Form.Item`
3. 电压配置区从内联 Popup 抽取为 `<VoltageConfigPicker />` 声明式调用
4. 更新所有 import 指向新的 Picker 路径和类型名
5. 移除不再需要的 Popup 和 NavBar 导入（子 Picker 自行管理）

- [ ] **Step 1: git mv 重命名文件**

```bash
git mv app/watering/components/device-editor.tsx app/watering/components/device-config-form.tsx
```

- [ ] **Step 2: 完全重写 device-config-form.tsx**

以下是完整的重写后文件内容：

```tsx
/**
 * 设备配置表单 — 管理设备基本设置、流程、步骤、中断、定时任务的 CRUD
 *
 * 使用 antd-mobile Form + Popup 构建移动端界面。
 * 通过 saveRef 将 handleSave 暴露给父组件 Header 的保存按钮。
 * 子编辑全部委托给 XxxPicker 组件，本文件仅管理数据流和编排。
 */

'use client';

import {
  Input,
  Stepper,
  Switch,
  Button,
  List,
  Picker,
  ErrorBlock,
  SwipeAction,
  Form,
  Dialog,
  Toast,
} from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';
import { useState, useEffect } from 'react';

import { VoltageConfigPicker } from './voltage-config-picker';
import { ProcessConfigPicker } from './process-config-picker';
import { StepConfigPicker } from './step-config-picker';
import { InterruptConfigPicker } from './interrupt-config-picker';
import { ScheduleConfigPicker } from './schedule-config-picker';

import type { GpioInfo } from '../hooks/use-device-config';
import type { DeviceConfig, ProcessConfig, StepConfig, InterruptConfig, ScheduleConfig, VoltageConfig } from '../types';

/** 带 key 的扩展类型（运行时由 crypto.randomUUID() 生成，不存入数据库，仅供 antd-mobile SwipeAction key 使用） */
interface WithKey { key?: string; }

/**
 * 为对象附加运行时 key
 *
 * ProcessConfig/StepConfig/InterruptConfig/ScheduleConfig 类型定义含 key? 可选字段，
 * 通过此辅助函数确保 SwipeAction 有稳定的 key。
 */
function attachKey<T>(obj: T): T {
  return { ...obj, key: crypto.randomUUID() };
}

/** 电压检测配置默认值 */
const DEFAULT_R1 = 30000; // 30kΩ
const DEFAULT_R2 = 10000; // 10kΩ

export function DeviceConfigForm({
  config,
  gpio,
  onSave,
  saveRef,
  onRemove,
}: {
  config: DeviceConfig;
  gpio: GpioInfo;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
  saveRef: React.MutableRefObject<() => Promise<void>>;
}) {
  const [form, setForm] = useState<DeviceConfig>(config);

  // ---- 嵌套 Popup 状态 ----
  const [processVisible, setProcessVisible] = useState(false);
  const [processIndex, setProcessIndex] = useState(-1);

  const [stepVisible, setStepVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const [interruptVisible, setInterruptVisible] = useState(false);
  const [interruptIndex, setInterruptIndex] = useState(-1);

  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [scheduleIndex, setScheduleIndex] = useState(-1);

  const [voltageVisible, setVoltageVisible] = useState(false);

  // ---- 保存 ----
  async function handleSave() {
    try {
      await onSave({
        name: form.name,
        idleSleep: form.idleSleep,
        idleTimeout: form.idleTimeout,
        bootExec: form.bootExec,
        execDelay: form.execDelay,
        processes: form.processes,
        schedules: form.schedules,
        voltage: form.voltage,
      });
      Toast.show({ icon: 'success', content: '保存成功' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      Toast.show({ icon: 'fail', content: msg });
    }
  }

  // ---- 暴露保存函数给父组件 ----
  useEffect(() => {
    saveRef.current = handleSave;
  });

  // ---- 流程操作 ----
  function addProcess() {
    const item: ProcessConfig = {
      name: '新流程',
      steps: [
        {
          name: '新步骤',
          component: gpio.loads[0] ?? 'load_0',
          value: { begin: 255, end: 0 },
          timeout: 600000,
          interrupts: [],
        },
      ],
    };
    const newProcesses = [...form.processes, attachKey(item)];
    setForm({ ...form, processes: newProcesses });
    setProcessIndex(newProcesses.length - 1);
    setProcessVisible(true);
  }

  function updateProcess(index: number, updated: ProcessConfig) {
    const newProcesses = [...form.processes];
    newProcesses[index] = updated;
    setForm({ ...form, processes: newProcesses });
  }

  function deleteProcessFromList(index: number) {
    const newProcesses = form.processes.filter((_, i) => i !== index);
    setForm({ ...form, processes: newProcesses });
    if (index === processIndex) {
      setProcessVisible(false);
      setProcessIndex(-1);
    }
  }

  function deleteProcess() {
    const newProcesses = form.processes.filter((_, i) => i !== processIndex);
    setForm({ ...form, processes: newProcesses });
    setProcessVisible(false);
    setProcessIndex(-1);
  }

  // ---- 步骤操作 ----
  function addStep() {
    const source = form.processes[processIndex];
    if (!source) return;
    const item: StepConfig = {
      name: '新步骤',
      component: gpio.loads[0] ?? 'load_0',
      value: { begin: 0, end: 0 },
      timeout: 600000,
      interrupts: [],
    };
    const proc = { ...source, steps: [...source.steps, attachKey(item)] };
    updateProcess(processIndex, proc);
    setStepIndex(proc.steps.length - 1);
    setStepVisible(true);
  }

  function updateStep(index: number, updated: StepConfig) {
    const source = form.processes[processIndex];
    if (!source) return;
    const newSteps = [...source.steps];
    newSteps[index] = updated;
    updateProcess(processIndex, { ...source, steps: newSteps });
  }

  function deleteStep() {
    const source = form.processes[processIndex];
    if (!source) return;
    updateProcess(processIndex, {
      ...source,
      steps: source.steps.filter((_, i) => i !== stepIndex),
    });
    setStepVisible(false);
    setStepIndex(-1);
  }

  // ---- 中断操作 ----
  function addInterrupt() {
    const procSource = form.processes[processIndex];
    if (!procSource) return;
    const stepSource = procSource.steps[stepIndex];
    if (!stepSource) return;
    const item: InterruptConfig = {
      name: '新中断',
      component: gpio.sensors[0] ?? 'sensor_0',
      state: 0,
      signalType: 'digital',
      logic: '>',
      threshold: 0,
      intercept: 100,
      delay: 0,
      duration: 0,
    };
    const newInterrupts = [...(stepSource.interrupts || []), attachKey(item)];
    updateStep(stepIndex, { ...stepSource, interrupts: newInterrupts });
    setInterruptIndex(newInterrupts.length - 1);
    setInterruptVisible(true);
  }

  function updateInterrupt(index: number, updated: InterruptConfig) {
    const procSource = form.processes[processIndex];
    if (!procSource) return;
    const stepSource = procSource.steps[stepIndex];
    if (!stepSource) return;
    const newInterrupts = [...(stepSource.interrupts || [])];
    newInterrupts[index] = updated;
    updateStep(stepIndex, { ...stepSource, interrupts: newInterrupts });
  }

  function deleteInterrupt() {
    const procSource = form.processes[processIndex];
    if (!procSource) return;
    const stepSource = procSource.steps[stepIndex];
    if (!stepSource) return;
    updateStep(stepIndex, {
      ...stepSource,
      interrupts: (stepSource.interrupts || []).filter((_, i) => i !== interruptIndex),
    });
    setInterruptVisible(false);
    setInterruptIndex(-1);
  }

  // ---- 定时操作 ----
  function addSchedule() {
    const item: ScheduleConfig = {
      type: 'day',
      value: 8 * 3600 * 1000,
      interval: 1,
      process: 0,
    };
    const newSchedules = [...form.schedules, attachKey(item)];
    setForm({ ...form, schedules: newSchedules });
    setScheduleIndex(newSchedules.length - 1);
    setScheduleVisible(true);
  }

  function updateSchedule(index: number, updated: ScheduleConfig) {
    const newSchedules = [...form.schedules];
    newSchedules[index] = updated;
    setForm({ ...form, schedules: newSchedules });
  }

  function deleteScheduleFromList(index: number) {
    const newSchedules = form.schedules.filter((_, i) => i !== index);
    setForm({ ...form, schedules: newSchedules });
    if (index === scheduleIndex) {
      setScheduleVisible(false);
      setScheduleIndex(-1);
    }
  }

  function deleteSchedule() {
    const newSchedules = form.schedules.filter((_, i) => i !== scheduleIndex);
    setForm({ ...form, schedules: newSchedules });
    setScheduleVisible(false);
    setScheduleIndex(-1);
  }

  // ---- 定时时间格式化 ----
  function formatScheduleTime(record: ScheduleConfig): string {
    if (record.type === 'day') {
      const h = Math.floor(record.value / 3600000);
      const m = Math.floor((record.value % 3600000) / 60000);
      return `每天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return `${record.type} ${record.value}`;
  }

  // ---- 电压配置 ----
  function updateVoltage(config: VoltageConfig) {
    setForm({ ...form, voltage: config });
  }

  // ---- 确认删除的通用辅助 ----
  function confirmDelete(title: string, onConfirmFn: () => void) {
    Dialog.confirm({
      title,
      onConfirm: onConfirmFn,
    });
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* ======== 基本设置（List→Form） ======== */}
      <Form layout="vertical">
        <Form.Header>基本设置</Form.Header>

        {/* 设备名称 */}
        <Form.Item label="设备名称">
          <Input
            placeholder="输入设备名称"
            value={form.name}
            onChange={(v) => { setForm({ ...form, name: v }); }}
          />
        </Form.Item>

        {/* 空闲睡眠 */}
        <Form.Item
          help={form.idleSleep ? '设备将不接受实时控制，仅执行计划任务，达到省电目的' : ''}
          label="空闲睡眠"
        >
          <Switch
            checked={form.idleSleep}
            onChange={(checked) => { setForm({ ...form, idleSleep: checked }); }}
          />
        </Form.Item>

        {/* 空闲超时 */}
        {form.idleSleep && (
          <Form.Item label="空闲超时（毫秒）">
            <Stepper
              max={86400000}
              min={0}
              step={1000}
              value={form.idleTimeout}
              onChange={(v) => { setForm({ ...form, idleTimeout: v }); }}
            />
          </Form.Item>
        )}

        {/* 开机执行 */}
        <Form.Item
          label="开机执行"
          onClick={() => {
            const options = [
              { label: '无', value: '-1' },
              ...form.processes.map((p, i) => ({ label: p.name, value: String(i) })),
            ];
            Picker.prompt({
              columns: [options],
              defaultValue: [String(form.bootExec)],
              onConfirm: (val) => {
                if (val && val.length > 0 && typeof val[0] === 'string') {
                  setForm({ ...form, bootExec: Number(val[0]) });
                }
              },
            });
          }}
        >
          <Input
            readOnly
            placeholder="无"
            value={
              form.bootExec >= 0 && form.processes[form.bootExec]
                ? form.processes[form.bootExec]!.name
                : '无'
            }
          />
        </Form.Item>

        {/* 延迟执行 */}
        <Form.Item label="延迟执行（毫秒）">
          <Stepper
            disabled={form.bootExec < 0}
            min={0}
            step={1000}
            value={form.execDelay}
            onChange={(v) => { setForm({ ...form, execDelay: v }); }}
          />
        </Form.Item>
      </Form>

      {/* ======== 电压检测配置摘要栏 ======== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '12px 0',
          padding: '8px 12px',
          background: '#fafafa',
          borderRadius: 6,
          border: '1px solid #f0f0f0',
        }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>电压检测配置</span>
          {form.voltage ? (
            <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
              {form.voltage.sensor} · R1={form.voltage.r1}Ω · R2={form.voltage.r2}Ω
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>
              未配置
            </span>
          )}
        </div>
        <Button
          fill="none"
          size="small"
          onClick={() => { setVoltageVisible(true); }}
        >
          {form.voltage ? '修改' : '配置'}
        </Button>
      </div>

      {/* ======== 流程列表 ======== */}
      <List header="功能">
        {form.processes.length === 0 ? (
          <ErrorBlock description="点击下方按钮添加功能流程" status="empty" title="暂无功能" />
        ) : (
          form.processes.map((proc, index) => (
            <SwipeAction
              key={(proc as WithKey).key ?? index}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    confirmDelete('确认删除此流程？', () => { deleteProcessFromList(index); });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                prefix={`${index + 1}.`}
                onClick={() => {
                  setProcessIndex(index);
                  setProcessVisible(true);
                }}
              >
                {proc.name}
              </List.Item>
            </SwipeAction>
          ))
        )}
      </List>
      <Button
        block
        style={{ margin: '8px 0 16px' }}
        onClick={addProcess}
      >
        <AddOutline style={{ marginRight: 4 }} /> 添加
      </Button>

      {/* ======== 计划任务列表 ======== */}
      <List header="计划任务">
        {form.schedules.length === 0 ? (
          <ErrorBlock description="点击下方按钮添加定时任务" status="empty" title="暂无计划任务" />
        ) : (
          form.schedules.map((sch, index) => (
            <SwipeAction
              key={(sch as WithKey).key ?? index}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    confirmDelete('确认删除此定时任务？', () => { deleteScheduleFromList(index); });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                description={`间隔 ${sch.interval} 天`}
                extra={
                  sch.process < form.processes.length
                    ? form.processes[sch.process]?.name ?? ''
                    : ''
                }
                prefix={`${index + 1}.`}
                onClick={() => {
                  setScheduleIndex(index);
                  setScheduleVisible(true);
                }}
              >
                {formatScheduleTime(sch)}
              </List.Item>
            </SwipeAction>
          ))
        )}
      </List>
      <Button
        block
        style={{ margin: '8px 0 16px' }}
        onClick={addSchedule}
      >
        <AddOutline style={{ marginRight: 4 }} /> 添加
      </Button>

      {/* ============================================
          子 Picker 声明式挂载
          ============================================ */}

      {/* 电压检测配置 Picker */}
      <VoltageConfigPicker
        open={voltageVisible}
        voltage={form.voltage}
        gpio={gpio}
        onConfirm={updateVoltage}
        onClose={() => { setVoltageVisible(false); }}
      />

      {/* 流程编辑 Picker */}
      <ProcessConfigPicker
        open={processVisible}
        process={
          processIndex > -1
            ? form.processes[processIndex]!
            : { name: '', steps: [] }
        }
        gpio={gpio}
        onConfirm={(updated) => { updateProcess(processIndex, updated); }}
        onClose={() => { setProcessVisible(false); }}
        onDelete={deleteProcess}
        onAddStep={addStep}
        onEditStep={(idx) => {
          setStepIndex(idx);
          setStepVisible(true);
        }}
      />

      {/* 步骤编辑 Picker */}
      <StepConfigPicker
        open={stepVisible}
        step={
          stepIndex > -1 && processIndex > -1
            ? form.processes[processIndex]!.steps[stepIndex]!
            : { name: '', component: '', value: { begin: 0, end: 0 }, timeout: 0, interrupts: [] }
        }
        gpio={gpio}
        onConfirm={(updated) => { updateStep(stepIndex, updated); }}
        onClose={() => { setStepVisible(false); }}
        onDelete={deleteStep}
        onAddInterrupt={addInterrupt}
        onEditInterrupt={(idx) => {
          setInterruptIndex(idx);
          setInterruptVisible(true);
        }}
      />

      {/* 中断编辑 Picker */}
      <InterruptConfigPicker
        open={interruptVisible}
        interrupt={
          interruptIndex > -1 &&
          stepIndex > -1 &&
          processIndex > -1 &&
          form.processes[processIndex]!.steps[stepIndex]!.interrupts?.[interruptIndex]
            ? form.processes[processIndex]!.steps[stepIndex]!.interrupts![interruptIndex]!
            : {
                name: '',
                component: gpio.sensors[0] ?? 'sensor_0',
                state: 0,
                signalType: 'digital',
                logic: '>',
                threshold: 0,
                intercept: 100,
                delay: 0,
                duration: 0,
              }
        }
        gpio={gpio}
        onConfirm={(updated) => { updateInterrupt(interruptIndex, updated); }}
        onClose={() => { setInterruptVisible(false); }}
        onDelete={deleteInterrupt}
      />

      {/* 定时任务编辑 Picker */}
      <ScheduleConfigPicker
        open={scheduleVisible}
        schedule={
          scheduleIndex > -1
            ? form.schedules[scheduleIndex]!
            : { type: 'day', value: 0, interval: 1, process: 0 }
        }
        processes={form.processes}
        onConfirm={(updated) => { updateSchedule(scheduleIndex, updated); }}
        onClose={() => { setScheduleVisible(false); }}
        onDelete={deleteSchedule}
      />
    </div>
  );
}
```

- [ ] **Step 3: 验证没有对旧文件的引用残留**

```bash
grep -r "process-editor\|process-step-editor\|process-interrupt-editor\|schedule-editor\|voltage-config-popup\|device-editor" app/ --include="*.tsx" --include="*.ts"
```

确保所有 .tsx/.ts 文件中不再引用旧路径名。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: rename DeviceEditor to DeviceConfigForm with Form + integrated Pickers"
```

---

### Task 8: 更新 page.tsx 消费者

**Files:**
- Modify: `app/watering/devices/[chipId]/page.tsx`

- [ ] **Step 1: 更新 import 和 JSX**

```tsx
import { DeviceConfigForm } from '../../components/device-config-form';
```

将 `<DeviceEditor ... />` 改为 `<DeviceConfigForm ... />`。

- [ ] **Step 2: 验证 import 路径**

```bash
grep "DeviceEditor\|device-editor" app/watering/devices/\[chipId\]/page.tsx
```

确认无旧引用。

- [ ] **Step 3: 提交**

```bash
git add app/watering/devices/\[chipId\]/page.tsx
git commit -m "refactor: update page to use DeviceConfigForm"
```

---

### Task 9: 更新测试文件

**Files:**
- Modify: `__tests__/watering/components/device-editor.test.tsx`
- Modify: `__tests__/watering/components/process-editor.test.tsx`
- Modify: `__tests__/watering/components/process-step-editor.test.tsx`
- Modify: `__tests__/watering/components/process-interrupt-editor.test.tsx`
- Modify: `__tests__/watering/components/schedule-editor.test.tsx`

- [ ] **Step 1: 更新 device-editor.test.tsx 的 import 和引用**

将所有 `DeviceEditor` → `DeviceConfigForm`，`device-editor` → `device-config-form`。
所有 `Process` → `ProcessConfig`，`Step` → `StepConfig`，`Interrupt` → `InterruptConfig`，`Schedule` → `ScheduleConfig`。

- [ ] **Step 2: 更新其余 4 个测试文件的 import**

同步更新文件名引用和类型引用。如果测试文件中 mock 了子编辑器组件（如 `ProcessEditor`），需要改为 mock 新的 Picker 组件（如 `ProcessConfigPicker`）。

- [ ] **Step 3: 运行测试验证**

```bash
npm run test
```

预期：所有测试通过。

- [ ] **Step 4: 提交**

```bash
git add __tests__/
git commit -m "test: update test imports for DeviceConfigForm and renamed types"
```

---

### Task 10: 构建验证

- [ ] **Step 1: 格式化**

```bash
npm run format
```

- [ ] **Step 2: 类型检查**

```bash
npm run check
```

- [ ] **Step 3: 修复所有错误**

如有 ESLint/Stylelint/TypeScript 错误，逐一修复。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: format and fix lint issues after DeviceConfigForm refactoring"
```

---

## 验证清单

全部任务完成后，确认：

- [ ] `npm run format` 无错误
- [ ] `npm run check` 无错误
- [ ] `npm run test` 全部通过
- [ ] `grep -r "device-editor\|DeviceEditor" app/ __tests__/` 无结果
- [ ] `grep -r "process-editor\|ProcessEditor" app/ __tests__/` 无结果
- [ ] `grep -r "ProcessStepEditor\|process-step-editor" app/ __tests__/` 无结果
- [ ] `grep -r "ProcessInterruptEditor\|process-interrupt-editor" app/ __tests__/` 无结果
- [ ] `grep -r "schedule-editor\|ScheduleEditor" app/ __tests__/` 无结果
- [ ] `grep -r "voltage-config-popup\|VoltageConfigPopup" app/ __tests__/` 无结果
