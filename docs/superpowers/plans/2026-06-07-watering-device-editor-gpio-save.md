# 设备编辑器：保存按钮 + 动态 GPIO 选项 + 触发按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为设备编辑页添加保存按钮，将负载/传感器选项从硬编码改为从设备 GPIO 状态动态生成，增加触发按钮下拉框。

**Architecture:** 数据流从 `watering_device_state` 表的 `buttons`/`sensors`/`loads` JSON 列读取 GPIO 键名，通过 `useDeviceConfig` hook → `page.tsx` → `DeviceEditor` → 嵌套 Drawer → `ProcessStepEditor` / `ProcessInterruptEditor` 传递。`Step` 类型新增可选 `trigger` 字段存储触发按钮。

**Tech Stack:** Next.js App Router, React 19, Ant Design 6, TypeScript

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `app/watering/types.ts` | `Step` 类型新增 `trigger?: string` |
| Modify | `app/watering/hooks/use-device-config.ts` | 返回值新增 `gpio`（从 state 提取 loads/sensors/buttons 键名列表） |
| Modify | `app/watering/devices/[chipId]/page.tsx` | 将 gpio 传给 DeviceEditor，Header 增加保存按钮 |
| Modify | `app/watering/components/device-editor.tsx` | 接受 `gpio` prop 并透传给子编辑器，底部增加保存按钮 |
| Modify | `app/watering/components/process-step-editor.tsx` | 接受 `gpio`，负载/触发按钮选项动态化 |
| Modify | `app/watering/components/process-interrupt-editor.tsx` | 接受 `gpio`，传感器选项动态化 |

---

### Task 1: Step 类型新增 trigger 字段

**Files:**
- Modify: `app/watering/types.ts:2-11`

`Step` 类型新增可选的 `trigger` 字段，用于存储触发步骤的按钮组件名（如 `"button_0"`）。

- [ ] **Step 1: 修改 Step 类型定义**

```ts
// app/watering/types.ts:2-11
// 将现有 Step 类型替换为：
export type Step = {
  name: string;
  component: string;
  trigger?: string;          // 新增：触发按钮（如 button_0）
  value: { begin: unknown; end: unknown };
  delay?: number;
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat(watering/types): add optional trigger field to Step"
```

---

### Task 2: useDeviceConfig 返回 GPIO 信息

**Files:**
- Modify: `app/watering/hooks/use-device-config.ts`

从 `DeviceItem.state` 中提取 `buttons`/`sensors`/`loads` 的键名，通过 hook 返回值暴露给调用方。

- [ ] **Step 1: 定义 GpioInfo 接口并修改 hook**

```ts
// app/watering/hooks/use-device-config.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceConfig } from "../types";
import { getDevices } from "../actions";
import { updateDeviceConfig } from "../actions/set-config";
import { removeDevice } from "../actions/delete-device";

/** 设备 GPIO 可用引脚信息（键名列表） */
export interface GpioInfo {
  loads: string[];
  sensors: string[];
  buttons: string[];
}

export function useDeviceConfig(chipId: string) {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [gpio, setGpio] = useState<GpioInfo>({ loads: [], sensors: [], buttons: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const devices = await getDevices();
      const found = devices.find((d) => d.chipId === chipId);
      if (found) {
        setConfig(found as unknown as DeviceConfig);
        // 从设备 state 中提取 GPIO 键名
        setGpio({
          loads: Object.keys(found.state?.loads ?? {}),
          sensors: Object.keys(found.state?.sensors ?? {}),
          buttons: Object.keys(found.state?.buttons ?? {}),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const save = useCallback(async (data: Partial<DeviceConfig>) => {
    setLoading(true);
    try {
      await updateDeviceConfig(chipId, data);
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const remove = useCallback(async () => {
    await removeDevice(chipId);
  }, [chipId]);

  useEffect(() => {
    load();
  }, [load]);

  return { config, gpio, loading, load, save, remove };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/hooks/use-device-config.ts
git commit -m "feat(watering/hooks): return GPIO info (loads/sensors/buttons keys) from useDeviceConfig"
```

---

### Task 3: 设备编辑页 Header 增加保存按钮，传递 gpio 给 DeviceEditor

**Files:**
- Modify: `app/watering/devices/[chipId]/page.tsx`

页面 Header 右侧增加"保存"按钮（触发 DeviceEditor 的保存逻辑）。将 `gpio` 传递给 `DeviceEditor`。

需要让 page.tsx 能触发 DeviceEditor 内部的保存。策略：通过 `useRef` 暴露 `saveRef`，DeviceEditor 注册 `handleSave` 到 ref，Header 按钮调用 `saveRef.current()`。

- [ ] **Step 1: 重写设备详情页**

```tsx
// app/watering/devices/[chipId]/page.tsx
"use client";

import { use, useRef } from "react";
import { Spin, Button, message } from "antd";
import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceConfig } from "../../hooks/use-device-config";
import { DeviceEditor } from "../../components/device-editor";

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { config, gpio, loading, save, remove } = useDeviceConfig(chipId);

  // DeviceEditor 将 handleSave 注册到此 ref，Header 保存按钮通过它触发保存
  const saveRef = useRef<() => Promise<void>>(async () => {});

  async function handleRemove() {
    try {
      await remove();
      message.success("设备已删除");
      router.push("/watering");
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  if (loading || !config) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      {/* Header 含保存 + 返回按钮 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>{config.name || "设备配置"}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => saveRef.current()}
          >
            保存
          </Button>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
            返回
          </Button>
        </div>
      </div>

      <DeviceEditor
        config={config}
        gpio={gpio}
        onSave={async (data) => {
          await save(data);
          message.success("已保存");
        }}
        onRemove={handleRemove}
        saveRef={saveRef}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/devices/[chipId]/page.tsx
git commit -m "feat(watering/page): add save button in header, thread gpio to DeviceEditor via saveRef"
```

---

### Task 4: DeviceEditor 接受 gpio 和 saveRef，透传 GPIO 并绑定保存

**Files:**
- Modify: `app/watering/components/device-editor.tsx`

`DeviceEditor` 新增 `gpio` 和 `saveRef` props。在 `useEffect` 中将 `handleSave` 注册到 `saveRef`。将 `gpio` 传递给 `ProcessStepEditor` 和 `ProcessInterruptEditor`。底部增加一个醒目的保存按钮。

- [ ] **Step 1: 修改 DeviceEditor props 和透传逻辑**

改动点汇总：
1. 导入 `GpioInfo` 类型和 `useEffect`
2. props 新增 `gpio: GpioInfo` 和 `saveRef: React.MutableRefObject<() => Promise<void>>`
3. `useEffect` 将 `handleSave` 注册到 `saveRef.current`
4. `<ProcessStepEditor>` 传递 `gpio` prop
5. `<ProcessInterruptEditor>` 传递 `gpio` prop
6. 表单底部（删除按钮上方）增加保存按钮

```tsx
// app/watering/components/device-editor.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Input,
  InputNumber,
  Switch,
  Button,
  Table,
  Drawer,
  Popconfirm,
  message,
  Space,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CloseOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import type { DeviceConfig, Process, Step, Interrupt, Schedule } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";
import { ProcessEditor } from "./process-editor";
import { ProcessStepEditor } from "./process-step-editor";
import { ProcessInterruptEditor } from "./process-interrupt-editor";
import { ScheduleEditor } from "./schedule-editor";

export function DeviceEditor({
  config,
  gpio,
  onSave,
  onRemove,
  saveRef,
}: {
  config: DeviceConfig;
  gpio: GpioInfo;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
  saveRef: React.MutableRefObject<() => Promise<void>>;
}) {
  const [form, setForm] = useState<DeviceConfig>(config);
  const [saving, setSaving] = useState(false);

  // 将 handleSave 暴露给父组件 Header 的保存按钮
  useEffect(() => {
    saveRef.current = handleSave;
  });

  // ---- 嵌套 Drawer 状态（匹配 IotEditor 的 visible refs）----
  const [processVisible, setProcessVisible] = useState(false);
  const [processIndex, setProcessIndex] = useState(-1);

  const [stepVisible, setStepVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const [interruptVisible, setInterruptVisible] = useState(false);
  const [interruptIndex, setInterruptIndex] = useState(-1);

  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [scheduleIndex, setScheduleIndex] = useState(-1);

  // ---- 保存 ----
  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        idleSleep: form.idleSleep,
        idleTimeout: form.idleTimeout,
        bootExec: form.bootExec,
        execDelay: form.execDelay,
        processes: form.processes,
        schedules: form.schedules,
      });
      message.success("保存成功");
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // ---- 流程操作 ----
  function addProcess() {
    const item: Process = {
      key: crypto.randomUUID(),
      name: "新流程",
      steps: [
        {
          key: crypto.randomUUID(),
          name: "新步骤",
          component: gpio.loads[0] ?? "load_0",
          value: { begin: 255, end: 0 },
          delay: 0,
          timeout: 600000,
          interrupts: [],
        },
      ],
    };
    const newProcesses = [...form.processes, item];
    setForm({ ...form, processes: newProcesses });
    setProcessIndex(newProcesses.length - 1);
    setProcessVisible(true);
  }

  function updateProcess(index: number, updated: Process) {
    const newProcesses = [...form.processes];
    newProcesses[index] = updated;
    setForm({ ...form, processes: newProcesses });
  }

  function deleteProcess() {
    const newProcesses = form.processes.filter((_, i) => i !== processIndex);
    setForm({ ...form, processes: newProcesses });
    setProcessVisible(false);
    setProcessIndex(-1);
  }

  // ---- 步骤操作 ----
  function addStep() {
    const proc = { ...form.processes[processIndex] };
    const item: Step = {
      key: crypto.randomUUID(),
      name: "新步骤",
      component: gpio.loads[0] ?? "load_0",
      value: { begin: 0, end: 0 },
      delay: 0,
      timeout: 600000,
      interrupts: [],
    };
    proc.steps = [...proc.steps, item];
    updateProcess(processIndex, proc);
    setStepIndex(proc.steps.length - 1);
    setStepVisible(true);
  }

  function updateStep(index: number, updated: Step) {
    const proc = { ...form.processes[processIndex] };
    const newSteps = [...proc.steps];
    newSteps[index] = updated;
    proc.steps = newSteps;
    updateProcess(processIndex, proc);
  }

  function deleteStep() {
    const proc = { ...form.processes[processIndex] };
    proc.steps = proc.steps.filter((_, i) => i !== stepIndex);
    updateProcess(processIndex, proc);
    setStepVisible(false);
    setStepIndex(-1);
  }

  // ---- 中断操作 ----
  function addInterrupt() {
    const item: Interrupt = {
      key: crypto.randomUUID(),
      name: "新中断",
      component: gpio.sensors[0] ?? "sensor_0",
      state: 0,
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

  function updateInterrupt(index: number, updated: Interrupt) {
    const proc = { ...form.processes[processIndex] };
    const step = { ...proc.steps[stepIndex] };
    const newInterrupts = [...(step.interrupts || [])];
    newInterrupts[index] = updated;
    step.interrupts = newInterrupts;
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
  }

  function deleteInterrupt() {
    const proc = { ...form.processes[processIndex] };
    const step = { ...proc.steps[stepIndex] };
    step.interrupts = (step.interrupts || []).filter((_, i) => i !== interruptIndex);
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
    setInterruptVisible(false);
    setInterruptIndex(-1);
  }

  // ---- 定时操作 ----
  function addSchedule() {
    const item: Schedule = {
      key: crypto.randomUUID(),
      type: "day",
      value: 8 * 3600 * 1000,
      interval: 1,
      process: 0,
    };
    const newSchedules = [...form.schedules, item];
    setForm({ ...form, schedules: newSchedules });
    setScheduleIndex(newSchedules.length - 1);
    setScheduleVisible(true);
  }

  function updateSchedule(index: number, updated: Schedule) {
    const newSchedules = [...form.schedules];
    newSchedules[index] = updated;
    setForm({ ...form, schedules: newSchedules });
  }

  function deleteSchedule() {
    const newSchedules = form.schedules.filter((_, i) => i !== scheduleIndex);
    setForm({ ...form, schedules: newSchedules });
    setScheduleVisible(false);
    setScheduleIndex(-1);
  }

  // ---- 流程表格列 ----
  const processColumns = [
    { title: "#", dataIndex: "_idx", width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: "名称", dataIndex: "name", key: "name" },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: any, record: Process, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setProcessIndex(index);
            setProcessVisible(true);
          }}
        />
      ),
    },
  ];

  // ---- 定时表格列 ----
  const scheduleColumns = [
    { title: "#", dataIndex: "_idx", width: 40, render: (_: any, __: any, index: number) => index + 1 },
    {
      title: "时间",
      key: "time",
      render: (_: any, record: Schedule) => {
        if (record.type === "day") {
          const h = Math.floor(record.value / 3600000);
          const m = Math.floor((record.value % 3600000) / 60000);
          return `每天 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        }
        return `${record.type} ${record.value}`;
      },
    },
    { title: "间隔", dataIndex: "interval", key: "interval" },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: any, record: Schedule, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setScheduleIndex(index);
            setScheduleVisible(true);
          }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: "0 16px" }}>
      {/* ---- 基本设置表单 ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
            设备名称
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="输入设备名称"
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
            空闲睡眠
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch
              checked={form.idleSleep}
              onChange={(v) => setForm({ ...form, idleSleep: v })}
            />
            <span style={{ fontSize: 12, color: "#999" }}>
              {form.idleSleep ? "设备将不接受实时控制，仅执行计划任务，达到省电目的" : ""}
            </span>
          </div>
        </div>

        {form.idleSleep && (
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              空闲超时（毫秒）
            </label>
            <InputNumber
              value={form.idleTimeout}
              onChange={(v) => setForm({ ...form, idleTimeout: v ?? 30000 })}
              step={1000}
              min={0}
              style={{ width: "100%" }}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
            开机执行
          </label>
          <select
            value={form.bootExec}
            onChange={(e) =>
              setForm({ ...form, bootExec: Number(e.target.value) })
            }
            style={{ width: "100%", padding: "4px 8px", fontSize: 14, borderRadius: 6, border: "1px solid #d9d9d9" }}
          >
            <option value={-1}>无</option>
            {form.processes.map((p, i) => (
              <option key={i} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
            延迟执行（毫秒）
          </label>
          <InputNumber
            value={form.execDelay}
            onChange={(v) => setForm({ ...form, execDelay: v ?? 0 })}
            step={1000}
            min={0}
            disabled={form.bootExec < 0}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* ---- 流程表格 ---- */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>功能</h4>
        <Table
          dataSource={form.processes}
          columns={processColumns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addProcess}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>

      {/* ---- 定时表格 ---- */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>计划任务</h4>
        <Table
          dataSource={form.schedules}
          columns={scheduleColumns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addSchedule}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>

      {/* ---- 保存按钮（底部） ---- */}
      <Button
        type="primary"
        icon={<SaveOutlined />}
        onClick={handleSave}
        loading={saving}
        block
        style={{ marginBottom: 12 }}
      >
        保存配置
      </Button>

      {/* ---- 删除设备按钮 ---- */}
      <Popconfirm title="确认删除设备？不可恢复。" onConfirm={onRemove}>
        <Button danger block style={{ marginBottom: 16 }}>
          删除设备
        </Button>
      </Popconfirm>

      {/* ============================================
          嵌套 Drawer 层
          ============================================ */}

      {/* 流程编辑 Drawer (80%) */}
      <Drawer
        title="编辑流程"
        placement="bottom"
        size="80%"
        open={processVisible}
        onClose={() => setProcessVisible(false)}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此流程？" onConfirm={deleteProcess}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => setProcessVisible(false)}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {processIndex > -1 && (
          <ProcessEditor
            process={form.processes[processIndex]}
            onChange={(updated) => updateProcess(processIndex, updated)}
            onRemove={deleteProcess}
            onEditStep={(stepIdx) => {
              setStepIndex(stepIdx);
              setStepVisible(true);
            }}
            onAddStep={addStep}
          />
        )}
      </Drawer>

      {/* 步骤编辑 Drawer (75%) */}
      <Drawer
        title="编辑步骤"
        placement="bottom"
        size="75%"
        open={stepVisible}
        onClose={() => setStepVisible(false)}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此步骤？" onConfirm={deleteStep}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => setStepVisible(false)}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {stepIndex > -1 && processIndex > -1 && (
          <ProcessStepEditor
            step={form.processes[processIndex].steps[stepIndex]}
            gpio={gpio}
            onChange={(updated) => updateStep(stepIndex, updated)}
            onRemove={deleteStep}
            onEditInterrupt={(intIdx) => {
              setInterruptIndex(intIdx);
              setInterruptVisible(true);
            }}
            onAddInterrupt={addInterrupt}
          />
        )}
      </Drawer>

      {/* 中断编辑 Drawer (70%) */}
      <Drawer
        title="编辑中断"
        placement="bottom"
        size="70%"
        open={interruptVisible}
        onClose={() => setInterruptVisible(false)}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此中断？" onConfirm={deleteInterrupt}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => setInterruptVisible(false)}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {interruptIndex > -1 &&
          stepIndex > -1 &&
          processIndex > -1 &&
          form.processes[processIndex].steps[stepIndex].interrupts && (
            <ProcessInterruptEditor
              interrupt={
                form.processes[processIndex].steps[stepIndex].interrupts![
                  interruptIndex
                ]
              }
              gpio={gpio}
              onChange={(updated) => updateInterrupt(interruptIndex, updated)}
              onRemove={deleteInterrupt}
            />
          )}
      </Drawer>

      {/* 定时编辑 Drawer (70%) */}
      <Drawer
        title="编辑计划任务"
        placement="bottom"
        size="70%"
        open={scheduleVisible}
        onClose={() => setScheduleVisible(false)}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此计划任务？" onConfirm={deleteSchedule}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => setScheduleVisible(false)}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {scheduleIndex > -1 && (
          <ScheduleEditor
            schedules={[form.schedules[scheduleIndex]]}
            processes={form.processes}
            onChange={(updated) => {
              if (updated.length > 0) {
                updateSchedule(scheduleIndex, updated[0]);
              }
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/device-editor.tsx
git commit -m "feat(watering/device-editor): add saveRef + gpio prop, bottom save button, thread gpio to child editors"
```

---

### Task 5: ProcessStepEditor 动态负载选项 + 触发按钮下拉框

**Files:**
- Modify: `app/watering/components/process-step-editor.tsx`

改动：
1. 删除硬编码 `LOAD_OPTIONS`，改用 `gpio.loads` 动态生成
2. 新增 `gpio` prop（`GpioInfo` 类型）
3. "负载"下拉框下方新增"触发按钮"下拉框（选项来自 `gpio.buttons`）
4. 当 `gpio` 为空时，fallback 到原有默认值

- [ ] **Step 1: 重写 ProcessStepEditor**

```tsx
// app/watering/components/process-step-editor.tsx
"use client";

import { Input, InputNumber, Switch, Button, Select, Table, Empty } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Step, Interrupt } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";

/** 从 GPIO 键名列表生成 Select options，空列表时 fallback 显示 "无可用" */
function toOptions(keys: string[] | undefined, prefix: string) {
  if (!keys || keys.length === 0) {
    return [];
  }
  return keys.map((k) => ({ value: `${prefix}${k}`, label: k }));
}

export function ProcessStepEditor({
  step,
  gpio,
  onChange,
  onRemove,
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
  const loadOptions = toOptions(gpio.loads, "load_");
  const buttonOptions = toOptions(gpio.buttons, "button_");

  const interruptColumns = [
    { title: "#", dataIndex: "_idx", width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "组件", dataIndex: "component", key: "component" },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: any, record: Interrupt, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEditInterrupt(index)}
        />
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          步骤名称
        </label>
        <Input
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder="输入步骤名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          负载
        </label>
        {loadOptions.length > 0 ? (
          <Select
            value={step.component}
            onChange={(v) => onChange({ ...step, component: v })}
            options={loadOptions}
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用负载（loads），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          触发按钮
        </label>
        {buttonOptions.length > 0 ? (
          <Select
            value={step.trigger ?? undefined}
            onChange={(v) => onChange({ ...step, trigger: v })}
            options={buttonOptions}
            allowClear
            placeholder="选择触发按钮（可选）"
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用按钮（buttons），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          启动参数
        </label>
        <InputNumber
          value={step.value.begin as number}
          onChange={(v) =>
            onChange({ ...step, value: { ...step.value, begin: v ?? 0 } })
          }
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          停止参数
        </label>
        <InputNumber
          value={step.value.end as number}
          onChange={(v) =>
            onChange({ ...step, value: { ...step.value, end: v ?? 0 } })
          }
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          延迟运行（毫秒）
        </label>
        <InputNumber
          value={step.delay}
          onChange={(v) => onChange({ ...step, delay: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          超时限制（毫秒）
        </label>
        <InputNumber
          value={step.timeout}
          onChange={(v) => onChange({ ...step, timeout: v ?? 600000 })}
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
          checked={!step.disabled}
          onChange={(checked) => onChange({ ...step, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          中断方式
        </label>
        <Table
          dataSource={step.interrupts || []}
          columns={interruptColumns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddInterrupt}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/process-step-editor.tsx
git commit -m "feat(watering/step-editor): dynamic load/button options from GPIO, add trigger button dropdown"
```

---

### Task 6: ProcessInterruptEditor 动态传感器选项

**Files:**
- Modify: `app/watering/components/process-interrupt-editor.tsx`

改动：
1. 删除硬编码 `SENSOR_OPTIONS`
2. 新增 `gpio` prop（`GpioInfo` 类型）
3. 传感器下拉框选项从 `gpio.sensors` 动态生成
4. 空列表时显示 Empty 提示

- [ ] **Step 1: 重写 ProcessInterruptEditor**

```tsx
// app/watering/components/process-interrupt-editor.tsx
"use client";

import { Input, InputNumber, Switch, Select, Empty } from "antd";
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
    value: `sensor_${k}`,
    label: k,
  }));

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
git commit -m "feat(watering/interrupt-editor): dynamic sensor options from device GPIO"
```

---

### Task 7: 验证 — 启动项目并测试

**Files:** 无新建/修改

- [ ] **Step 1: 启动开发服务器**

```bash
pnpm dev
```

- [ ] **Step 2: 在浏览器中验证以下功能点**

访问 `http://localhost:3000/watering/devices/5872424?macAddress=20%3AE7%3AC8%3A59%3A9B%3A28`

1. **保存按钮** — 页面 Header 右侧可见"保存"按钮，编辑器底部也有"保存配置"按钮；修改设备名称后点击保存，刷新页面确认修改持久化
2. **动态负载选项** — 进入步骤编辑 Drawer，"负载"下拉框选项来自设备 GPIO 的 loads 字段（非硬编码 load_0~load_3）
3. **动态传感器选项** — 进入中断编辑 Drawer，"传感器"下拉框选项来自设备 GPIO 的 sensors 字段（非硬编码 sensor_0~sensor_2）
4. **触发按钮下拉框** — 步骤编辑 Drawer 中"触发按钮"下拉框出现在"负载"下方，选项来自设备 GPIO 的 buttons 字段，支持清除选择
5. **空 GPIO fallback** — 如果设备未上报 GPIO，负载/传感器/按钮区域应显示 Empty 提示而非空白/报错

- [ ] **Step 3: 验证完毕后提交**

```bash
# 如无代码变更，标记任务完成即可
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ 需求1（保存按钮）：Task 3 (Header) + Task 4 (底部) 覆盖
   - ✅ 需求2（动态负载/传感器选项）：Task 5 (负载) + Task 6 (传感器) 覆盖
   - ✅ 需求3（触发按钮下拉框）：Task 1 (类型) + Task 5 (UI) 覆盖
   - ✅ GPIO 数据流：Task 2 (hook 提取) → Task 3 (page 传递) → Task 4 (透传) → Task 5/6 (消费)

2. **Placeholder scan:** 无 TBD/TODO/implement later，所有代码完整

3. **Type consistency:**
   - `GpioInfo` 定义在 `use-device-config.ts`，所有引用均通过 `import type { GpioInfo } from "../hooks/use-device-config"`
   - `Step.trigger` 在 Task 1 定义，Task 5 中使用
   - `saveRef` 类型为 `React.MutableRefObject<() => Promise<void>>`，在 page.tsx 和 device-editor.tsx 中一致
