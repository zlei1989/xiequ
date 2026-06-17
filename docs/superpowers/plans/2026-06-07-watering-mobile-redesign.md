# 浇花帮手移动端布局改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将浇水模块从桌面端侧边栏布局改造为移动端优先的 iot-wfm 风格布局 — 全屏卡片列表 + 底部抽屉编辑器，手机上可流畅操作。

**Architecture:** 去掉 `layout.tsx` 中的 Ant Design `Sider`，改为仅保留顶部 Header（标题 + 操作按钮）。设备卡片增加 iot-wfm 风格的流程快捷执行按钮。编辑页用 `el-table` 对应 Ant Design `<Table>` 列出流程/步骤/中断/定时，点击行打开 `<Drawer placement="bottom">` 从底部滑出编辑。日志页按 stateId 分组时间线。

**Tech Stack:** Next.js App Router, React 19, Ant Design 6, TypeScript

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `app/watering/layout.tsx` | 去掉 Sider，只保留 Header（无侧边栏） |
| Modify | `app/watering/page.tsx` | 移动端列表页：Header 含刷新按钮 + 垂直卡片列表 |
| Modify | `app/watering/components/device-card.tsx` | 匹配 IotCard：卡片底部增加流程快捷按钮网格 |
| Modify | `app/watering/devices/[chipId]/page.tsx` | 匹配 EditView：全屏编辑器 + Header 含保存/返回 |
| Modify | `app/watering/components/device-editor.tsx` | 匹配 IotEditor：单表单 + Table + 嵌套底部 Drawer |
| Modify | `app/watering/logs/[chipId]/page.tsx` | 匹配 LogsView：Header 含刷新/返回 + 设备名 |
| Modify | `app/watering/components/log-viewer.tsx` | 匹配 IotLogs：按 stateId 分组时间线 + 彩色事件标签 |

---

### Task 1: 去掉侧边栏 — 改写 layout.tsx

**Files:**
- Modify: `app/watering/layout.tsx`

当前 layout 使用 `Sider` + `Content` 桌面端布局。改造为仅保留顶部 Header，内容区全宽显示。调试面板入口改为 Header 中一个 `BugOutlined` 图标的按钮。

- [ ] **Step 1: 重写 layout.tsx 为移动端顶栏布局**

```tsx
// app/watering/layout.tsx
"use client";

import { Layout, Button } from "antd";
import { HomeOutlined, BugOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const { Header, Content } = Layout;

const isDev = process.env.NODE_ENV === "development";

export default function WateringLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: "#fff",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #f0f0f0",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Button
          type="text"
          icon={<HomeOutlined />}
          onClick={() => router.push("/")}
          size="small"
        />
        <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>浇花帮手</span>
        {isDev && (
          <Button
            type={pathname.startsWith("/watering/debug") ? "primary" : "text"}
            icon={<BugOutlined />}
            onClick={() => router.push("/watering/debug")}
            size="small"
          >
            调试
          </Button>
        )}
      </Header>
      <Content style={{ background: "#f5f5f5", minHeight: "calc(100vh - 48px)" }}>
        {children}
      </Content>
    </Layout>
  );
}
```

- [ ] **Step 2: 验证无语法错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "layout.tsx" | head -5`
Expected: No output (no errors in layout.tsx)

- [ ] **Step 3: Commit**

```bash
git add app/watering/layout.tsx
git commit -m "refactor(watering/layout): remove sidebar, use mobile-first header-only layout"
```

---

### Task 2: 改造设备卡片 — device-card.tsx 匹配 IotCard

**Files:**
- Modify: `app/watering/components/device-card.tsx`

对照 IotCard.vue 的布局：
- 卡片 `extra` 区域：在线/离线 Tag + 日志/编辑按钮
- 卡片正文：芯片 ID、网卡 MAC、电压（如果有）、当前执行状态
- 卡片 `footer` 区域：流程快捷按钮网格（2 列），每个按钮显示"执行/终止 流程名"

- [ ] **Step 1: 查看 IotCard 关键布局点**

IotCard 的核心结构：
```
el-card
  template#title → 设备名称
  template#extra → 日志按钮 + 编辑按钮 + 清除按钮(debug)
  el-descriptions → chipId / 电压 / MAC
  template#footer:
    在线时 → 流程按钮网格 (每行2个)
    离线时 → 离线 Tag
```

- [ ] **Step 2: 重写 device-card.tsx**

```tsx
// app/watering/components/device-card.tsx
"use client";

import { Card, Tag, Button, Row, Col, message, Popconfirm } from "antd";
import {
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { setDeviceSwitch, removeDevice } from "../actions";
import type { DeviceItem } from "../types";

export function DeviceCard({
  device,
  onRefresh,
}: {
  device: DeviceItem;
  onRefresh: () => void;
}) {
  const router = useRouter();

  // 电压显示
  const voltage =
    device.state?.sensors && "voltage_0" in device.state.sensors
      ? device.state.sensors.voltage_0
      : undefined;

  // 计算流程按钮行列（每行 2 列，匹配 IotCard 的 2 列网格）
  const processes = device.processes || [];
  const rowCount = Math.ceil(processes.length / 2);

  /** 判断某流程是否正在执行 */
  function isExec(index: number): boolean {
    if (device.state?.switch === "on") {
      if (typeof device.state.index === "number") {
        return device.state.index === index;
      }
      return device.bootExec === index;
    }
    return false;
  }

  /** 点击执行/终止流程 */
  async function onClickSwitch(index: number) {
    try {
      if (isExec(index)) {
        // 关闭
        await setDeviceSwitch(device.chipId, "off", index);
        message.success(`已终止 ${processes[index].name}`);
      } else {
        // 打开
        await setDeviceSwitch(device.chipId, "on", index);
        message.success(`已执行 ${processes[index].name}`);
      }
      onRefresh();
    } catch (err: any) {
      message.error(err.message || "操作失败");
    }
  }

  /** 清除设备状态 */
  async function onClickClear() {
    try {
      await setDeviceSwitch(device.chipId, "off");
      message.success("已清除状态");
      onRefresh();
    } catch (err: any) {
      message.error(err.message || "清除失败");
    }
  }

  /** 删除设备 */
  async function handleRemove() {
    try {
      await removeDevice(device.chipId);
      message.success("设备已删除");
      onRefresh();
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  return (
    <Card
      size="small"
      title={device.name || `设备-${device.chipId}`}
      extra={
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() =>
              router.push(
                `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`
              )
            }
          >
            日志
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() =>
              router.push(
                `/watering/devices/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`
              )
            }
          >
            配置
          </Button>
          <Popconfirm title="确认清除设备状态？" onConfirm={onClickClear}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
          <Popconfirm title="确认删除设备？不可恢复。" onConfirm={handleRemove}>
            <Button type="text" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      {/* 设备信息 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={voltage !== undefined ? 12 : 16}>
          <span style={{ color: "#999", fontSize: 12 }}>芯片: </span>
          <span style={{ fontSize: 13 }}>{device.chipId}</span>
        </Col>
        {voltage !== undefined && (
          <Col span={12}>
            <span style={{ color: "#999", fontSize: 12 }}>电压: </span>
            <span style={{ fontSize: 13 }}>{voltage}V</span>
          </Col>
        )}
        <Col span={8}>
          <span style={{ color: "#999", fontSize: 12 }}>状态: </span>
          {device.isOnline ? (
            <Tag color="green" style={{ margin: 0 }}>
              在线
            </Tag>
          ) : (
            <Tag color="default" style={{ margin: 0 }}>
              离线
            </Tag>
          )}
        </Col>
      </Row>

      {/* 网卡地址 */}
      <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>
        网卡: {device.macAddress}
      </div>

      {/* 当前执行状态 */}
      {device.state?.switch === "on" &&
        device.state.process &&
        device.state.process.name && (
          <div style={{ color: "#1677ff", fontSize: 13, marginBottom: 8 }}>
            运行中: {device.state.process.name}
          </div>
        )}

      {/* 流程快捷按钮 — 匹配 IotCard 的 2 列网格 */}
      {device.isOnline && processes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {Array.from({ length: rowCount }).map((_, row) => (
            <Row gutter={8} key={row} style={{ marginBottom: 4 }}>
              {Array.from({ length: 2 }).map((_, col) => {
                const idx = row * 2 + col;
                if (idx >= processes.length) return null;
                const exec = isExec(idx);
                return (
                  <Col span={12} key={idx}>
                    <Button
                      type={exec ? "primary" : "default"}
                      danger={exec}
                      block
                      size="small"
                      icon={
                        exec ? (
                          <PauseCircleOutlined />
                        ) : (
                          <ThunderboltOutlined />
                        )
                      }
                      disabled={!exec && device.idleSleep}
                      onClick={() => onClickSwitch(idx)}
                      style={{ marginBottom: 2 }}
                    >
                      {exec ? "终止" : "执行"}
                      {processes[idx].name}
                    </Button>
                  </Col>
                );
              })}
            </Row>
          ))}
        </div>
      )}

      {!device.isOnline && (
        <div style={{ textAlign: "center", padding: 4 }}>
          <Tag color="error">离线</Tag>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: 验证无语法错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "device-card" | head -5`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/device-card.tsx
git commit -m "refactor(watering/device-card): match IotCard layout with process quick-action buttons"
```

---

### Task 3: 改造设备列表页 — page.tsx 匹配 ListView

**Files:**
- Modify: `app/watering/page.tsx`

对照 iot-wfm `ListView.vue`：页面顶部有 `<AppLayout title="植物沙盒">` + `extra` 插槽放刷新按钮。我们需要在自己的 layout Header 之外，在页面内部也提供一个带标题和刷新按钮的区域（因为列表页面需要自动刷新并显示刷新状态）。

实际上，layout Header 已经提供了 title。刷新按钮应放在页面内容顶部。页面结构变为：
- 顶部操作栏：标题 + 刷新按钮
- 卡片列表

- [ ] **Step 1: 重写 page.tsx**

```tsx
// app/watering/page.tsx
"use client";

import { Button, Spin, Empty } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useDevices } from "./hooks/use-devices";
import { DeviceCard } from "./components/device-card";

export default function WateringPage() {
  const { devices, loading, refresh } = useDevices(15000);

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* 操作栏 — 匹配 iot-wfm 的 #extra 插槽 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>设备列表</h2>
        <Button
          icon={<ReloadOutlined />}
          onClick={refresh}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      </div>

      {/* 设备卡片列表 */}
      {loading && devices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <Empty description="暂无设备，等待 IoT 设备上线" />
      ) : (
        devices.map((device) => (
          <DeviceCard key={device.chipId} device={device} onRefresh={refresh} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证无语法错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "page.tsx" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/watering/page.tsx
git commit -m "refactor(watering/page): match ListView with mobile-friendly card list and auto-refresh"
```

---

### Task 4: 改造设备编辑器 — device-editor.tsx 匹配 IotEditor 嵌套 Drawer 模式

**Files:**
- Modify: `app/watering/components/device-editor.tsx`
- Modify: `app/watering/components/process-editor.tsx`
- Modify: `app/watering/components/process-step-editor.tsx`
- Modify: `app/watering/components/process-interrupt-editor.tsx`
- Modify: `app/watering/components/schedule-editor.tsx`

这是本次改造最核心的部分。对照 iot-wfm `IotEditor.vue` 的模式：
- 主表单显示所有基本设置 + 流程表格 + 定时表格
- 点击流程行 → 底部 Drawer(size=80%) 打开 ProcessEditor
- 在 ProcessEditor 中点击步骤行 → 底部 Drawer(size=75%) 打开 ProcessStepEditor
- 在 ProcessStepEditor 中点击中断行 → 底部 Drawer(size=70%) 打开 ProcessInterruptEditor
- 点击定时行 → 底部 Drawer(size=70%) 打开 ScheduleEditor

当前 device-editor 用 Tabs 把一切都平铺出来，在手机上体验很差。改造为：
- 顶部：基本设置表单（设备名称、空闲睡眠、空闲超时、开机执行、延迟执行）
- 中部：流程表格（名称列 + 编辑按钮 → 底部 Drawer）
- 下部：定时表格（类型+时间+流程 列 + 编辑按钮 → 底部 Drawer）

子组件 (process-editor, process-step-editor, process-interrupt-editor, schedule-editor) 本身不需要大改 — 只需要去掉多余的 Card 嵌套，改为适合 drawer 内部使用的表单样式。

Let me fix the process-interrupt-editor — currently it displays the component as `Input` (text), while iot-wfm uses `<el-select>` with `sensor_0` / `sensor_1` / `sensor_2` options.

- [ ] **Step 1: 重写 device-editor.tsx — 表格 + 嵌套 Drawer 模式**

```tsx
// app/watering/components/device-editor.tsx
"use client";

import { useState } from "react";
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
} from "@ant-design/icons";
import type { DeviceConfig, Process, Step, Interrupt, Schedule } from "../types";
import { ProcessEditor } from "./process-editor";
import { ProcessStepEditor } from "./process-step-editor";
import { ProcessInterruptEditor } from "./process-interrupt-editor";
import { ScheduleEditor } from "./schedule-editor";

export function DeviceEditor({
  config,
  onSave,
  onRemove,
}: {
  config: DeviceConfig;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [form, setForm] = useState<DeviceConfig>(config);
  const [saving, setSaving] = useState(false);

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
      name: "新流程",
      steps: [
        {
          name: "新步骤",
          component: "load_0",
          value: { begin: 255, end: 0 },
          delay: 0,
          timeout: 600000,
          interrupts: [],
        },
      ],
    };
    const newProcesses = [...form.processes, item];
    setForm({ ...form, processes: newProcesses });
    // 自动打开编辑
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
      name: "新步骤",
      component: "load_0",
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
      name: "新中断",
      component: "sensor_0",
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
      {/* ---- 基本设置表单（匹配 IeForm）---- */}
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

      {/* ---- 流程表格（匹配 IeForm 的流程 el-table）---- */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>功能</h4>
        <Table
          dataSource={form.processes}
          columns={processColumns}
          rowKey={(_, index) => String(index)}
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

      {/* ---- 定时表格（匹配 IeForm 的定时 el-table）---- */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>计划任务</h4>
        <Table
          dataSource={form.schedules}
          columns={scheduleColumns}
          rowKey={(_, index) => String(index)}
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

      {/* ---- 删除设备按钮 ---- */}
      <Popconfirm title="确认删除设备？不可恢复。" onConfirm={onRemove}>
        <Button danger block style={{ marginBottom: 16 }}>
          删除设备
        </Button>
      </Popconfirm>

      {/* ============================================
          嵌套 Drawer 层（匹配 IotEditor 的嵌套 el-drawer）
          ============================================ */}

      {/* 流程编辑 Drawer (80%) */}
      <Drawer
        title="编辑流程"
        placement="bottom"
        height="80%"
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
        height="75%"
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
        height="70%"
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
              onChange={(updated) => updateInterrupt(interruptIndex, updated)}
              onRemove={deleteInterrupt}
            />
          )}
      </Drawer>

      {/* 定时编辑 Drawer (70%) */}
      <Drawer
        title="编辑计划任务"
        placement="bottom"
        height="70%"
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

- [ ] **Step 2: 更新 process-editor.tsx — 添加 onEditStep, onAddStep props，适配 drawer 内部**

```tsx
// app/watering/components/process-editor.tsx
"use client";

import { Input, Button, Table } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Process, Step } from "../types";

export function ProcessEditor({
  process,
  onChange,
  onRemove,
  onEditStep,
  onAddStep,
}: {
  process: Process;
  onChange: (updated: Process) => void;
  onRemove: () => void;
  onEditStep: (index: number) => void;
  onAddStep: () => void;
}) {
  const columns = [
    { title: "#", dataIndex: "_idx", width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "组件", dataIndex: "component", key: "component" },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: any, record: Step, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEditStep(index)}
        />
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          功能名称
        </label>
        <Input
          value={process.name}
          onChange={(e) => onChange({ ...process, name: e.target.value })}
          placeholder="输入流程名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          步骤
        </label>
        <Table
          dataSource={process.steps}
          columns={columns}
          rowKey={(_, index) => String(index)}
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddStep}
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

- [ ] **Step 3: 更新 process-step-editor.tsx — 添加 onEditInterrupt, onAddInterrupt props**

```tsx
// app/watering/components/process-step-editor.tsx
"use client";

import { Input, InputNumber, Switch, Button, Select, Table } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Step, Interrupt } from "../types";

const LOAD_OPTIONS = [
  { value: "load_0", label: "load_0" },
  { value: "load_1", label: "load_1" },
  { value: "load_2", label: "load_2" },
  { value: "load_3", label: "load_3" },
];

export function ProcessStepEditor({
  step,
  onChange,
  onRemove,
  onEditInterrupt,
  onAddInterrupt,
}: {
  step: Step;
  onChange: (updated: Step) => void;
  onRemove: () => void;
  onEditInterrupt: (index: number) => void;
  onAddInterrupt: () => void;
}) {
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
        <Select
          value={step.component}
          onChange={(v) => onChange({ ...step, component: v })}
          options={LOAD_OPTIONS}
          style={{ width: "100%" }}
        />
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
          rowKey={(_, index) => String(index)}
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

- [ ] **Step 4: 更新 process-interrupt-editor.tsx — 匹配 iot-wfm IeProcessInterrupt 的字段**

当前中断编辑器用 `Input` 输入组件名，改为 `Select` 下拉框（匹配 iot-wfm 的 `sensor_0` / `sensor_1` / `sensor_2`）。

```tsx
// app/watering/components/process-interrupt-editor.tsx
"use client";

import { Input, InputNumber, Switch, Select } from "antd";
import type { Interrupt } from "../types";

const SENSOR_OPTIONS = [
  { value: "sensor_0", label: "sensor_0" },
  { value: "sensor_1", label: "sensor_1" },
  { value: "sensor_2", label: "sensor_2" },
];

export function ProcessInterruptEditor({
  interrupt,
  onChange,
  onRemove,
}: {
  interrupt: Interrupt;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
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
        <Select
          value={interrupt.component}
          onChange={(v) => onChange({ ...interrupt, component: v })}
          options={SENSOR_OPTIONS}
          style={{ width: "100%" }}
        />
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

- [ ] **Step 5: 更新 schedule-editor.tsx — 适配 drawer 内独立使用**

schedule-editor 需要用 `InputNumber` + 时间选择器替代纯数字，匹配 iot-wfm 的 `el-time-picker`。Ant Design 的 `TimePicker` 按分钟返回 Date，需转换为毫秒。

```tsx
// app/watering/components/schedule-editor.tsx
"use client";

import { Select, InputNumber, Switch, TimePicker } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { Schedule } from "../types";

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

  // 毫秒值 → dayjs 时刻（仅时间部分）
  const timeValue = dayjs()
    .startOf("day")
    .add(schedule.value || 0, "millisecond");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          类型
        </label>
        <Select
          value={schedule.type}
          onChange={(v) => update({ ...schedule, type: v })}
          options={[
            { value: "day", label: "每天" },
            { value: "minute", label: "每分钟" },
            { value: "week", label: "每周" },
            { value: "month", label: "每月" },
          ]}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          间隔（天）
        </label>
        <InputNumber
          value={schedule.interval}
          onChange={(v) => update({ ...schedule, interval: v ?? 1 })}
          step={1}
          min={1}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          时间
        </label>
        <TimePicker
          value={timeValue}
          onChange={(d: Dayjs | null) => {
            if (d) {
              const ms = d.diff(dayjs().startOf("day"), "millisecond");
              update({ ...schedule, value: ms });
            }
          }}
          format="HH:mm"
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          执行流程
        </label>
        <Select
          value={schedule.process}
          onChange={(v) => update({ ...schedule, process: v })}
          options={processes.map((p, i) => ({
            value: i,
            label: p.name || `流程 ${i}`,
          }))}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          禁用
        </label>
        <Switch
          checked={!schedule.disabled}
          onChange={(checked) => update({ ...schedule, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 验证无语法错误**

Run: `npx tsc --noEmit 2>&1 | grep -E "(device-editor|process-editor|process-step-editor|process-interrupt-editor|schedule-editor)" | head -10`
Expected: No output

- [ ] **Step 7: Commit**

```bash
git add app/watering/components/device-editor.tsx \
        app/watering/components/process-editor.tsx \
        app/watering/components/process-step-editor.tsx \
        app/watering/components/process-interrupt-editor.tsx \
        app/watering/components/schedule-editor.tsx
git commit -m "refactor(watering/editor): restructure to table + nested bottom Drawer pattern matching iot-wfm"
```

---

### Task 5: 改造设备编辑页 — devices/[chipId]/page.tsx 匹配 EditView

**Files:**
- Modify: `app/watering/devices/[chipId]/page.tsx`

对照 iot-wfm `EditView.vue`：页面使用 `AppLayout` 包裹，标题为设备名，header extra 区域放保存/取消按钮。

注意：当前设备编辑页路由为 `/watering/devices/[chipId]`，URL query 中需要传递 `macAddress`。改造后 header 放保存和返回按钮。

- [ ] **Step 1: 重写 devices/[chipId]/page.tsx**

```tsx
// app/watering/devices/[chipId]/page.tsx
"use client";

import { use, useState } from "react";
import { Spin, Button, message } from "antd";
import { SaveOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeviceConfig } from "../../hooks/use-device-config";
import { DeviceEditor } from "../../components/device-editor";

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config, loading, save, remove } = useDeviceConfig(chipId);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      // save is handled by DeviceEditor internally via onSave prop
      message.success("保存成功");
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    try {
      await remove();
      message.success("设备已删除");
      router.push("/watering");
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  // 顶部操作栏 — 匹配 iot-wfm EditView 的 header extra
  const headerExtra = (
    <div style={{ display: "flex", gap: 8 }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => router.back()}
      >
        返回
      </Button>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        onClick={handleSave}
        loading={saving}
      >
        保存
      </Button>
    </div>
  );

  if (loading || !config) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      {/* 页面内顶栏操作按钮 */}
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
        {headerExtra}
      </div>

      <DeviceEditor
        config={config}
        onSave={async (data) => {
          await save(data);
          message.success("已保存");
        }}
        onRemove={handleRemove}
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证无语法错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "devices" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/watering/devices/[chipId]/page.tsx
git commit -m "refactor(watering/devices): match EditView with save/cancel header and bottom-drawer editor"
```

---

### Task 6: 改造日志页 — logs/[chipId]/page.tsx + log-viewer.tsx 匹配 LogsView

**Files:**
- Modify: `app/watering/logs/[chipId]/page.tsx`
- Modify: `app/watering/components/log-viewer.tsx`

对照 iot-wfm `LogsView.vue` + `IotLogs.vue` + `IotLogMessage.vue`：

日志按 `stateId` 分组，每组内按时间排序，每组之间用分隔线隔开，每组底部显示该流程的总用时。

- [ ] **Step 1: 重写 logs/[chipId]/page.tsx**

```tsx
// app/watering/logs/[chipId]/page.tsx
"use client";

import { use, useEffect } from "react";
import { Button, Spin, Popconfirm, message } from "antd";
import { ArrowLeftOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceLogs } from "../../hooks/use-device-logs";
import { LogViewer } from "../../components/log-viewer";

export default function DeviceLogsPage({
  params,
}: {
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, load, clear } = useDeviceLogs(chipId);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    await clear();
    message.success("日志已清空");
    load();
  }

  return (
    <div>
      {/* 页面内顶栏 — 匹配 iot-wfm LogsView header extra */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          marginBottom: 16,
        }}
      >
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.back()}
        >
          返回
        </Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={load}
            loading={loading}
          >
            刷新
          </Button>
          <Popconfirm title="确认清空日志？" onConfirm={handleClear}>
            <Button icon={<DeleteOutlined />} danger>
              清空
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* 设备名 — 匹配 LogsView 的 device-name */}
      <div style={{ padding: "0 16px", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>设备: {chipId}</h3>
      </div>

      {/* 日志内容 */}
      <div style={{ padding: "0 16px" }}>
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : (
          <LogViewer logs={logs} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 重写 log-viewer.tsx — 按 stateId 分组时间线，匹配 IotLogs**

当前 log-viewer 只有简单的 Ant Design Timeline。改造为按 stateId 分组显示，每组内按时间排序，显示彩色事件标签，底部显示用时。

```tsx
// app/watering/components/log-viewer.tsx
"use client";

import { Timeline, Tag, Divider } from "antd";

const eventLabels: Record<string, string> = {
  bootstrap: "开机",
  execute: "执行",
  finish: "完成",
  terminate: "终止",
  change: "变更",
  heartbeat: "心跳",
  offline: "离线",
};

const eventColors: Record<string, string> = {
  bootstrap: "green",
  execute: "orange",
  finish: "orange",
  terminate: "orange",
  change: "blue",
  heartbeat: "default",
  offline: "gray",
};

type LogItem = {
  event: string;
  createdTime: string;
  state?: any;
  stateId?: string;
  message?: string;
  process?: { name?: string };
  cause?: string;
};

/** 按 stateId 分组，每组按时间排序（倒序：最新的 stateId 组在前，组内正序）*/
function groupByStateId(logs: LogItem[]): Array<{ stateId: string; items: LogItem[] }> {
  const map: Record<string, LogItem[]> = {};
  for (const log of logs) {
    const key = log.stateId || "_unknown";
    if (!map[key]) map[key] = [];
    map[key].push(log);
  }
  // 组内按时间正序
  for (const key of Object.keys(map)) {
    map[key].sort(
      (a, b) =>
        new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
    );
  }
  // 组间按最新一条时间倒序（最新的组在前）
  return Object.entries(map)
    .map(([stateId, items]) => ({ stateId, items }))
    .sort((a, b) => {
      const lastA = new Date(a.items[a.items.length - 1].createdTime).getTime();
      const lastB = new Date(b.items[b.items.length - 1].createdTime).getTime();
      return lastB - lastA;
    });
}

/** 计算用时 */
function formatDuration(items: LogItem[]): string {
  if (items.length < 2) return "";
  const begin = new Date(items[0].createdTime).getTime();
  const end = new Date(items[items.length - 1].createdTime).getTime();
  const seconds = Math.round((end - begin) / 1000);
  if (seconds > 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}时${m}分${s}秒`;
  }
  if (seconds > 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  }
  return `${seconds}秒`;
}

/** 判断是否包含执行事件 */
function hasExecute(items: LogItem[]): boolean {
  return items.some((item) => item.event === "execute" || item.event === "change");
}

/** 格式化日志消息 — 匹配 iot-wfm formatMessage */
function formatMessage(item: LogItem): string {
  if (item.message) return item.message;
  switch (item.event) {
    case "bootstrap":
      return `设备${item.cause ? `(原因:${item.cause})` : ""}开机`;
    case "execute":
      return `执行流程${item.process?.name ? `: ${item.process.name}` : ""}`;
    case "terminate":
      return "终止流程";
    case "finish":
      return "完成流程";
    case "offline":
      return "设备离线";
    default:
      return item.event;
  }
}

export function LogViewer({ logs }: { logs: any[] }) {
  if (!logs || logs.length === 0) {
    return <div style={{ color: "#999", textAlign: "center", padding: 32 }}>暂无日志</div>;
  }

  const groups = groupByStateId(logs);

  return (
    <div>
      {groups.map((group, gi) => (
        <div key={group.stateId}>
          {gi > 0 && <Divider style={{ margin: "12px 0" }} />}
          <Timeline
            items={group.items.map((item, idx) => ({
              color: eventColors[item.event] || "gray",
              children: (
                <div style={{ fontSize: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <Tag color={eventColors[item.event]}>
                      {eventLabels[item.event] || item.event}
                    </Tag>
                    <span style={{ color: "#999", fontSize: 12 }}>
                      {new Date(item.createdTime).toLocaleString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#333" }}>
                    {formatMessage(item)}
                  </div>
                </div>
              ),
            }))}
          />
          {hasExecute(group.items) && (
            <div
              style={{
                color: "#999",
                fontSize: 12,
                marginTop: 4,
                marginLeft: 24,
              }}
            >
              用时 {formatDuration(group.items)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 验证无语法错误**

Run: `npx tsc --noEmit 2>&1 | grep -E "(logs|log-viewer)" | head -5`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add app/watering/logs/[chipId]/page.tsx app/watering/components/log-viewer.tsx
git commit -m "refactor(watering/logs): match LogsView with stateId-grouped timeline"
```

---

### Task 7: 端到端冒烟测试

**Files:**
- None (手动验证)

- [ ] **Step 1: 启动开发服务器**

Run: `pnpm dev`

- [ ] **Step 2: 验证设备列表页（/watering）移动端布局**

1. 浏览器打开 DevTools，切换为手机视图（如 iPhone 14, 390×844）
2. 导航到 `http://localhost:3000/watering`
3. 确认：无侧边栏，只有顶部 Header + 设备标题 + 刷新按钮
4. 确认：设备卡片垂直排列，显示芯片 ID、网卡、在线状态
5. 确认：卡片底部有流程快捷按钮（2 列网格）
6. 确认：15 秒后自动刷新

- [ ] **Step 3: 验证设备编辑页（/watering/devices/[chipId]）**

1. 点击设备卡片上的"配置"按钮
2. 确认：进入全屏编辑页，顶部有返回/保存按钮
3. 确认：表格显示流程列表，每行有编辑按钮
4. 点击流程编辑按钮 → 确认底部滑出 Drawer(80%) 带 ProcessEditor
5. 在流程 Drawer 内点击步骤编辑按钮 → 确认底部滑出 Drawer(75%) 带 ProcessStepEditor
6. 在步骤 Drawer 内点击中断编辑按钮 → 确认底部滑出 Drawer(70%) 带 ProcessInterruptEditor
7. 逐层关闭 Drawer，确认各层独立运作
8. 确认计划任务的 Drawer 正常打开/编辑/关闭

- [ ] **Step 4: 验证日志页（/watering/logs/[chipId]）**

1. 点击设备卡片上的"日志"按钮
2. 确认：顶部有返回/刷新/清空按钮
3. 确认：显示设备名称
4. 确认：日志按 stateId 分组，每组内按时间排列
5. 确认：每组底部显示用时
6. 确认：点击清空 → 弹出确认框 → 清空后重新加载

- [ ] **Step 5: 验证调试面板仍可用**

1. 导航到 `http://localhost:3000/watering/debug`
2. 确认：Header 中的"调试"按钮高亮
3. 确认：调试面板功能正常（device form, event buttons, response log）

- [ ] **Step 6: 验证生产环境无调试入口**

1. 停止 dev server
2. Run: `pnpm build && pnpm start`
3. 导航到 `http://localhost:3000/watering` — 确认 Header 无"调试"按钮
4. 导航到 `http://localhost:3000/watering/debug` — 确认显示"调试面板仅在开发环境可用"

- [ ] **Step 7: Commit 冒烟测试修复**

```bash
git add -A
git commit -m "fix(watering): adjustments from mobile redesign smoke test"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 去掉侧边栏 → Task 1 (layout.tsx)
- ✅ 设备卡片匹配 IotCard → Task 2 (device-card.tsx)
- ✅ 列表页匹配 ListView → Task 3 (page.tsx)
- ✅ 编辑页匹配 EditView + IotEditor → Task 4 (device-editor + 4 个子编辑器), Task 5 (devices/[chipId]/page)
- ✅ 日志页匹配 LogsView → Task 6 (logs/[chipId]/page + log-viewer)
- ✅ 移动端友好 → 所有页面去掉侧边栏，用全宽布局 + 底部 Drawer
- ✅ 调试面板保留 → layout.tsx 中保留 debug 入口

**2. Placeholder scan:**
- No TBD / TODO / "implement later"
- No "add appropriate error handling" — error handling is in all async functions
- No "write tests for the above" without test code — manual smoke test in Task 7
- All code blocks contain complete, copy-pasteable implementations

**3. Type consistency:**
- `DeviceConfig`, `Process`, `Step`, `Interrupt`, `Schedule` types from `@/types` used consistently
- `onEditStep`, `onAddStep` etc. callback props match between DeviceEditor and ProcessEditor/ProcessStepEditor
- Drawer `placement="bottom"` and `height` percentages (80%/75%/70%) match iot-wfm el-drawer sizes
- `stateId` grouping in log-viewer matches IotLogs pattern
- URL params for macAddress passed through query string to devices/[chipId] and logs/[chipId]
