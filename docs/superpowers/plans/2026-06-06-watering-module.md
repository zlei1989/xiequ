# 浇花模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现浇花模块的全部功能——设备列表（自动刷新）、设备开关、配置编辑（流程+计划任务）、运行日志查看/清空、IoT 设备状态推送/拉取 API。

**Architecture:** Next.js Server Actions 作为数据层，hooks 封装客户端状态管理，SQLite 存储设备配置和日志。IoT 设备通过 API Routes 推送/拉取状态。

**Tech Stack:** Next.js 16 App Router, antd 6, better-sqlite3, Server Actions, API Routes

**前置条件:** Plan 1（项目脚手架）已完成

---

### Task 1: 设备列表页

**Files:**
- Create: `app/watering/actions.ts`
- Modify: `app/watering/hooks/use-devices.ts`
- Create: `app/watering/components/device-card.tsx`
- Modify: `app/watering/page.tsx`

- [ ] **Step 1: 创建 Server Actions**

Create `app/watering/actions.ts`:

```ts
"use server";

import { getAllDevices } from "./services/db";

export async function getDevices() {
  return getAllDevices();
}
```

- [ ] **Step 2: 实现 use-devices hook**

Replace `app/watering/hooks/use-devices.ts`:

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceItem } from "../types";
import { getDevices } from "../actions";

export function useDevices(intervalMs = 15000) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDevices();
      setDevices(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { devices, loading, refresh };
}
```

- [ ] **Step 3: 创建设备卡片组件**

Create `app/watering/components/device-card.tsx`:

```tsx
"use client";

import { Card, Tag, Switch, Button, Space } from "antd";
import { EditOutlined, FileTextOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import type { DeviceItem } from "../types";

export function DeviceCard({ device }: { device: DeviceItem }) {
  const router = useRouter();

  return (
    <Card
      title={device.name}
      extra={
        device.isOnline ? (
          <Tag color="green">在线</Tag>
        ) : (
          <Tag color="default">离线</Tag>
        )
      }
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#666", fontSize: 13 }}>芯片: {device.chipId}</div>
          {device.state?.switch === "on" && (
            <div style={{ color: "#1890ff", fontSize: 13, marginTop: 4 }}>
              运行中: {device.state.process?.name || `流程 #${device.state.index}`}
            </div>
          )}
          {device.state?.message && (
            <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>
              {device.state.message}
            </div>
          )}
        </div>
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => router.push(`/watering/devices/${device.chipId}`)}
          >
            编辑
          </Button>
          <Button
            icon={<FileTextOutlined />}
            size="small"
            onClick={() => router.push(`/watering/logs/${device.chipId}`)}
          >
            日志
          </Button>
        </Space>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: 实现设备列表页**

Replace `app/watering/page.tsx`:

```tsx
"use client";

import { Button, Empty, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useDevices } from "./hooks/use-devices";
import { DeviceCard } from "./components/device-card";

export default function WateringPage() {
  const { devices, loading, refresh } = useDevices();

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
          刷新
        </Button>
      </div>
      {loading && devices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <Empty description="暂无设备，等待 IoT 设备上线" />
      ) : (
        devices.map((device) => (
          <DeviceCard key={device.chipId} device={device} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: 启动 dev 验证**

Run: `pnpm dev`

Expected: /watering 页面显示空状态"暂无设备"，无报错。

- [ ] **Step 6: Commit**

```bash
git add app/watering/actions.ts app/watering/hooks/use-devices.ts app/watering/components/device-card.tsx app/watering/page.tsx
git commit -m "feat: 实现浇花模块设备列表页"
```

---

### Task 2: IoT 设备 API — 状态推送与拉取

**Files:**
- Create: `app/api/iot-wfm/push-state/route.ts`
- Create: `app/api/iot-wfm/get-state/route.ts`
- Modify: `app/watering/services/db.ts`
- Modify: `app/watering/services/iot-protocol.ts`

- [ ] **Step 1: 补充 db.ts 中的状态读写方法**

在 `app/watering/services/db.ts` 末尾追加：

```ts
/**
 * 获取设备状态
 */
export function getDeviceState(chipId: string): DeviceState | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_device_state WHERE chipId = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chipId,
    stateId: row.stateId,
    switch: row.switch,
    buttons: row.buttons ? JSON.parse(row.buttons) : undefined,
    sensors: row.sensors ? JSON.parse(row.sensors) : undefined,
    loads: row.loads ? JSON.parse(row.loads) : undefined,
    index: row.currentIndex ?? undefined,
    process: row.currentProcess ? JSON.parse(row.currentProcess) : undefined,
    message: row.message ?? undefined,
    lastWriteTime: row.lastWriteTime,
  };
}

/**
 * 保存设备状态（upsert）
 */
export function saveDeviceState(state: DeviceState) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_device_state (chipId, stateId, switch, buttons, sensors, loads, currentIndex, currentProcess, message, lastTickTime, lastWriteTime)
    VALUES (@chipId, @stateId, @switch, @buttons, @sensors, @loads, @currentIndex, @currentProcess, @message, @lastTickTime, @lastWriteTime)
    ON CONFLICT(chipId) DO UPDATE SET
      stateId=@stateId, switch=@switch, buttons=@buttons, sensors=@sensors, loads=@loads,
      currentIndex=@currentIndex, currentProcess=@currentProcess, message=@message,
      lastTickTime=@lastTickTime, lastWriteTime=@lastWriteTime
  `).run({
    chipId: state.chipId,
    stateId: state.stateId,
    switch: state.switch,
    buttons: state.buttons ? JSON.stringify(state.buttons) : null,
    sensors: state.sensors ? JSON.stringify(state.sensors) : null,
    loads: state.loads ? JSON.stringify(state.loads) : null,
    currentIndex: state.index ?? null,
    currentProcess: state.process ? JSON.stringify(state.process) : null,
    message: state.message ?? null,
    lastTickTime: Date.now(),
    lastWriteTime: state.lastWriteTime,
  });
}

/**
 * 更新心跳时间
 */
export function updateTick(chipId: string) {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT 1 FROM watering_device_state WHERE chipId = ?").get(chipId);
  if (existing) {
    db.prepare("UPDATE watering_device_state SET lastTickTime = ? WHERE chipId = ?").run(now, chipId);
  }
}
```

注意：需要在文件顶部 import 补充 `DeviceState`：

```ts
import type { DeviceConfig, DeviceState, DeviceItem } from "../types";
```

- [ ] **Step 2: 实现 IoT 状态推送 API**

Create `app/api/iot-wfm/push-state/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";
import type { DeviceConfig, DeviceState } from "@/app/watering/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const event = searchParams.get("event") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  updateTick(chipId);

  // 解析 GPIO 状态
  const gpioState: Record<string, Record<string, number>> = { buttons: {}, sensors: {}, loads: {} };
  searchParams.forEach((value, key) => {
    const match = key.match(/^(button|sensor|load):(.+)$/);
    if (match) {
      const category = match[1] === "button" ? "buttons" : match[1] === "sensor" ? "sensors" : "loads";
      gpioState[category][match[2]] = parseInt(value) || 0;
    }
  });

  // 处理事件
  switch (event) {
    case "bootstrap": {
      // 首次上线，创建默认配置（如不存在）
      let config = getDeviceConfig(chipId);
      if (!config) {
        config = {
          chipId,
          name: `IOT-${chipId}`,
          macAddress,
          processes: [],
          idleSleep: false,
          idleTimeout: 30000,
          bootExec: -1,
          execDelay: 0,
          schedules: [],
          createdTime: new Date().toISOString(),
          lastWriteTime: new Date().toISOString(),
        };
        saveDeviceConfig(config);
      }

      let state = getDeviceState(chipId);
      if (!state) {
        state = {
          chipId,
          stateId: newId(),
          switch: "off",
          lastWriteTime: new Date().toISOString(),
        };
      }
      // 合并 GPIO 状态
      Object.assign(state, {
        buttons: gpioState.buttons,
        sensors: gpioState.sensors,
        loads: gpioState.loads,
        stateId: newId(),
        lastWriteTime: new Date().toISOString(),
      });
      saveDeviceState(state);

      // 记录日志
      writeDeviceLog(chipId, "bootstrap", { macAddress, cause: searchParams.get("cause") || "" });
      if (state.switch === "on" && state.process) {
        writeDeviceLog(chipId, "execute", { stateId: state.stateId, index: state.index });
      }
      break;
    }
    case "finish": {
      const state = getDeviceState(chipId);
      if (state && state.switch !== "off") {
        state.switch = "off";
        state.index = undefined;
        state.process = undefined;
        state.message = undefined;
        state.stateId = newId();
        state.lastWriteTime = new Date().toISOString();
        saveDeviceState(state);
      }
      writeDeviceLog(chipId, "finish", { macAddress });
      break;
    }
    default: {
      // 普通状态上报
      writeDeviceLog(chipId, event || "heartbeat", {
        macAddress,
        buttons: gpioState.buttons,
        sensors: gpioState.sensors,
        loads: gpioState.loads,
      });
      break;
    }
  }

  return NextResponse.json({ data: undefined });
}
```

- [ ] **Step 3: 实现 IoT 状态拉取 API**

Create `app/api/iot-wfm/get-state/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceState, updateTick } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const clientStateId = searchParams.get("stateId") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  updateTick(chipId);

  // 读取当前状态
  const state = getDeviceState(chipId);

  // 比较是否有变化
  const changed = !state || clientStateId !== state.stateId;

  return NextResponse.json({
    data: {
      ...(changed && state ? state : { stateId: state?.stateId }),
      changed,
    },
  });
}
```

- [ ] **Step 4: 手动测试 API**

Run: `pnpm dev`

测试推送：
```bash
curl "http://localhost:3000/api/iot-wfm/push-state?chipId=12345&macAddress=AA:BB:CC:DD:EE:FF&event=bootstrap"
```

测试拉取：
```bash
curl "http://localhost:3000/api/iot-wfm/get-state?chipId=12345&macAddress=AA:BB:CC:DD:EE:FF"
```

Expected: 推送后设备列表出现设备，拉取返回设备状态。

- [ ] **Step 5: Commit**

```bash
git add app/api/ app/watering/services/db.ts app/watering/services/iot-protocol.ts
git commit -m "feat: 实现 IoT 设备状态推送/拉取 API"
```

---

### Task 3: 设备开关控制

**Files:**
- Create: `app/watering/actions/set-state.ts`
- Modify: `app/watering/actions.ts`
- Modify: `app/watering/components/device-card.tsx`
- Modify: `app/watering/hooks/use-devices.ts`

- [ ] **Step 1: 创建 set-state Server Action**

Create `app/watering/actions/set-state.ts`:

```ts
"use server";

import { getDeviceConfig, getDeviceState, saveDeviceState } from "../services/db";
import { newId } from "@/lib/utils";

export async function setDeviceSwitch(
  chipId: string,
  switchState: "on" | "off",
  processIndex?: number
) {
  const config = getDeviceConfig(chipId);
  if (!config) throw new Error("设备不存在");

  const state = getDeviceState(chipId);
  if (!state) throw new Error("设备状态不存在");

  if (switchState === "on") {
    const processIdx = processIndex ?? 0;
    if (processIdx >= config.processes.length) {
      throw new Error("流程索引越界");
    }
    state.switch = "on";
    state.index = processIdx;
    state.process = config.processes[processIdx];
    state.message = undefined;
  } else {
    state.switch = "off";
    state.index = undefined;
    state.process = undefined;
    state.message = undefined;
  }

  state.stateId = newId();
  state.lastWriteTime = new Date().toISOString();
  saveDeviceState(state);

  return { success: true };
}
```

- [ ] **Step 2: 在 actions.ts 中导出**

在 `app/watering/actions.ts` 末尾追加：

```ts
export { setDeviceSwitch } from "./actions/set-state";
```

- [ ] **Step 3: 更新 DeviceCard 添加开关**

Replace `app/watering/components/device-card.tsx`:

```tsx
"use client";

import { Card, Tag, Switch, Button, Space, message } from "antd";
import { EditOutlined, FileTextOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { setDeviceSwitch } from "../actions";
import type { DeviceItem } from "../types";

export function DeviceCard({ device }: { device: DeviceItem }) {
  const router = useRouter();

  async function onSwitchChange(checked: boolean) {
    try {
      await setDeviceSwitch(device.chipId, checked ? "on" : "off");
      message.success(checked ? "已开启" : "已关闭");
    } catch (err: any) {
      message.error(err.message || "操作失败");
    }
  }

  return (
    <Card
      title={device.name}
      extra={
        device.isOnline ? (
          <Tag color="green">在线</Tag>
        ) : (
          <Tag color="default">离线</Tag>
        )
      }
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#666", fontSize: 13 }}>芯片: {device.chipId}</div>
          {device.state?.switch === "on" && (
            <div style={{ color: "#1890ff", fontSize: 13, marginTop: 4 }}>
              运行中: {device.state.process?.name || `流程 #${device.state.index}`}
            </div>
          )}
          {device.state?.message && (
            <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>
              {device.state.message}
            </div>
          )}
        </div>
        <Space align="center">
          <Switch
            checked={device.state?.switch === "on"}
            onChange={onSwitchChange}
            checkedChildren="开"
            unCheckedChildren="关"
          />
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => router.push(`/watering/devices/${device.chipId}`)}
          >
            编辑
          </Button>
          <Button
            icon={<FileTextOutlined />}
            size="small"
            onClick={() => router.push(`/watering/logs/${device.chipId}`)}
          >
            日志
          </Button>
        </Space>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: 验证设备开关功能**

Run: `pnpm dev`

1. 先通过 API 创建设备：`curl "http://localhost:3000/api/iot-wfm/push-state?chipId=12345&macAddress=AA:BB:CC:DD:EE:FF&event=bootstrap"`
2. 打开 /watering 页面
3. 切换设备开关

Expected: 开关切换成功，15 秒自动刷新后状态一致。

- [ ] **Step 5: Commit**

```bash
git add app/watering/actions/ app/watering/components/device-card.tsx app/watering/actions.ts
git commit -m "feat: 实现设备开关控制"
```

---

### Task 4: 设备配置编辑页

**Files:**
- Create: `app/watering/actions/set-config.ts`
- Create: `app/watering/actions/delete-device.ts`
- Modify: `app/watering/actions.ts`
- Modify: `app/watering/hooks/use-device-config.ts`
- Create: `app/watering/components/device-editor.tsx`
- Create: `app/watering/components/process-editor.tsx`
- Create: `app/watering/components/process-step-editor.tsx`
- Create: `app/watering/components/process-interrupt-editor.tsx`
- Create: `app/watering/components/schedule-editor.tsx`
- Modify: `app/watering/devices/[chipId]/page.tsx`

- [ ] **Step 1: 创建 set-config Server Action**

Create `app/watering/actions/set-config.ts`:

```ts
"use server";

import { getDeviceConfig, saveDeviceConfig } from "../services/db";
import { revalidatePath } from "next/cache";
import type { DeviceConfig } from "../types";

export async function updateDeviceConfig(chipId: string, updates: Partial<DeviceConfig>) {
  const config = getDeviceConfig(chipId);
  if (!config) throw new Error("设备不存在");

  const updated: DeviceConfig = {
    ...config,
    ...updates,
    chipId: config.chipId, // 不允许修改 chipId
    lastWriteTime: new Date().toISOString(),
  };
  saveDeviceConfig(updated);
  revalidatePath("/watering");
  return { success: true };
}
```

- [ ] **Step 2: 创建 delete-device Server Action**

Create `app/watering/actions/delete-device.ts`:

```ts
"use server";

import { deleteDevice } from "../services/db";
import { revalidatePath } from "next/cache";

export async function removeDevice(chipId: string) {
  deleteDevice(chipId);
  revalidatePath("/watering");
  return { success: true };
}
```

- [ ] **Step 3: 在 actions.ts 中导出**

在 `app/watering/actions.ts` 末尾追加：

```ts
export { updateDeviceConfig } from "./actions/set-config";
export { removeDevice } from "./actions/delete-device";
```

- [ ] **Step 4: 实现 use-device-config hook**

Replace `app/watering/hooks/use-device-config.ts`:

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceConfig } from "../types";
import { getDevices } from "../actions";
import { updateDeviceConfig } from "../actions/set-config";
import { removeDevice } from "../actions/delete-device";

export function useDeviceConfig(chipId: string) {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const devices = await getDevices();
      const found = devices.find((d) => d.chipId === chipId);
      if (found) {
        // DeviceItem 中 processes/schedules 已是对象，直接使用
        setConfig(found as unknown as DeviceConfig);
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

  return { config, loading, load, save, remove };
}
```

- [ ] **Step 5: 创建编辑器组件**

Create `app/watering/components/process-interrupt-editor.tsx`:

```tsx
"use client";

import { Input, InputNumber, Switch, Button, Space, Card } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { Interrupt } from "../types";

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
    <Card size="small" style={{ marginBottom: 8 }}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Input
            placeholder="中断名称"
            value={interrupt.name}
            onChange={(e) => onChange({ ...interrupt, name: e.target.value })}
            style={{ width: 150 }}
          />
          <Input
            placeholder="传感器组件"
            value={interrupt.component}
            onChange={(e) => onChange({ ...interrupt, component: e.target.value })}
            style={{ width: 150 }}
          />
          <InputNumber
            placeholder="触发状态"
            value={typeof interrupt.state === "number" ? interrupt.state : undefined}
            onChange={(v) => onChange({ ...interrupt, state: v ?? 0 })}
            style={{ width: 100 }}
          />
          <Switch
            checkedChildren="启用"
            unCheckedChildren="禁用"
            checked={!interrupt.disabled}
            onChange={(checked) => onChange({ ...interrupt, disabled: !checked })}
          />
          <Button icon={<DeleteOutlined />} danger onClick={onRemove} />
        </Space>
        <Space>
          <InputNumber
            placeholder="抖动间隔(ms)"
            value={interrupt.intercept}
            onChange={(v) => onChange({ ...interrupt, intercept: v ?? undefined })}
            style={{ width: 140 }}
          />
          <InputNumber
            placeholder="延迟(ms)"
            value={interrupt.delay}
            onChange={(v) => onChange({ ...interrupt, delay: v ?? undefined })}
            style={{ width: 120 }}
          />
          <InputNumber
            placeholder="持续(ms)"
            value={interrupt.duration}
            onChange={(v) => onChange({ ...interrupt, duration: v ?? undefined })}
            style={{ width: 120 }}
          />
        </Space>
      </Space>
    </Card>
  );
}
```

Create `app/watering/components/process-step-editor.tsx`:

```tsx
"use client";

import { Input, InputNumber, Switch, Button, Space, Card } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Step, Interrupt } from "../types";
import { ProcessInterruptEditor } from "./process-interrupt-editor";

export function ProcessStepEditor({
  step,
  onChange,
  onRemove,
}: {
  step: Step;
  onChange: (updated: Step) => void;
  onRemove: () => void;
}) {
  function updateInterrupt(index: number, updated: Interrupt) {
    const newInterrupts = [...(step.interrupts || [])];
    newInterrupts[index] = updated;
    onChange({ ...step, interrupts: newInterrupts });
  }

  function addInterrupt() {
    const newInterrupts = [...(step.interrupts || []), { name: "", component: "", state: 0 }];
    onChange({ ...step, interrupts: newInterrupts });
  }

  function removeInterrupt(index: number) {
    const newInterrupts = (step.interrupts || []).filter((_, i) => i !== index);
    onChange({ ...step, interrupts: newInterrupts });
  }

  return (
    <Card size="small" title={step.name || "步骤"} style={{ marginBottom: 12 }}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Input
            placeholder="步骤名称"
            value={step.name}
            onChange={(e) => onChange({ ...step, name: e.target.value })}
            style={{ width: 150 }}
          />
          <Input
            placeholder="负载组件"
            value={step.component}
            onChange={(e) => onChange({ ...step, component: e.target.value })}
            style={{ width: 150 }}
          />
          <InputNumber
            placeholder="开始值"
            value={step.value.begin as number}
            onChange={(v) => onChange({ ...step, value: { ...step.value, begin: v } })}
            style={{ width: 100 }}
          />
          <InputNumber
            placeholder="结束值"
            value={step.value.end as number}
            onChange={(v) => onChange({ ...step, value: { ...step.value, end: v } })}
            style={{ width: 100 }}
          />
        </Space>
        <Space>
          <InputNumber
            placeholder="延迟(ms)"
            value={step.delay}
            onChange={(v) => onChange({ ...step, delay: v ?? undefined })}
            style={{ width: 120 }}
          />
          <InputNumber
            placeholder="超时(ms)"
            value={step.timeout}
            onChange={(v) => onChange({ ...step, timeout: v ?? undefined })}
            style={{ width: 120 }}
          />
          <Switch
            checkedChildren="启用"
            unCheckedChildren="禁用"
            checked={!step.disabled}
            onChange={(checked) => onChange({ ...step, disabled: !checked })}
          />
          <Button icon={<DeleteOutlined />} danger onClick={onRemove} />
        </Space>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>中断条件：</div>
          {(step.interrupts || []).map((interrupt, i) => (
            <ProcessInterruptEditor
              key={i}
              interrupt={interrupt}
              onChange={(updated) => updateInterrupt(i, updated)}
              onRemove={() => removeInterrupt(i)}
            />
          ))}
          <Button type="dashed" icon={<PlusOutlined />} onClick={addInterrupt} size="small">
            添加中断
          </Button>
        </div>
      </Space>
    </Card>
  );
}
```

Create `app/watering/components/process-editor.tsx`:

```tsx
"use client";

import { Input, Button, Card, Space } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Process, Step } from "../types";
import { ProcessStepEditor } from "./process-step-editor";

export function ProcessEditor({
  process,
  onChange,
  onRemove,
}: {
  process: Process;
  onChange: (updated: Process) => void;
  onRemove: () => void;
}) {
  function updateStep(index: number, updated: Step) {
    const newSteps = [...process.steps];
    newSteps[index] = updated;
    onChange({ ...process, steps: newSteps });
  }

  function addStep() {
    const newSteps = [...process.steps, { name: "", component: "", value: { begin: 0, end: 0 } }];
    onChange({ ...process, steps: newSteps });
  }

  function removeStep(index: number) {
    const newSteps = process.steps.filter((_, i) => i !== index);
    onChange({ ...process, steps: newSteps });
  }

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Input
          placeholder="流程名称"
          value={process.name}
          onChange={(e) => onChange({ ...process, name: e.target.value })}
          style={{ width: 200 }}
        />
        <Button icon={<DeleteOutlined />} danger onClick={onRemove}>
          删除流程
        </Button>
      </Space>
      {process.steps.map((step, i) => (
        <ProcessStepEditor
          key={i}
          step={step}
          onChange={(updated) => updateStep(i, updated)}
          onRemove={() => removeStep(i)}
        />
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} block>
        添加步骤
      </Button>
    </Card>
  );
}
```

Create `app/watering/components/schedule-editor.tsx`:

```tsx
"use client";

import { Select, InputNumber, Switch, Button, Card, Space } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Schedule } from "../types";

export function ScheduleEditor({
  schedules,
  processes,
  onChange,
}: {
  schedules: Schedule[];
  processes: Process[];
  onChange: (updated: Schedule[]) => void;
}) {
  function updateSchedule(index: number, updated: Schedule) {
    const newSchedules = [...schedules];
    newSchedules[index] = updated;
    onChange(newSchedules);
  }

  function addSchedule() {
    onChange([...schedules, { type: "day", value: 0, interval: 1, process: 0 }]);
  }

  function removeSchedule(index: number) {
    onChange(schedules.filter((_, i) => i !== index));
  }

  return (
    <div>
      {schedules.map((schedule, i) => (
        <Card size="small" key={i} style={{ marginBottom: 8 }}>
          <Space>
            <Select
              value={schedule.type}
              onChange={(v) => updateSchedule(i, { ...schedule, type: v })}
              style={{ width: 100 }}
              options={[
                { value: "minute", label: "每分钟" },
                { value: "day", label: "每天" },
                { value: "week", label: "每周" },
                { value: "month", label: "每月" },
              ]}
            />
            <InputNumber
              placeholder="时间值"
              value={schedule.value}
              onChange={(v) => updateSchedule(i, { ...schedule, value: v ?? 0 })}
              style={{ width: 120 }}
            />
            <InputNumber
              placeholder="间隔"
              value={schedule.interval}
              onChange={(v) => updateSchedule(i, { ...schedule, interval: v ?? 1 })}
              min={1}
              style={{ width: 80 }}
            />
            <Select
              value={schedule.process}
              onChange={(v) => updateSchedule(i, { ...schedule, process: v })}
              style={{ width: 150 }}
              options={processes.map((p, idx) => ({ value: idx, label: p.name || `流程 ${idx}` }))}
            />
            <Switch
              checkedChildren="启用"
              unCheckedChildren="禁用"
              checked={!schedule.disabled}
              onChange={(checked) => updateSchedule(i, { ...schedule, disabled: !checked })}
            />
            <Button icon={<DeleteOutlined />} danger onClick={() => removeSchedule(i)} />
          </Space>
        </Card>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addSchedule}>
        添加计划任务
      </Button>
    </div>
  );
}

type Process = { name: string };
```

Create `app/watering/components/device-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input, InputNumber, Switch, Button, Tabs, message, Popconfirm } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import type { DeviceConfig } from "../types";
import { ProcessEditor } from "./process-editor";
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

  function updateProcesses(processes: DeviceConfig["processes"]) {
    setForm({ ...form, processes });
  }

  function addProcess() {
    setForm({ ...form, processes: [...form.processes, { name: "", steps: [] }] });
  }

  function updateProcess(index: number, updated: DeviceConfig["processes"][0]) {
    const newProcesses = [...form.processes];
    newProcesses[index] = updated;
    setForm({ ...form, processes: newProcesses });
  }

  function removeProcess(index: number) {
    setForm({ ...form, processes: form.processes.filter((_, i) => i !== index) });
  }

  const tabItems = [
    {
      key: "basic",
      label: "基本设置",
      children: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
          <Input
            label="设备名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>空闲睡眠</span>
            <Switch checked={form.idleSleep} onChange={(v) => setForm({ ...form, idleSleep: v })} />
          </div>
          <InputNumber
            addonBefore="空闲超时(ms)"
            value={form.idleTimeout}
            onChange={(v) => setForm({ ...form, idleTimeout: v ?? 30000 })}
            style={{ width: "100%" }}
          />
          <InputNumber
            addonBefore="开机执行"
            value={form.bootExec}
            onChange={(v) => setForm({ ...form, bootExec: v ?? -1 })}
            style={{ width: "100%" }}
          />
          <InputNumber
            addonBefore="延迟执行(ms)"
            value={form.execDelay}
            onChange={(v) => setForm({ ...form, execDelay: v ?? 0 })}
            style={{ width: "100%" }}
          />
        </div>
      ),
    },
    {
      key: "processes",
      label: "流程设定",
      children: (
        <div>
          {form.processes.map((process, i) => (
            <ProcessEditor
              key={i}
              process={process}
              onChange={(updated) => updateProcess(i, updated)}
              onRemove={() => removeProcess(i)}
            />
          ))}
          <Button type="dashed" onClick={addProcess} block>
            添加流程
          </Button>
        </div>
      ),
    },
    {
      key: "schedules",
      label: "计划任务",
      children: (
        <ScheduleEditor
          schedules={form.schedules}
          processes={form.processes}
          onChange={(schedules) => setForm({ ...form, schedules })}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={saving}>
          保存
        </Button>
        <Popconfirm title="确认删除设备？" onConfirm={onRemove}>
          <Button danger>删除设备</Button>
        </Popconfirm>
      </div>
      <Tabs items={tabItems} />
    </div>
  );
}
```

- [ ] **Step 6: 实现设备详情页**

Replace `app/watering/devices/[chipId]/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { Spin, Button, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceConfig } from "../hooks/use-device-config";
import { DeviceEditor } from "../components/device-editor";

export default function DeviceDetailPage({ params }: { params: Promise<{ chipId: string }> }) {
  const { chipId } = use(params);
  const router = useRouter();
  const { config, loading, save, remove } = useDeviceConfig(chipId);

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
    return <Spin />;
  }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        onClick={() => router.push("/watering")}
        style={{ marginBottom: 16 }}
      >
        返回设备列表
      </Button>
      <DeviceEditor config={config} onSave={save} onRemove={handleRemove} />
    </div>
  );
}
```

- [ ] **Step 7: 验证设备编辑页**

Run: `pnpm dev`

1. 先创建设备：`curl "http://localhost:3000/api/iot-wfm/push-state?chipId=12345&macAddress=AA:BB:CC:DD:EE:FF&event=bootstrap"`
2. 打开 /watering，点击设备"编辑"按钮
3. 修改名称、添加流程、添加计划任务、保存

Expected: 保存成功，返回列表页数据已更新。

- [ ] **Step 8: Commit**

```bash
git add app/watering/
git commit -m "feat: 实现设备配置编辑（流程+计划任务）"
```

---

### Task 5: 设备运行日志页

**Files:**
- Create: `app/watering/actions/get-logs.ts`
- Create: `app/watering/actions/clear-logs.ts`
- Modify: `app/watering/actions.ts`
- Modify: `app/watering/hooks/use-device-logs.ts`
- Create: `app/watering/components/log-viewer.tsx`
- Modify: `app/watering/logs/[chipId]/page.tsx`

- [ ] **Step 1: 创建日志相关 Server Actions**

Create `app/watering/actions/get-logs.ts`:

```ts
"use server";

import { getDeviceLogs } from "../services/db";

export async function getLogs(chipId: string) {
  return getDeviceLogs(chipId);
}
```

Create `app/watering/actions/clear-logs.ts`:

```ts
"use server";

import { clearDeviceLogs } from "../services/db";

export async function clearLogs(chipId: string) {
  clearDeviceLogs(chipId);
}
```

在 `app/watering/actions.ts` 末尾追加：

```ts
export { getLogs } from "./actions/get-logs";
export { clearLogs } from "./actions/clear-logs";
```

- [ ] **Step 2: 实现 use-device-logs hook**

Replace `app/watering/hooks/use-device-logs.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import { getLogs } from "../actions/get-logs";
import { clearLogs } from "../actions/clear-logs";

export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLogs(chipId);
      setLogs(data as any[]);
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const clear = useCallback(async () => {
    await clearLogs(chipId);
    setLogs([]);
  }, [chipId]);

  return { logs, loading, load, clear };
}
```

- [ ] **Step 3: 创建日志查看器组件**

Create `app/watering/components/log-viewer.tsx`:

```tsx
"use client";

import { Timeline, Tag } from "antd";

const eventColors: Record<string, string> = {
  bootstrap: "green",
  execute: "blue",
  finish: "orange",
  terminate: "red",
  heartbeat: "default",
};

export function LogViewer({ logs }: { logs: any[] }) {
  if (logs.length === 0) {
    return <div style={{ color: "#999" }}>暂无日志</div>;
  }

  return (
    <Timeline
      items={logs.map((log) => ({
        color: eventColors[log.event] || "gray",
        children: (
          <div>
            <Tag color={eventColors[log.event]}>{log.event}</Tag>
            <span style={{ color: "#999", fontSize: 12 }}>
              {new Date(log.createdTime).toLocaleString("zh-CN")}
            </span>
            {log.state && (
              <pre style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
                {JSON.stringify(typeof log.state === "string" ? JSON.parse(log.state) : log.state, null, 2)}
              </pre>
            )}
          </div>
        ),
      }))}
    />
  );
}
```

- [ ] **Step 4: 实现日志页**

Replace `app/watering/logs/[chipId]/page.tsx`:

```tsx
"use client";

import { use, useEffect } from "react";
import { Button, Space, Spin, Popconfirm, message } from "antd";
import { ArrowLeftOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceLogs } from "../hooks/use-device-logs";
import { LogViewer } from "../components/log-viewer";

export default function DeviceLogsPage({ params }: { params: Promise<{ chipId: string }> }) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, load, clear } = useDeviceLogs(chipId);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    await clear();
    message.success("日志已清空");
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.push("/watering")}>
          返回设备列表
        </Button>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Popconfirm title="确认清空日志？" onConfirm={handleClear}>
            <Button icon={<DeleteOutlined />} danger>
              清空日志
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <h3>设备: {chipId}</h3>
      {loading && logs.length === 0 ? <Spin /> : <LogViewer logs={logs} />}
    </div>
  );
}
```

- [ ] **Step 5: 验证日志页**

Run: `pnpm dev`

1. 先触发一些设备事件创建日志
2. 打开 /watering，点击设备"日志"按钮
3. 查看日志、清空日志

Expected: 日志按时间线展示，清空后显示"暂无日志"。

- [ ] **Step 6: Commit**

```bash
git add app/watering/
git commit -m "feat: 实现设备运行日志查看和清空"
```

---

### Task 6: 补充 IoT 控制指令 API

**Files:**
- Create: `app/api/iot-wfm/set-state/route.ts`
- Create: `app/api/iot-wfm/set-config/route.ts`
- Create: `app/api/iot-wfm/get-config/route.ts`
- Create: `app/api/iot-wfm/get-list/route.ts`
- Create: `app/api/iot-wfm/delete/route.ts`
- Create: `app/api/iot-wfm/get-logs/route.ts`
- Create: `app/api/iot-wfm/clear-logs/route.ts`

- [ ] **Step 1: 创建 set-state API**

Create `app/api/iot-wfm/set-state/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId, switch: switchVal, index, process } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const state = getDeviceState(chipId);
  if (!state) {
    return NextResponse.json({ error: "设备状态不存在" }, { status: 404 });
  }

  const prevStateId = state.stateId;

  if (switchVal === "off" && state.switch === "off") {
    return NextResponse.json({ data: undefined });
  }

  state.switch = switchVal;
  if (index !== undefined) state.index = index;
  if (process !== undefined) state.process = process;
  state.stateId = newId();
  state.lastWriteTime = new Date().toISOString();

  saveDeviceState(state);
  writeDeviceLog(chipId, switchVal === "on" ? "execute" : "terminate", { stateId: prevStateId });

  return NextResponse.json({ data: undefined });
}
```

- [ ] **Step 2: 创建 get-config API**

Create `app/api/iot-wfm/get-config/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, getDeviceState } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const config = getDeviceConfig(chipId);
  const state = getDeviceState(chipId);

  if (!config) {
    return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  }

  return NextResponse.json({ data: { ...config, state } });
}
```

- [ ] **Step 3: 创建 get-list API**

Create `app/api/iot-wfm/get-list/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAllDevices } from "@/app/watering/services/db";

export async function GET() {
  const devices = getAllDevices();
  return NextResponse.json({ data: devices });
}
```

- [ ] **Step 4: 创建 delete API**

Create `app/api/iot-wfm/delete/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteDevice } from "@/app/watering/services/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  deleteDevice(chipId);
  return NextResponse.json({ data: undefined });
}
```

- [ ] **Step 5: 创建 get-logs API**

Create `app/api/iot-wfm/get-logs/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceLogs } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const logs = getDeviceLogs(chipId);
  return NextResponse.json({ data: logs });
}
```

- [ ] **Step 6: 创建 clear-logs API**

Create `app/api/iot-wfm/clear-logs/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { clearDeviceLogs } from "@/app/watering/services/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  clearDeviceLogs(chipId);
  return NextResponse.json({ data: undefined });
}
```

- [ ] **Step 7: 创建 set-config API**

Create `app/api/iot-wfm/set-config/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";
import type { DeviceConfig } from "@/app/watering/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const config = getDeviceConfig(chipId);
  if (!config) {
    return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  }

  // 更新配置字段
  if (body.name !== undefined) config.name = body.name;
  if (body.idleSleep !== undefined) config.idleSleep = body.idleSleep;
  if (body.idleTimeout !== undefined) config.idleTimeout = body.idleTimeout;
  if (body.bootExec !== undefined) config.bootExec = body.bootExec;
  if (body.execDelay !== undefined) config.execDelay = body.execDelay;
  if (body.processes !== undefined) config.processes = body.processes;
  if (body.schedules !== undefined) config.schedules = body.schedules;
  config.lastWriteTime = new Date().toISOString();

  saveDeviceConfig(config);

  // 如果设备处于 off 状态，刷新 stateId 以通知设备
  const state = getDeviceState(chipId);
  if (state && state.switch === "off") {
    state.stateId = newId();
    state.lastWriteTime = new Date().toISOString();
    saveDeviceState(state);
  }

  return NextResponse.json({ data: undefined });
}
```

- [ ] **Step 8: 验证所有 API 端点**

Run: `pnpm dev`

```bash
# 创建设备
curl "http://localhost:3000/api/iot-wfm/push-state?chipId=99999&macAddress=11:22:33:44:55:66&event=bootstrap"

# 获取设备列表
curl http://localhost:3000/api/iot-wfm/get-list

# 获取设备配置
curl "http://localhost:3000/api/iot-wfm/get-config?chipId=99999"

# 修改设备配置
curl -X POST http://localhost:3000/api/iot-wfm/set-config -H "Content-Type: application/json" -d '{"chipId":"99999","name":"测试花盆"}'

# 设置设备状态
curl -X POST http://localhost:3000/api/iot-wfm/set-state -H "Content-Type: application/json" -d '{"chipId":"99999","switch":"on","index":0}'

# 获取日志
curl "http://localhost:3000/api/iot-wfm/get-logs?chipId=99999"

# 删除设备
curl -X POST http://localhost:3000/api/iot-wfm/delete -H "Content-Type: application/json" -d '{"chipId":"99999"}'
```

Expected: 所有端点正常响应。

- [ ] **Step 9: Commit**

```bash
git add app/api/iot-wfm/
git commit -m "feat: 实现完整的 IoT REST API 端点"
```
