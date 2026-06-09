# Interrupt Signal Type, Logic & Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three fields to interrupt editing: signal type (analog/digital), logic (greater-than/less-than), and trigger threshold. Analog signals show logic + threshold; digital signals show only trigger state.

**Architecture:** Extend the `Interrupt` type with `signalType`, `logic`, and `threshold` optional fields — all optional for backward compatibility with existing data. The `ProcessInterruptEditor` component gains a signal type radio and conditionally renders either the existing digital trigger switch or new analog controls (logic selector + threshold number input). The `addInterrupt` default in `DeviceEditor` initializes with `signalType: "digital"` for backward compatibility.

**Tech Stack:** Next.js App Router, React Client Components, Ant Design v5 (Radio, Select, InputNumber, Switch), TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/watering/types.ts` | Modify | Add `signalType`, `logic`, `threshold` to `Interrupt` type |
| `app/watering/components/process-interrupt-editor.tsx` | Modify | Add signal type selector + conditional analog/digital controls |
| `app/watering/components/device-editor.tsx` | Modify | Update `addInterrupt()` defaults for new fields |

---

### Task 1: Extend Interrupt type with new fields

**Files:**
- Modify: `app/watering/types.ts:14-22`

- [ ] **Step 1: Add `signalType`, `logic`, and `threshold` to the `Interrupt` type**

In `app/watering/types.ts`, replace the `Interrupt` type definition (lines 14-22) with the extended version:

```typescript
// 中断
export type Interrupt = {
  name: string;
  component: string;
  state: number | boolean;
  signalType?: "analog" | "digital";  // 信号类型：模拟 / 数字
  logic?: ">" | "<";                   // 逻辑：大于 / 小于（仅模拟信号生效）
  threshold?: number;                  // 触发阈值（仅模拟信号生效）
  intercept?: number;
  delay?: number;
  duration?: number;
  disabled?: boolean;
};
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat(watering): add signalType, logic, threshold fields to Interrupt type"
```

---

### Task 2: Update addInterrupt default values in DeviceEditor

**Files:**
- Modify: `app/watering/components/device-editor.tsx:160-177`

- [ ] **Step 1: Add new field defaults in `addInterrupt()`**

In `app/watering/components/device-editor.tsx`, inside the `addInterrupt` function, replace the `item` object definition (lines 161-169) to include defaults for the new fields:

```typescript
  function addInterrupt() {
    const item: Interrupt = {
      key: crypto.randomUUID(),
      name: "新中断",
      component: gpio.sensors[0] ?? "sensor_0",
      state: 0,
      signalType: "digital",   // 默认数字信号
      logic: ">",              // 默认大于
      threshold: 0,            // 默认阈值 0
      intercept: 100,
      delay: 0,
      duration: 0,
    };
    const proc = { ...form.processes[processIndex] };
    const step = { ...proc.steps[stepIndex] };
    step.interrupts = [...(step.interrupts || []), item];
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
    setInterruptIndex((step.interrupts || []).length - 1);
    setInterruptVisible(true);
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/device-editor.tsx
git commit -m "feat(watering): add signalType/logic/threshold defaults in addInterrupt"
```

---

### Task 3: Update ProcessInterruptEditor with signal type, logic, and threshold controls

**Files:**
- Modify: `app/watering/components/process-interrupt-editor.tsx`

- [ ] **Step 1: Add Radio import and replace the component**

In `app/watering/components/process-interrupt-editor.tsx`, replace the entire file content with the updated version that includes conditional analog/digital controls:

```typescript
"use client";

import { Input, InputNumber, Switch, Select, Empty, Radio } from "antd";
import type { Interrupt } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";

export function ProcessInterruptEditor({
  interrupt,
  gpio,
  onChange,
  onRemove,
}: {
  interrupt: Interrupt;
  gpio: GpioInfo;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
  const sensorOptions = (gpio.sensors ?? []).map((k) => ({
    value: k,
    label: k,
  }));

  const signalType = interrupt.signalType ?? "digital";
  const logic = interrupt.logic ?? ">";
  const threshold = interrupt.threshold ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          中断名称
        </label>
        <Input
          value={interrupt.name}
          onChange={(e) => onChange({ ...interrupt, name: e.target.value })}
          placeholder="输入中断名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          传感器
        </label>
        {sensorOptions.length > 0 ? (
          <Select
            value={interrupt.component}
            onChange={(v) => onChange({ ...interrupt, component: v })}
            options={sensorOptions}
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用传感器（sensors），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          信号类型
        </label>
        <Radio.Group
          value={signalType}
          onChange={(e) =>
            onChange({
              ...interrupt,
              signalType: e.target.value,
            })
          }
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="digital">数字信号</Radio.Button>
          <Radio.Button value="analog">模拟信号</Radio.Button>
        </Radio.Group>
      </div>

      {/* 数字信号：显示触发状态开关 */}
      {signalType === "digital" && (
        <div>
          <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
            触发状态
          </label>
          <Switch
            checked={interrupt.state === 1 || interrupt.state === true}
            onChange={(checked) =>
              onChange({ ...interrupt, state: checked ? 1 : 0 })
            }
            checkedChildren="触发 (1)"
            unCheckedChildren="未触发 (0)"
          />
        </div>
      )}

      {/* 模拟信号：显示逻辑选择 + 触发阈值 */}
      {signalType === "analog" && (
        <>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              逻辑
            </label>
            <Radio.Group
              value={logic}
              onChange={(e) =>
                onChange({
                  ...interrupt,
                  logic: e.target.value,
                })
              }
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value=">">大于</Radio.Button>
              <Radio.Button value="<">小于</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              触发阈值
            </label>
            <InputNumber
              value={threshold}
              onChange={(v) =>
                onChange({ ...interrupt, threshold: v ?? 0 })
              }
              min={0}
              step={1}
              style={{ width: "100%" }}
              placeholder="输入模拟信号触发阈值"
            />
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              当传感器值{logic === ">" ? "大于" : "小于"}阈值时触发中断
            </div>
          </div>
        </>
      )}

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          屏蔽抖动间隔（毫秒）
        </label>
        <InputNumber
          value={interrupt.intercept}
          onChange={(v) => onChange({ ...interrupt, intercept: v ?? 0 })}
          step={100}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          延迟检测（毫秒）
        </label>
        <InputNumber
          value={interrupt.delay}
          onChange={(v) => onChange({ ...interrupt, delay: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          持续时间（毫秒）
        </label>
        <InputNumber
          value={interrupt.duration}
          onChange={(v) => onChange({ ...interrupt, duration: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          禁用
        </label>
        <Switch
          checked={!interrupt.disabled}
          onChange={(checked) => onChange({ ...interrupt, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/process-interrupt-editor.tsx
git commit -m "feat(watering): add signal type, logic, and threshold controls to interrupt editor"
```

---

### Task 4: Integration verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Verify TypeScript compilation**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -50
```

Expected: No new TypeScript errors related to the watering module or interrupt types.

- [ ] **Step 2: Start the dev server and verify the feature**

```bash
# Start dev server (if not already running)
# Visit http://localhost:3000/watering
```

Manual verification checklist:
- Navigate to 设备列表 → click "配置" on any device → click "编辑" on any process → click "编辑" on any step → click "编辑" on an interrupt (or "添加" to create one)
- Verify the "信号类型" radio group shows "数字信号" and "模拟信号" options
- **[Digital mode]** Select "数字信号" → verify only "触发状态" Switch appears (no logic/threshold fields)
- **[Analog mode]** Select "模拟信号" → verify "逻辑" radio group (大于/小于) and "触发阈值" InputNumber appear, verify "触发状态" Switch is hidden
- Change the threshold value and logic, verify the hint text updates correctly (e.g., "当传感器值大于阈值时触发中断")
- Verify all existing fields (name, sensor, debounce, delay, duration, disabled) still work correctly
- Save and reload to verify data persistence

- [ ] **Step 3: Commit any fixes found during verification**

```bash
git add -A
git commit -m "chore(watering): verification fixes for interrupt signal/logic/threshold"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Covered By |
|-------------|------------|
| 增加"信号"字段（模拟、数字） | Task 1 — `signalType?: "analog" \| "digital"` + Task 3 — Radio.Group with 数字信号/模拟信号 |
| 增加"逻辑"字段（大于、小于） | Task 1 — `logic?: ">" \| "<"` + Task 3 — Radio.Group with 大于/小于 |
| 增加"触发阈值"字段 | Task 1 — `threshold?: number` + Task 3 — InputNumber |
| 模拟信号显示逻辑+触发阈值 | Task 3 — `{signalType === "analog" && (<>logic + threshold</>)}` |
| 数字信号只显示触发状态 | Task 3 — `{signalType === "digital" && (<Switch>)}` |
| 向后兼容旧数据（无新字段） | Task 1 — all new fields are optional (`?`), Task 3 — falls back to `"digital"` when `signalType` undefined |

### 2. Placeholder Scan

No TBD, TODO, or "implement later" found. All steps contain complete, executable code.

### 3. Type Consistency

- `Interrupt.signalType?: "analog" | "digital"` — defined in Task 1, used in Task 3 with correct fallback `signalType ?? "digital"`
- `Interrupt.logic?: ">" | "<"` — defined in Task 1, used in Task 3 with correct fallback `logic ?? ">"`
- `Interrupt.threshold?: number` — defined in Task 1, used in Task 3 with correct fallback `threshold ?? 0`
- All three new fields initialized in `addInterrupt()` in Task 2 with matching types
