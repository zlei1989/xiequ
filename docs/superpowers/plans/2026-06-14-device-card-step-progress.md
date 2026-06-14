# 设备卡片步骤进度 & antd-mobile 重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设备卡片展示流程步骤进度条 + 上一步/下一步切换，全链路从 ROM 到前端贯通，同时将 device-card 从 antd 迁移到 antd-mobile。

**Architecture:** ROM change 事件补传 stepIndex → 服务端 push-state 持久化到 DB → 前端通过 getDevices 读取 → step-progress 组件渲染 Steps 横向步骤条 + 导航按钮。步骤切换走现有 setDeviceSwitch 链路（新增 stepIndex 参数），ROM 从指定步骤启动执行。

**Tech Stack:** TypeScript (Next.js App Router), SQLite (sql.js WASM), antd-mobile v5, Arduino C++ (ESP32 ROM)

---

## 文件清单

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `app/watering/types.ts` | DeviceState 新增 stepIndex 字段 |
| 修改 | `app/watering/services/db.ts` | DB 迁移 + 读写 stepIndex |
| 修改 | `app/watering/api/push-state/route.ts` | change 事件持久化 stepIndex；finish 清除 |
| 修改 | `app/watering/actions/set-state.ts` | setDeviceSwitch 支持 stepIndex 参数 |
| 修改 | `app/watering/actions.ts` | 导出签名同步 |
| 修改 | `app/watering/api/get-state/route.ts` | buildResponse 下发 stepIndex |
| 修改 | `app/watering/rom-v2/Process.h` | execute() 重载声明 |
| 修改 | `app/watering/rom-v2/Process.cpp` | change 推送补 stepIndex + execute 重载实现 |
| 修改 | `app/watering/rom-v2/rom-v2.ino` | 解析 stepIndex，按指定步骤启动 |
| **新建** | `app/watering/components/step-progress.tsx` | 步骤进度条 + 导航按钮组件 |
| 修改 | `app/watering/components/device-card.tsx` | antd → antd-mobile 迁移 + 集成步骤区 |

---

### Task 1: 类型定义 — DeviceState 新增 stepIndex

**Files:**
- Modify: `app/watering/types.ts`

- [ ] **Step 1: 在 DeviceState 类型中增加 stepIndex 字段**

在 `DeviceState` 类型中，`lastActionType` 之后、`lastWriteTime` 之前添加：

```ts
/** 当前执行的步骤索引（ROM change 上报，undefined 表示未追踪） */
stepIndex?: number;
```

完整插入位置（`app/watering/types.ts:134` 附近）：

```ts
  /** 最后一次动作类型：bootstrap / button / change / finish / heartbeat */
  lastActionType?: 'bootstrap' | 'button' | 'change' | 'finish' | 'heartbeat';
  /** 当前执行的步骤索引（ROM change 上报，undefined 表示未追踪） */
  stepIndex?: number;
  lastWriteTime: string;
```

- [ ] **Step 2: 运行类型检查确认无断点**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors（仅新增可选字段，无破坏性变更）。

- [ ] **Step 3: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat(types): add stepIndex to DeviceState"
```

---

### Task 2: 数据库层 — stepIndex 列迁移 + 读写

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 在 StateRow 接口中添加 step_index 列**

在 `StateRow` 接口（`db.ts:24-38`）的 `last_action_type` 之后添加：

```ts
  step_index: number | null;
```

- [ ] **Step 2: 在 JoinRow 接口中添加 step_index 列**

在 `JoinRow` 接口（`db.ts:41-57`）的 `last_action_type` 之后添加：

```ts
  step_index: number | null;
```

- [ ] **Step 3: 在 initDb() 中添加列迁移**

在 `initDb()` 函数的列迁移区块（`last_action_type` 迁移之后）添加：

```ts
  // 为旧数据库添加 step_index 列（步骤进度追踪）
  try {
    db.exec('ALTER TABLE watering_device_state ADD COLUMN step_index INTEGER');
  } catch {
    // 列已存在，忽略
  }
```

- [ ] **Step 4: 在 getDeviceState() 中读取 step_index**

在 `getDeviceState()` 的返回对象（`db.ts:353-368`）中添加：

```ts
    stepIndex: row.step_index ?? undefined,
```

- [ ] **Step 5: 在 saveDeviceState() 中写入 step_index**

修改 `saveDeviceState()` 的 INSERT 和 UPDATE 语句，新增 `step_index` 列：

INSERT 部分（添加到列列表和 VALUES 中）：
```
current_index, current_process, message, step_index, last_tick_time, ...
```

VALUES：
```
@step_index
```

UPDATE 部分：
```
step_index=@step_index,
```

参数绑定：
```ts
    '@step_index': state.stepIndex ?? null,
```

- [ ] **Step 6: 在 getAllDevices() 中查询和映射 step_index**

在 SELECT 语句中添加 `s.step_index`：

```sql
s.step_index,
```

在 `item.state = { ... }` 映射中添加：

```ts
        stepIndex: row.step_index ?? undefined,
```

- [ ] **Step 7: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors。

- [ ] **Step 8: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat(db): add step_index column migration and read/write support"
```

---

### Task 3: 服务端 — push-state 持久化 stepIndex

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

- [ ] **Step 1: 在 change 事件分支中持久化 stepIndex**

在 `case 'change':` 分支（`push-state/route.ts:122-129`）的 `writeDeviceLog` 调用之前，添加 stepIndex 解析和持久化：

```ts
    case 'change': {
      const stateId = searchParams.get('stateId') || '';
      const type = searchParams.get('type') || '';
      const message = searchParams.get('message') || '';
      // 持久化步骤索引（ROM 新增上报）
      const stepIndex = searchParams.get('stepIndex');
      if (stepIndex !== null) {
        const state = await getDeviceState(chipId);
        if (state) {
          state.stepIndex = parseInt(stepIndex, 10);
          await saveDeviceState(state);
        }
      }
      const changeVoltage = calcVoltage(config?.voltage, gpioState.sensors);
      await writeDeviceLog(chipId, 'change', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads, type, stepIndex: stepIndex ?? undefined }, changeVoltage, stateId, message);
      await updateIdleSince(chipId, 'change');
      break;
    }
```

- [ ] **Step 2: 在 finish 事件分支中清除 stepIndex**

在 `case 'finish':` 分支（`push-state/route.ts:131-148`）中，已有的 `state.index = undefined` 和 `state.process = undefined` 之后，追加：

```ts
        state.stepIndex = undefined;
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors。

- [ ] **Step 4: Commit**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat(push-state): persist stepIndex on change event, clear on finish"
```

---

### Task 4: 服务端 — set-state 支持 stepIndex 参数

**Files:**
- Modify: `app/watering/actions/set-state.ts`

- [ ] **Step 1: setDeviceSwitch 新增 stepIndex 参数**

修改函数签名（`set-state.ts:23-27`）：

```ts
export async function setDeviceSwitch(
  chipId: string,
  switchState: 'on' | 'off',
  processIndex?: number,
  stepIndex?: number,
) {
```

- [ ] **Step 2: on 分支写入 stepIndex**

在 `switchState === 'on'` 分支（`set-state.ts:43-53`）的 `state.process = ...` 之后添加：

```ts
      state.stepIndex = stepIndex ?? 0;
```

- [ ] **Step 3: off 分支清除 stepIndex**

在 `switchState === 'off'` 分支（`set-state.ts:54-57`）的 `state.process = undefined;` 之后添加：

```ts
      state.stepIndex = undefined;
```

- [ ] **Step 4: 更新日志输出**

修改函数开头的 `console.log`，加入 `stepIndex`：

```ts
  console.log('[Watering] 设置设备开关:', { chipId, switchState, processIndex, stepIndex });
```

- [ ] **Step 5: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors。

- [ ] **Step 6: Commit**

```bash
git add app/watering/actions/set-state.ts
git commit -m "feat(set-state): support stepIndex parameter for step-level navigation"
```

---

### Task 5: 服务端 — actions.ts 导出签名同步

**Files:**
- Modify: `app/watering/actions.ts`

- [ ] **Step 1: setDeviceSwitch 导出签名追加 stepIndex 参数**

修改 `setDeviceSwitch` 导出函数（`actions.ts:31-38`）：

```ts
export async function setDeviceSwitch(
  chipId: string,
  switchState: 'on' | 'off',
  processIndex?: number,
  stepIndex?: number,
) {
  console.log('[Watering] 设置设备开关:', { chipId, switchState, processIndex, stepIndex });
  return _setDeviceSwitch(chipId, switchState, processIndex, stepIndex);
}
```

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors。

- [ ] **Step 3: Commit**

```bash
git add app/watering/actions.ts
git commit -m "feat(actions): forward stepIndex to setDeviceSwitch"
```

---

### Task 6: 服务端 — get-state 下发 stepIndex 给 ROM

**Files:**
- Modify: `app/watering/api/get-state/route.ts`

- [ ] **Step 1: buildResponse 中下发 stepIndex**

在 `buildResponse()` 函数（`get-state/route.ts:169-207`）的 `changed` 分支中，`result.process = state.process;` 之后添加：

```ts
  if (changed && state?.process) {
    result.process = state.process;
    // 下发步骤索引，ROM 据此从指定步骤开始执行
    if (typeof state.stepIndex === 'number') {
      result.stepIndex = state.stepIndex;
    }
  }
```

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors。

- [ ] **Step 3: Commit**

```bash
git add app/watering/api/get-state/route.ts
git commit -m "feat(get-state): include stepIndex in response for ROM step-level execution"
```

---

### Task 7: ROM — Process.h 新增 execute 重载声明

**Files:**
- Modify: `app/watering/rom-v2/Process.h`

- [ ] **Step 1: 添加 execute(int startStep) 声明**

在 `execute()` 声明之后、`terminate()` 声明之前（`Process.h:222` 附近）添加：

```cpp
  /**
   * 从指定步骤启动流程执行
   * @param startStep 起始步骤索引（0-based）
   */
  void execute(int startStep);
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/rom-v2/Process.h
git commit -m "feat(rom): add execute(int startStep) declaration to Process.h"
```

---

### Task 8: ROM — Process.cpp 实现 stepIndex 上报 + 指定步骤执行

**Files:**
- Modify: `app/watering/rom-v2/Process.cpp`

- [ ] **Step 1: 实现 execute(int startStep) 重载**

在 `execute()` 实现之后（`Process.cpp:501` 之后）添加：

```cpp
/**
 * 从指定步骤启动流程执行
 * 与 execute() 逻辑相同，但从 startStep 开始而非步骤 0。
 * 边界检查：startStep 越界时回退到 0。
 * @param startStep 起始步骤索引（0-based）
 */
void Process::execute(int startStep) {
  if (steps == nullptr) {
    return;
  }
  // 边界检查：越界时从 0 开始
  if (startStep < 0 || startStep >= stepCount) {
    startStep = 0;
  }
  current.index = startStep;
  processing = true;
  executeTime = millis();
  calculateStep(&current, &steps[current.index]);
}
```

- [ ] **Step 2: 在 step_begin change 推送中追加 stepIndex**

在 `next()` 方法的 `step_begin` 分支（`Process.cpp:112-128`）中，修改 change 推送逻辑。在回调数据中添加 `object["stepIndex"] = current.index`。

但需要确认 ROM 的 pushState 数据如何传递。查看 `processChangeHandler` 在 rom-v2.ino 中的实现（`rom-v2.ino:496-517`），change 数据通过 `pushState("change", &fields)` 发送，fields 中的 JSON 键值对会被序列化为 URL 查询参数。

因此只需在 `processChangeHandler` 中加 `object["stepIndex"] = change->stepIndex`，并在 `Change` 结构体中新增 `stepIndex` 字段。

首先修改 `Process.h` 中的 `Change` 结构体（`Process.h:135-142`），新增：

```cpp
    /** 当前步骤索引 */
    int stepIndex = -1;
```

然后在 `next()` 的四处 change 回调中，均设置 `stepIndex`：

在 step_begin 回调中（`Process.cpp:169-177` area）：
```cpp
      change->stepIndex = current.index;
```

在 step_end 回调中（`Process.cpp:124` area）：
```cpp
      change->stepIndex = current.index;
```

在 step_timeout 回调中（`Process.cpp:57` area）：
```cpp
      change->stepIndex = current.index;
```

在 step_interrupt 回调中（`Process.cpp:91` area）：
```cpp
      change->stepIndex = current.index;
```

- [ ] **Step 3: Commit**

```bash
git add app/watering/rom-v2/Process.h app/watering/rom-v2/Process.cpp
git commit -m "feat(rom): add stepIndex to Change struct, implement execute(startStep)"
```

---

### Task 9: ROM — rom-v2.ino 解析 stepIndex + 传递 stepIndex 到 pushState

**Files:**
- Modify: `app/watering/rom-v2/rom-v2.ino`

- [ ] **Step 1: processChangeHandler 中传递 stepIndex**

在 `processChangeHandler`（`rom-v2.ino:496-517`）的 `object` 构建中，添加：

```cpp
        object["stepIndex"] = change->stepIndex;
```

- [ ] **Step 2: networkStateChangeHandler 中解析 stepIndex**

在 `networkStateChangeHandler`（`rom-v2.ino:446-486`）中，修改流程启动逻辑。将：

```cpp
  process.execute();
```

替换为：

```cpp
  // 支持从指定步骤开始执行
  if ((*state)["stepIndex"].is<int>()) {
    int stepIndex = (*state)["stepIndex"].as<int>();
    process.execute(stepIndex);
  } else {
    process.execute();
  }
```

- [ ] **Step 3: Commit**

```bash
git add app/watering/rom-v2/rom-v2.ino
git commit -m "feat(rom): forward stepIndex to pushState, support step-level execution from server"
```

---

### Task 10: 前端 — 新建 step-progress.tsx 组件

**Files:**
- Create: `app/watering/components/step-progress.tsx`

- [ ] **Step 1: 创建组件文件和完整实现**

```tsx
/**
 * 步骤进度组件 — 展示当前流程的步骤进度条和上一步/下一步导航
 *
 * 使用 antd-mobile Steps（横向）展示已完成/进行中/等待状态，
 * 提供上一步/下一步按钮用于切换 ROM 当前执行步骤。
 */

'use client';

import { Button, Steps } from 'antd-mobile';

import type { StepConfig } from '../types';

export interface StepProgressProps {
  /** 步骤列表（来自 process.steps） */
  steps: StepConfig[];
  /** 当前执行步骤索引，undefined 或负数表示未追踪 */
  stepIndex?: number;
  /** 设备是否在线 */
  online: boolean;
  /** 是否正在执行中（switch === 'on'） */
  running: boolean;
  /** 上一步回调 */
  onPrev: () => void;
  /** 下一步回调 */
  onNext: () => void;
}

/**
 * 根据 stepIndex 和当前索引判定单个步骤的状态
 *
 * - stepIndex 未定义 → 全部 wait
 * - i < stepIndex → finish（已完成）
 * - i === stepIndex → process（进行中）
 * - i > stepIndex → wait（等待）
 */
function getStatus(
  i: number,
  stepIndex: number | undefined,
): 'wait' | 'process' | 'finish' {
  if (stepIndex === undefined || stepIndex < 0) return 'wait';
  if (i < stepIndex) return 'finish';
  if (i === stepIndex) return 'process';
  return 'wait';
}

export function StepProgress({
  steps,
  stepIndex,
  online,
  running,
  onPrev,
  onNext,
}: StepProgressProps) {
  // 无步骤或不在执行中不渲染
  if (steps.length === 0 || !running) return null;

  // 导航按钮禁用判定
  const stepIdx = typeof stepIndex === 'number' && stepIndex >= 0 ? stepIndex : -1;
  const prevDisabled = !online || stepIdx <= 0;
  const nextDisabled = !online || stepIdx < 0 || stepIdx >= steps.length - 1;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {/* 步骤进度条 — 横向 */}
      <Steps direction="horizontal" className="[&_.adm-step-icon]:scale-75">
        {steps.map((step, i) => (
          <Steps.Step
            key={i}
            status={getStatus(i, stepIdx >= 0 ? stepIdx : undefined)}
            title={
              <span className="text-xs">
                {step.name}
              </span>
            }
          />
        ))}
      </Steps>

      {/* 导航按钮 — 仅在有 stepIndex 时显示 */}
      {stepIdx >= 0 && (
        <div className="mt-2 flex justify-between">
          <Button
            color="primary"
            disabled={prevDisabled}
            fill="none"
            size="small"
            onClick={onPrev}
          >
            ← 上一步
          </Button>
          <Button
            color="primary"
            disabled={nextDisabled}
            fill="none"
            size="small"
            onClick={onNext}
          >
            下一步 →
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：0 errors。

- [ ] **Step 3: Commit**

```bash
git add app/watering/components/step-progress.tsx
git commit -m "feat(step-progress): create step progress component with horizontal Steps and navigation"
```

---

### Task 11: 前端 — device-card.tsx antd-mobile 重构 + 集成步骤区

**Files:**
- Modify: `app/watering/components/device-card.tsx`

这是最核心的重构任务。将 antd Card/Tag/Button/Row/Col 替换为 antd-mobile + Tailwind，集成 step-progress 组件。

- [ ] **Step 1: 替换导入**

移除 antd 导入（Card, Tag, Button, Row, Col, message）。`message` API 替换为 antd-mobile 的 `Toast`。
不再使用 `@ant-design/icons`（流程按钮改用纯文字），仅保留 `antd-mobile-icons` 的 `SetOutline`。

```tsx
'use client';

import { ActionSheet, Dialog, Card, Tag, Button, Toast } from 'antd-mobile';
import { SetOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { setDeviceSwitch, removeDevice } from '../actions';
import { StepProgress } from './step-progress';

import type { DeviceItem } from '../types';
```

- [ ] **Step 2: 添加步骤切换处理函数**

在 `handleRemove()` 之后、`return` 之前，添加：

```tsx
  /** 步骤切换：调用 setDeviceSwitch 从指定步骤开始执行 */
  async function handleStepChange(newStepIndex: number) {
    if (!device.isOnline) return;
    const currentIndex = device.state?.index;
    if (typeof currentIndex !== 'number') return;
    try {
      await setDeviceSwitch(device.chipId, 'on', currentIndex, newStepIndex);
      Toast.show({ content: `已切换至步骤 ${newStepIndex + 1}`, icon: 'success' });
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 步骤切换失败 chipId=${device.chipId} stepIndex=${newStepIndex}`,
        err,
      );
      Toast.show({ content: err instanceof Error ? err.message : String(err) || '切换失败', icon: 'fail' });
    }
  }
```

- [ ] **Step 3: 重写 JSX — 卡片头部**

将 antd `<Card extra={...} size="small" title={...}>` 替换为 antd-mobile：

```tsx
    <Card
      extra={
        <div className="flex items-center gap-2">
          <Button
            color="primary"
            fill="none"
            size="small"
            onClick={() => {
              router.push(
                `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
              );
            }}
          >
            日志
          </Button>
          <Button
            color="primary"
            fill="none"
            size="small"
            onClick={() => { setActionVisible(true); }}
          >
            选项
          </Button>
        </div>
      }
      title={device.name || `设备-${device.chipId}`}
    >
```

- [ ] **Step 4: 重写 JSX — 信息行（Row/Col → Tailwind grid）**

将 antd Row/Col 替换为 Tailwind 网格：

```tsx
      {/* 设备信息 — 2 列网格 */}
      <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <span className="text-xs text-gray-400">芯片: </span>
          <span className="text-[13px]">{device.chipId}</span>
        </div>
        {voltage !== undefined ? (
          <div>
            <span className="text-xs text-gray-400">电压: </span>
            <span className="text-[13px] font-medium">
              {voltage.toFixed(2)}V
            </span>
            {device.voltage && (
              <span className="ml-0.5 text-[10px] text-gray-300">
                (计算)
              </span>
            )}
          </div>
        ) : (
          <div />
        )}
        <div>
          <span className="text-xs text-gray-400">网卡: </span>
          <span className="text-xs">{device.macAddress}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400">状态: </span>
          {device.isOnline ? (
            <Tag color="success">在线</Tag>
          ) : (
            <Tag color="default">离线</Tag>
          )}
        </div>
      </div>
```

- [ ] **Step 5: 重写 JSX — 流程按钮（antd Button → antd-mobile Button）**

将 Row/Col 布局替换为 flex wrap，antd Button 替换为 antd-mobile Button：

```tsx
      {/* 流程快捷按钮 — flex wrap 布局 */}
      {processes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {processes.map((proc, idx) => {
            const exec = isExec(idx);
            const disabled = !device.isOnline || (!exec && device.idleSleep);
            return (
              <Button
                block
                className="flex-1"
                color={exec ? 'danger' : 'primary'}
                disabled={disabled}
                key={idx}
                size="small"
                onClick={() => { void onClickSwitch(idx); }}
              >
                {exec ? '停止' : (proc.name ?? `流程${idx + 1}`)}
              </Button>
            );
          })}
        </div>
      )}
```

注意：流程按钮使用 `flex-1` 自适应宽度，不再需要奇数/偶数布局算法。偶数时自动两两一行，奇数时最后一个独占一行或自然排列。

实际上为了保证偶数个 2 列 + 奇数个首个全宽的效果，改用 grid 更可控：

```tsx
      {/* 流程快捷按钮 */}
      {processes.length > 0 && (
        <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: processes.length % 2 === 1 ? '1fr' : '1fr 1fr' }}>
          {processes.map((proc, idx) => {
            const exec = isExec(idx);
            const disabled = !device.isOnline || (!exec && device.idleSleep);
            // 奇数个流程：第 1 个占全宽，其余 2 列
            const colSpan = processes.length % 2 === 1 && idx === 0
              ? { gridColumn: '1 / -1' }
              : {};
            return (
              <Button
                block
                color={exec ? 'danger' : 'primary'}
                disabled={disabled}
                key={idx}
                size="small"
                style={colSpan}
                onClick={() => { void onClickSwitch(idx); }}
              >
                {exec ? '停止' : (proc.name ?? `流程${idx + 1}`)}
              </Button>
            );
          })}
        </div>
      )}
```

- [ ] **Step 6: 集成步骤进度区**

在流程按钮区域之后、`</Card>` 之前添加：

```tsx
      {/* 步骤进度区 — 仅 switch='on' 且有流程时显示 */}
      {device.state?.switch === 'on' && device.state.process && (
        <StepProgress
          online={!!device.isOnline}
          onNext={() => {
            const idx = device.state?.stepIndex;
            if (typeof idx === 'number') {
              void handleStepChange(idx + 1);
            }
          }}
          onPrev={() => {
            const idx = device.state?.stepIndex;
            if (typeof idx === 'number' && idx > 0) {
              void handleStepChange(idx - 1);
            }
          }}
          running
          stepIndex={device.state.stepIndex}
          steps={device.state.process.steps}
        />
      )}
```

- [ ] **Step 7: 更新现有函数中的 `message` → `Toast`**

`onClickSwitch`、`onClickClear`、`handleRemove` 三个函数中使用了 antd 的 `message.success()` 和 `message.error()`，需替换为 antd-mobile 的 `Toast.show()`：

```tsx
// 原来的写法：
message.success('已终止 xxx');
message.error('操作失败');

// 替换为：
Toast.show({ content: '已终止 xxx', icon: 'success' });
Toast.show({ content: '操作失败', icon: 'fail' });
```

完整替换覆盖范围：
- `onClickSwitch`：`message.success` + `message.error`
- `onClickClear`：`message.success` + `message.error`
- `handleRemove`：`message.success` + `message.error`
- `handleStepChange`：已在 Step 2 中使用 Toast 编写

- [ ] **Step 8: 运行格式化 + 类型检查**

```bash
npm run format
npm run check
```

修复所有报错。

- [ ] **Step 9: Commit**

```bash
git add app/watering/components/device-card.tsx
git commit -m "feat(device-card): migrate from antd to antd-mobile, integrate step-progress"
```

---

### Task 12: 集成验证 — 构建 + 运行测试

**Files:**
- (无新建)

- [ ] **Step 1: 运行全部检查**

```bash
npm run check
```

预期：0 errors。若有报错逐一修复。

- [ ] **Step 2: 运行测试**

```bash
npm run test
```

预期：所有已有测试通过。

- [ ] **Step 3: 运行构建**

```bash
npm run build
```

预期：构建成功。

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "chore: fix lint/type errors from device-card refactor"
```

---

### Task 13: 编写单元测试 — step-progress 组件

**Files:**
- Create: `__tests__/watering/components/step-progress.test.tsx`

- [ ] **Step 1: 创建测试文件**

```tsx
/**
 * step-progress 组件单元测试
 *
 * 测试步骤状态判定逻辑和导航按钮禁用条件。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepProgress } from '@/app/watering/components/step-progress';

import type { StepConfig } from '@/app/watering/types';

/** 构建测试用步骤列表 */
function makeSteps(count: number): StepConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `步骤${i + 1}`,
    value: { begin: 0, end: 0 },
  }));
}

describe('StepProgress', () => {
  it('不在执行中时不渲染', () => {
    const { container } = render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running={false}
        stepIndex={0}
        steps={makeSteps(3)}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('步骤列表为空时不渲染', () => {
    const { container } = render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running
        stepIndex={0}
        steps={[]}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('无 stepIndex 时不显示导航按钮', () => {
    render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running
        steps={makeSteps(3)}
      />,
    );
    // 导航按钮不应存在（stepIndex 为 undefined）
    expect(screen.queryByText('← 上一步')).toBeNull();
    expect(screen.queryByText('下一步 →')).toBeNull();
  });

  it('stepIndex=0 时上一步按钮禁用', () => {
    render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running
        stepIndex={0}
        steps={makeSteps(3)}
      />,
    );
    const prevBtn = screen.getByText('← 上一步');
    expect(prevBtn).toBeDefined();
    expect(prevBtn.closest('button')?.disabled).toBe(true);
  });

  it('stepIndex=0 时下一步按钮可用', () => {
    render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running
        stepIndex={0}
        steps={makeSteps(3)}
      />,
    );
    const nextBtn = screen.getByText('下一步 →');
    expect(nextBtn).toBeDefined();
    expect(nextBtn.closest('button')?.disabled).toBe(false);
  });

  it('stepIndex 在最后一步时下一步按钮禁用', () => {
    render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running
        stepIndex={2}
        steps={makeSteps(3)}
      />,
    );
    const nextBtn = screen.getByText('下一步 →');
    expect(nextBtn.closest('button')?.disabled).toBe(true);
  });

  it('设备离线时所有导航按钮禁用', () => {
    render(
      <StepProgress
        online={false}
        onNext={() => {}}
        onPrev={() => {}}
        running
        stepIndex={1}
        steps={makeSteps(3)}
      />,
    );
    const prevBtn = screen.getByText('← 上一步')?.closest('button');
    const nextBtn = screen.getByText('下一步 →')?.closest('button');
    expect(prevBtn?.disabled).toBe(true);
    expect(nextBtn?.disabled).toBe(true);
  });

  it('渲染所有步骤名称', () => {
    render(
      <StepProgress
        online={true}
        onNext={() => {}}
        onPrev={() => {}}
        running
        stepIndex={0}
        steps={makeSteps(3)}
      />,
    );
    expect(screen.getByText('步骤1')).toBeDefined();
    expect(screen.getByText('步骤2')).toBeDefined();
    expect(screen.getByText('步骤3')).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run __tests__/watering/components/step-progress.test.tsx
```

预期：所有测试通过。

- [ ] **Step 3: Commit**

```bash
git add __tests__/watering/components/step-progress.test.tsx
git commit -m "test(step-progress): add unit tests for step-progress component"
```

---

### Task 14: 最终验证 + 合并

- [ ] **Step 1: 运行完整检查流水线**

```bash
npm run format
npm run check
npm run test
npm run build
```

预期：全部通过。

- [ ] **Step 2: 最终 commit（如有遗漏修改）**

```bash
git add -A
git commit -m "chore: final integration fixes for device-card step-progress"
```
