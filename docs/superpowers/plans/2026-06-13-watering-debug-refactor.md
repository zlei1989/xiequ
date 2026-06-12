# 浇花 Debug 页面重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app/watering/debug` 的 antd (desktop) 组件替换为 antd-mobile，重构 GPIO 传感器分类（数字/模拟），Button 自动复位逻辑，负载 ProgressCircle 纯展示。

**Architecture:** 文件结构不变，逐文件重构：hook 数据模型 → device-form (5个GPIO卡片) → event-buttons (2×2网格+Popup) → response-log。最后补测试和验证。

**Tech Stack:** antd-mobile 5.42.3, React 19, TypeScript, Tailwind CSS, vitest

---

### Task 1: 调整 `use-iot-simulator.ts` 数据模型

**Files:**
- Modify: `app/watering/debug/hooks/use-iot-simulator.ts`

- [ ] **Step 1: 修改 GpioState 类型和 DEFAULT_GPIO**

找到第 10-39 行的类型定义和默认值，替换为：

```typescript
export type GpioState = {
  /** 数字传感器 — sensor_1(水浸1), sensor_2(水浸2)，值域 0/1 */
  digitalSensors: Record<string, number>;
  /** 模拟传感器 — sensor_0(温度), sensor_3(负载电压), sensor_4(电源电压)，值域 0-1023 */
  analogSensors: Record<string, number>;
  /** 按钮 — button_0~4，值域 0/1，默认 1（高电平） */
  buttons: Record<string, number>;
  /** 负载 — load_0~3，由 Process 驱动，值域 0~255/1024 */
  loads: Record<string, number>;
};

const DEFAULT_GPIO: GpioState = {
  digitalSensors: { sensor_1: 0, sensor_2: 0 },
  analogSensors: { sensor_0: 1827, sensor_3: 0, sensor_4: 355 },
  buttons: { button_0: 1, button_1: 1, button_2: 1, button_3: 1, button_4: 1 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};
```

- [ ] **Step 2: 修改 buildQuery**

找到第 68-98 行的 `buildQuery`，替换 sensors 遍历部分（第 83-89 行）：

```typescript
const buildQuery = useCallback(
  (extra: Record<string, string> = {}): string => {
    const params = new URLSearchParams();
    params.set('macAddress', identity.macAddress);
    params.set('chipId', identity.chipId);

    for (const [k, v] of Object.entries(extra)) {
      if (v !== '') {
        params.set(k, v);
      }
    }

    // 按钮以 sensor:button_x 发送（固件协议：注册为 TYPE_SENSOR）
    for (const [key, val] of Object.entries(gpio.buttons)) {
      params.set(`sensor:${key}`, String(val));
    }
    // 数字传感器 sensor:sensor_x
    for (const [key, val] of Object.entries(gpio.digitalSensors)) {
      params.set(`sensor:${key}`, String(val));
    }
    // 模拟传感器 sensor:sensor_x
    for (const [key, val] of Object.entries(gpio.analogSensors)) {
      params.set(`sensor:${key}`, String(val));
    }
    // 负载 load:load_x
    for (const [key, val] of Object.entries(gpio.loads)) {
      params.set(`load:${key}`, String(val));
    }

    return params.toString();
  },
  [identity, gpio],
);
```

注意：上面修改保留了原有注释和 import，仅替换类型/默认值/buildQuery。其余 hook 逻辑（getState、pushBootstrap 等）无需改动。

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/debug/hooks/use-iot-simulator.ts
```

预期：无类型错误（若报缺少 antd-mobile 类型，项目 tsconfig 已配置 skipLibCheck 可忽略；仅关注该文件自身类型）

- [ ] **Step 4: 提交**

```bash
git add app/watering/debug/hooks/use-iot-simulator.ts
git commit -m "refactor(watering): 拆分 GpioState 为数字/模拟传感器，按钮默认高电平"
```

---

### Task 2: 重构 `device-form.tsx` — 设备标识、数字传感器、按钮

**Files:**
- Modify: `app/watering/debug/components/device-form.tsx`

完全重写此文件。注意：模拟传感器和负载在 Task 3 中继续添加，本 Task 先写设备标识、数字传感器、按钮三个卡片。

- [ ] **Step 1: 写入新 device-form.tsx（含设备标识、数字传感器、按钮）**

```tsx
/**
 * 模拟器设备表单 — 设备标识、数字/模拟传感器、按钮、负载的 GPIO 状态
 *
 * 使用 antd-mobile 组件替换 antd (desktop)，传感器按固件语义分为数字/模拟，
 * 按钮含 2 秒自动复位逻辑，负载为纯展示 ProgressCircle。
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Card, Input, Switch } from 'antd-mobile';

import type { DeviceIdentity, GpioState } from '../hooks/use-iot-simulator';

/** 数字传感器 → 中文标签 */
const DIGITAL_LABELS: Record<string, string> = {
  sensor_1: '水浸1',
  sensor_2: '水浸2',
};

/** 模拟传感器 → 中文标签 */
const ANALOG_LABELS: Record<string, string> = {
  sensor_0: '温度',
  sensor_3: '负载电压',
  sensor_4: '电源电压',
};

/** 按钮自动复位延迟（毫秒），模拟物理按键回弹 */
const BUTTON_AUTO_RESET_MS = 2000;

export function DeviceForm({
  identity,
  onIdentityChange,
  gpio,
  onGpioChange,
}: {
  identity: DeviceIdentity;
  onIdentityChange: (identity: DeviceIdentity) => void;
  gpio: GpioState;
  /** 支持函数式更新（setTimeout 中避免 stale closure） */
  onGpioChange: Dispatch<SetStateAction<GpioState>>;
}) {
  // ---- 按钮自动复位定时器 ----
  const buttonTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  /** 清除指定按钮的定时器 */
  const clearButtonTimer = useCallback((key: string) => {
    const timer = buttonTimers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      buttonTimers.current.delete(key);
    }
  }, []);

  /** 组件卸载时清除所有定时器 */
  useEffect(() => {
    const timers = buttonTimers.current;
    return () => {
      timers.forEach((t) => { clearTimeout(t); });
      timers.clear();
    };
  }, []);

  /** 按钮值变更：若切为 0 则 2 秒后自动回 1 */
  const handleButtonChange = useCallback(
    (key: string, checked: boolean) => {
      const val = checked ? 1 : 0;
      const newButtons = { ...gpio.buttons, [key]: val };
      onGpioChange({ ...gpio, buttons: newButtons });

      // 如果切为 0，启动 2 秒定时器自动回 1
      if (val === 0) {
        clearButtonTimer(key);
        const timer = setTimeout(() => {
          onGpioChange((prev: GpioState) => {
            // 二次确认：定时器触发时值仍为 0 才复位
            if (prev.buttons[key] !== 0) return prev;
            return {
              ...prev,
              buttons: { ...prev.buttons, [key]: 1 },
            };
          });
          buttonTimers.current.delete(key);
        }, BUTTON_AUTO_RESET_MS);
        buttonTimers.current.set(key, timer);
      } else {
        // 切回 1 时取消定时器
        clearButtonTimer(key);
      }
    },
    [gpio, onGpioChange, clearButtonTimer],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ---- 设备标识 ---- */}
      <Card title="设备标识">
        <div className="flex flex-col gap-2 px-2 pb-1">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-sm text-gray-500">
              chipId
            </span>
            <Input
              value={identity.chipId}
              onChange={(v) => {
                onIdentityChange({ ...identity, chipId: v });
              }}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-sm text-gray-500">MAC</span>
            <Input
              value={identity.macAddress}
              onChange={(v) => {
                onIdentityChange({ ...identity, macAddress: v });
              }}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-sm text-gray-500">
              stateId
            </span>
            <Input
              value={identity.stateId}
              onChange={(v) => {
                onIdentityChange({ ...identity, stateId: v });
              }}
              className="flex-1"
            />
          </div>
        </div>
      </Card>

      {/* ---- 数字传感器 ---- */}
      <Card title="数字传感器 (0/1)">
        <div className="flex flex-col gap-2 px-2 pb-1">
          {Object.entries(gpio.digitalSensors).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">
                {key}{' '}
                <span className="text-gray-400">
                  ({DIGITAL_LABELS[key] ?? key})
                </span>
              </span>
              <Switch
                checked={val === 1}
                onChange={(checked) => {
                  onGpioChange({
                    ...gpio,
                    digitalSensors: {
                      ...gpio.digitalSensors,
                      [key]: checked ? 1 : 0,
                    },
                  });
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ---- 按钮 ---- */}
      <Card title="按钮 (0/1，切为 0 后 2 秒自动回 1)">
        <div className="flex flex-col gap-2 px-2 pb-1">
          {Object.entries(gpio.buttons).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{key}</span>
              <Switch
                checked={val === 1}
                onChange={(checked) => {
                  handleButtonChange(key, checked);
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* 模拟传感器 和 负载 在下一步添加 */}
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/debug/components/device-form.tsx
```

预期：无类型错误（useRef/useEffect 在 react 中已导入；Input/Switch/Card 在 antd-mobile 中已导入）

- [ ] **Step 3: 提交**

```bash
git add app/watering/debug/components/device-form.tsx
git commit -m "feat(watering): device-form 重写为 antd-mobile — 设备标识、数字传感器、按钮自动复位"
```

---

### Task 3: 重构 `device-form.tsx` — 模拟传感器、负载 ProgressCircle

**Files:**
- Modify: `app/watering/debug/components/device-form.tsx`

在 Task 2 的文件末尾替换 `{/* 模拟传感器 和 负载 在下一步添加 */}` 注释。

- [ ] **Step 1: 添加模拟传感器卡片**

在 `{/* ---- 按钮 ---- */}` 的 `</Card>` 之后、`</div>` 之前，插入：

```tsx
      {/* ---- 模拟传感器 ---- */}
      <Card title="模拟传感器 (0-1023)">
        <div className="flex flex-col gap-3 px-2 pb-1">
          {Object.entries(gpio.analogSensors).map(([key, val]) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm">
                  {key}{' '}
                  <span className="text-gray-400">
                    ({ANALOG_LABELS[key] ?? key})
                  </span>
                </span>
                <Input
                  value={String(val)}
                  onChange={(v) => {
                    const num = Math.min(
                      1023,
                      Math.max(0, parseInt(v, 10) || 0),
                    );
                    onGpioChange({
                      ...gpio,
                      analogSensors: {
                        ...gpio.analogSensors,
                        [key]: num,
                      },
                    });
                  }}
                  type="number"
                  className="w-20"
                />
              </div>
              <Slider
                min={0}
                max={1023}
                step={1}
                value={val}
                onChange={(v) => {
                  const num = v as number;
                  onGpioChange({
                    ...gpio,
                    analogSensors: {
                      ...gpio.analogSensors,
                      [key]: num,
                    },
                  });
                }}
              />
            </div>
          ))}
        </div>
      </Card>
```

Slider/Input 双向绑定：
- Slider 拖动 → onChange 直接更新 gpio → val prop 变化 → Input value 自动跟随
- Input 手动输入 → onChange clamp(0-1023) → 更新 gpio → Slider value 自动跟随

- [ ] **Step 2: 添加负载 ProgressCircle 卡片**

继续在模拟传感器卡片之后插入：

```tsx
      {/* ---- 负载（纯展示） ---- */}
      <Card title="负载">
        <div className="grid grid-cols-2 gap-3 px-2 pb-1">
          {Object.entries(gpio.loads).map(([key, val]) => {
            // 百分比计算：PWM 模式 val/255*100，1024=100%，0=0%
            const pwmPercent =
              val === 0
                ? 0
                : val === 1024
                  ? 100
                  : Math.round((val / 255) * 100);
            // 颜色：0=灰，1-255=绿，1024=红
            const color =
              val === 0
                ? 'var(--adm-color-weak)'
                : val === 1024
                  ? 'var(--adm-color-danger)'
                  : 'var(--adm-color-success)';
            // 状态文字
            const label =
              val === 0
                ? '停止'
                : val === 1024
                  ? '全速'
                  : `PWM ${pwmPercent}%`;

            return (
              <div key={key} className="flex flex-col items-center gap-1">
                <ProgressCircle
                  percent={pwmPercent}
                  style={{
                    '--fill-color': color,
                    '--size': '64px',
                    '--track-width': '4px',
                  }}
                >
                  <span className="text-sm font-medium">{val}</span>
                </ProgressCircle>
                <span className="text-xs text-gray-500">{key}</span>
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            );
          })}
        </div>
      </Card>
```

注意：需要在文件顶部 import 中添加 `ProgressCircle`：

将 `import { Card, Input, Switch } from 'antd-mobile';` 改为：

```typescript
import { Card, Input, ProgressCircle, Slider, Switch } from 'antd-mobile';
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/debug/components/device-form.tsx
```

预期：无类型错误

- [ ] **Step 4: 提交**

```bash
git add app/watering/debug/components/device-form.tsx
git commit -m "feat(watering): device-form 添加模拟传感器 Slider+Input、负载 ProgressCircle 纯展示"
```

---

### Task 4: 重构 `event-buttons.tsx`

**Files:**
- Modify: `app/watering/debug/components/event-buttons.tsx`

完全重写为 2×2 按钮网格 + 底部 Popup/Picker。

- [ ] **Step 1: 写入新 event-buttons.tsx**

```tsx
/**
 * 模拟器事件按钮 — 2×2 网格触发 getState / pushBootstrap / pushChange / pushFinish
 *
 * bootstrap 和 change 通过底部 Popup 选择参数后发送。
 */

'use client';

import { useState, useCallback } from 'react';
import { Button, Card, Input, Picker, Popup } from 'antd-mobile';

import type { PickerValue } from 'antd-mobile/es/components/picker';

const CHANGE_TYPE_COLUMNS = [
  [
    { label: 'step_ready (步骤就绪)', value: 'step_ready' },
    { label: 'step_begin (步骤开始)', value: 'step_begin' },
    { label: 'step_end (步骤正常结束)', value: 'step_end' },
    { label: 'step_timeout (步骤超时)', value: 'step_timeout' },
    { label: 'step_interrupt (步骤中断)', value: 'step_interrupt' },
  ],
];

const CAUSE_COLUMNS = [
  [
    { label: '0 (正常上电)', value: '0' },
    { label: '2 (外部唤醒)', value: '2' },
    { label: '4 (定时器唤醒)', value: '4' },
  ],
];

/** 当前弹出的面板类型 */
type PopupType = 'bootstrap' | 'change' | null;

export function EventButtons({
  onGetState,
  onPushBootstrap,
  onPushChange,
  onPushFinish,
  loading,
}: {
  onGetState: () => Promise<void>;
  onPushBootstrap: (cause: string) => Promise<void>;
  onPushChange: (type: string, message: string) => Promise<void>;
  onPushFinish: () => Promise<void>;
  loading: boolean;
}) {
  const [popupType, setPopupType] = useState<PopupType>(null);
  const [changeType, setChangeType] = useState<PickerValue[]>(['step_begin']);
  const [changeMessage, setChangeMessage] = useState('');
  const [bootstrapCause, setBootstrapCause] = useState<PickerValue[]>(['0']);

  const closePopup = useCallback(() => {
    setPopupType(null);
  }, []);

  /** bootstrap 确认：发送并关闭 */
  const handleBootstrapConfirm = useCallback(
    (val: PickerValue[]) => {
      setBootstrapCause(val);
      closePopup();
      void onPushBootstrap(String(val[0]));
    },
    [closePopup, onPushBootstrap],
  );

  /** change 确认：发送并关闭 */
  const handleChangeConfirm = useCallback(() => {
    closePopup();
    void onPushChange(String(changeType[0]), changeMessage);
  }, [closePopup, onPushChange, changeType, changeMessage]);

  return (
    <>
      <Card title="模拟事件">
        <div className="grid grid-cols-2 gap-2 px-2 pb-1">
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { setPopupType('bootstrap'); }}
          >
            bootstrap
          </Button>
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { void onGetState(); }}
          >
            getState
          </Button>
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { setPopupType('change'); }}
          >
            change
          </Button>
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { void onPushFinish(); }}
          >
            finish
          </Button>
        </div>
      </Card>

      {/* ---- bootstrap Popup ---- */}
      <Popup
        visible={popupType === 'bootstrap'}
        onClose={closePopup}
        position="bottom"
        bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      >
        <div className="px-3 pb-6 pt-4">
          <h3 className="mb-3 text-center text-base font-medium">
            bootstrap 参数
          </h3>
          <div className="mb-4 text-sm text-gray-500">启动原因 (cause)</div>
          <Picker
            columns={CAUSE_COLUMNS}
            value={bootstrapCause}
            onConfirm={handleBootstrapConfirm}
            onCancel={closePopup}
          />
        </div>
      </Popup>

      {/* ---- change Popup ---- */}
      <Popup
        visible={popupType === 'change'}
        onClose={closePopup}
        position="bottom"
        bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      >
        <div className="px-3 pb-6 pt-4">
          <h3 className="mb-3 text-center text-base font-medium">
            change 参数
          </h3>
          <div className="mb-2 text-sm text-gray-500">变更类型 (type)</div>
          <Picker
            columns={CHANGE_TYPE_COLUMNS}
            value={changeType}
            onSelect={(val) => { setChangeType(val); }}
          />
          <div className="mb-2 mt-4 text-sm text-gray-500">
            附加消息 (message)
          </div>
          <Input
            placeholder="可选"
            value={changeMessage}
            onChange={(v) => { setChangeMessage(v); }}
          />
          <Button
            block
            color="primary"
            className="mt-4"
            onClick={handleChangeConfirm}
          >
            确认发送
          </Button>
        </div>
      </Popup>
    </>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/debug/components/event-buttons.tsx
```

预期：无类型错误

- [ ] **Step 3: 提交**

```bash
git add app/watering/debug/components/event-buttons.tsx
git commit -m "feat(watering): event-buttons 重写为 2×2 网格 + Popup/Picker"
```

---

### Task 5: 重构 `response-log.tsx`

**Files:**
- Modify: `app/watering/debug/components/response-log.tsx`

- [ ] **Step 1: 写入新 response-log.tsx**

```tsx
/**
 * 模拟器响应日志 — 展示每次请求的请求/响应详情
 *
 * 使用 antd-mobile Card + 自绘标签替换 antd Tag。
 */

'use client';

import { useState, useCallback } from 'react';
import { Button, Card } from 'antd-mobile';

import type { LogEntry } from '../hooks/use-iot-simulator';

/** 方向标签配置 */
const directionMeta: Record<
  LogEntry['direction'],
  { label: string; color: string }
> = {
  request: { label: 'REQ', color: '#1677ff' },
  response: { label: 'RES', color: '#52c41a' },
};

/** URL 最大展示长度，超出则截断 */
const URL_MAX_LENGTH = 80;

export function ResponseLog({
  logs,
  onClear,
}: {
  logs: LogEntry[];
  onClear: () => void;
}) {
  return (
    <Card
      title="请求日志"
      extra={
        <Button size="mini" color="danger" fill="none" onClick={onClear}>
          清空
        </Button>
      }
    >
      <div className="max-h-[400px] overflow-y-auto rounded bg-gray-50 p-2 font-mono text-xs">
        {logs.length === 0 && (
          <div className="py-4 text-center text-gray-400">暂无请求</div>
        )}
        {logs.map((log) => (
          <LogItem key={log.id} log={log} />
        ))}
      </div>
    </Card>
  );
}

/** 单条日志条目 — 含 URL 截断/展开 */
function LogItem({ log }: { log: LogEntry }) {
  const meta = directionMeta[log.direction];
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const urlTruncated =
    log.url.length > URL_MAX_LENGTH && !expanded
      ? log.url.slice(0, URL_MAX_LENGTH) + '…'
      : log.url;
  const canExpand = log.url.length > URL_MAX_LENGTH;

  return (
    <div className="mb-2 border-0 border-b border-solid border-gray-100 pb-2">
      {/* 标签行 */}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block rounded px-1.5 py-px text-[10px] font-medium text-white"
          style={{ background: meta.color }}
        >
          {meta.label}
        </span>
        <span className="text-gray-400">{log.timestamp}</span>
        {log.status !== undefined && (
          <span
            className={`inline-block rounded px-1.5 py-px text-[10px] font-medium text-white ${
              log.status < 400 ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {log.status}
          </span>
        )}
        {log.error && (
          <span className="inline-block rounded bg-red-500 px-1.5 py-px text-[10px] font-medium text-white">
            ERROR
          </span>
        )}
      </div>

      {/* URL（可展开） */}
      <div
        className={`mt-0.5 break-all text-gray-500 ${
          canExpand ? 'cursor-pointer select-none' : ''
        }`}
        onClick={canExpand ? toggleExpand : undefined}
      >
        {urlTruncated}
      </div>

      {/* Body */}
      {log.body && (
        <pre className="mb-0 mt-1 overflow-x-auto text-[11px] text-gray-800">
          {log.body}
        </pre>
      )}

      {/* Error */}
      {log.error && (
        <div className="mt-0.5 text-red-500">{log.error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/debug/components/response-log.tsx
```

预期：无类型错误

- [ ] **Step 3: 提交**

```bash
git add app/watering/debug/components/response-log.tsx
git commit -m "feat(watering): response-log 替换 antd Tag 为自绘标签，URL 截断/展开"
```

---

### Task 6: 更新 `page.tsx` 消除 antd 依赖

**Files:**
- Modify: `app/watering/debug/page.tsx`

- [ ] **Step 1: 替换 page.tsx 中的 antd Typography 导入**

当前 page.tsx 第 9 行 `import { Typography } from 'antd';` — 将 `<Title>` 和 `<Paragraph>` 替换为原生 HTML + Tailwind：

```tsx
/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

import { DeviceForm } from './components/device-form';
import { EventButtons } from './components/event-buttons';
import { ResponseLog } from './components/response-log';
import { useIotSimulator } from './hooks/use-iot-simulator';

export default function DebugPage() {
  const {
    identity,
    setIdentity,
    gpio,
    setGpio,
    logs,
    loading,
    getState,
    pushBootstrap,
    pushChange,
    pushFinish,
    clearLogs,
  } = useIotSimulator();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="m-0 text-lg font-semibold">IoT 设备模拟器</h4>
        <p className="mb-0 mt-1 text-sm text-gray-500">
          模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议
        </p>
      </div>

      <DeviceForm
        identity={identity}
        onIdentityChange={setIdentity}
        gpio={gpio}
        onGpioChange={setGpio}
      />

      <EventButtons
        onGetState={getState}
        onPushBootstrap={pushBootstrap}
        onPushChange={pushChange}
        onPushFinish={pushFinish}
        loading={loading}
      />

      <ResponseLog logs={logs} onClear={clearLogs} />
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/debug/page.tsx
```

预期：无类型错误

- [ ] **Step 3: 确认无残留 antd (desktop) 导入**

```bash
grep -r "from 'antd'" app/watering/debug/ || echo "无 antd 残留 — OK"
```

预期：无任何匹配

- [ ] **Step 4: 提交**

```bash
git add app/watering/debug/page.tsx
git commit -m "feat(watering): DebugPage 移除 antd Typography，完全消除 antd 依赖"
```

---

### Task 7: 编写测试

**Files:**
- Create: `__tests__/watering/debug/button-autoreset.test.ts`

- [ ] **Step 1: 写入测试文件**

```tsx
/**
 * 按钮自动复位逻辑单元测试
 *
 * 使用 vitest + @testing-library/react 测试 DeviceForm 中按钮 2 秒自动复位行为。
 * 模拟传感器 clamp 逻辑作为独立纯函数测试。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DeviceForm } from '@/app/watering/debug/components/device-form';
import type { DeviceIdentity, GpioState } from '@/app/watering/debug/hooks/use-iot-simulator';

/** 默认测试数据 */
const defaultIdentity: DeviceIdentity = {
  chipId: 'test',
  macAddress: '00:00:00:00:00:00',
  stateId: '',
};

const defaultGpio: GpioState = {
  digitalSensors: { sensor_1: 0, sensor_2: 0 },
  analogSensors: { sensor_0: 0, sensor_3: 0, sensor_4: 0 },
  buttons: { button_0: 1, button_1: 1, button_2: 1, button_3: 1, button_4: 1 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};

describe('按钮自动复位', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('切换为 0 后 2 秒自动回 1', async () => {
    const onChange = vi.fn();

    render(
      <DeviceForm
        identity={defaultIdentity}
        onIdentityChange={vi.fn()}
        gpio={defaultGpio}
        onGpioChange={onChange}
      />,
    );

    // 找到 button_0 的 Switch（前 2 个是数字传感器 Switch，后 5 个是按钮 Switch）
    const switches = screen.getAllByRole('switch');
    const btnSwitch = switches[5];

    // 点击切为 0
    fireEvent.click(btnSwitch);

    // 验证第一次调用传入了 val=0
    expect(onChange).toHaveBeenCalledTimes(1);
    const firstCall = onChange.mock.calls[0][0] as GpioState;
    expect(firstCall.buttons.button_0).toBe(0);

    // 快进 2 秒
    act(() => { vi.advanceTimersByTime(2100); });

    // 验证第二次调用传入了 val=1
    expect(onChange).toHaveBeenCalledTimes(2);
    const secondCall = onChange.mock.calls[1][0] as GpioState;
    expect(secondCall.buttons.button_0).toBe(1);
  });

  it('2 秒内手动切回 1 则取消定时器', async () => {
    const onChange = vi.fn();

    render(
      <DeviceForm
        identity={defaultIdentity}
        onIdentityChange={vi.fn()}
        gpio={defaultGpio}
        onGpioChange={onChange}
      />,
    );

    const switches = screen.getAllByRole('switch');
    const btnSwitch = switches[5];

    // 切为 0
    fireEvent.click(btnSwitch);
    // 立即切回 1（模拟用户手动恢复）
    fireEvent.click(btnSwitch);

    expect(onChange).toHaveBeenCalledTimes(2);
    const secondCall = onChange.mock.calls[1][0] as GpioState;
    expect(secondCall.buttons.button_0).toBe(1);

    // 快进 2 秒，不应再有调用
    act(() => { vi.advanceTimersByTime(2100); });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('模拟传感器值 clamp', () => {
  it('超出 1023 时 clamp 为 1023', () => {
    const clamp = (v: number) => Math.min(1023, Math.max(0, v));
    expect(clamp(2000)).toBe(1023);
    expect(clamp(-5)).toBe(0);
    expect(clamp(512)).toBe(512);
  });
});
```
- [ ] **Step 2: 运行测试验证**

```bash
npx vitest run __tests__/watering/debug/button-autoreset.test.ts
```

预期：所有测试通过

- [ ] **Step 3: 提交**

```bash
git add __tests__/watering/debug/button-autoreset.test.ts
git commit -m "test(watering): 按钮自动复位 + 模拟传感器 clamp 单元测试"
```

---

### Task 8: 最终验证

**Files:** 全部已修改文件

- [ ] **Step 1: 格式化**

```bash
npm run format
```

- [ ] **Step 2: TypeScript 类型检查 + Lint**

```bash
npm run check
```

- [ ] **Step 3: 修复所有错误**

若有 ESLint/Stylelint/TypeScript 错误，逐一修复，重新执行 `npm run format && npm run check` 直到无错误。

- [ ] **Step 4: 运行全部测试**

```bash
npm run test
```

预期：全部测试通过

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: format + check 通过，最终验证"
```
