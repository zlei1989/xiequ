# IoT 设备调试面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a development-only debug panel under `app/watering/debug` that simulates IoT device HTTP requests (getState / pushState) so developers can test the server-side device protocol without physical hardware.

**Architecture:** A new page route `app/watering/debug/page.tsx` gated by `process.env.NODE_ENV === 'development'` at the layout level (the entire `/watering/debug` subtree is hidden in production). The page is a client component that builds the exact query-parameter URLs the ESP32 firmware would send, and fires `fetch()` calls to the existing Next.js API routes (`/watering/api/get-state` and `/watering/api/push-state`). It provides a form to configure device identity (chipId, macAddress, stateId), editable sensor/load state fields, and one-click buttons for each event type (bootstrap, getState, change, finish). A response log shows the server's replies in real time.

**Tech Stack:** Next.js App Router, React 19, Ant Design 6, TypeScript

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/watering/debug/layout.tsx` | Dev-only gate — hides the debug subtree in production |
| Create | `app/watering/debug/page.tsx` | Main debug panel page (client component) |
| Create | `app/watering/debug/components/device-form.tsx` | Device identity & GPIO state editor form |
| Create | `app/watering/debug/components/event-buttons.tsx` | Buttons to fire each IoT event type |
| Create | `app/watering/debug/components/response-log.tsx` | Scrollable log of server responses |
| Create | `app/watering/debug/hooks/use-iot-simulator.ts` | Core hook — builds URLs, fires fetches, tracks responses |
| Modify | `app/watering/layout.tsx:11` | Add debug menu item (dev-only) |

---

### Task 1: Dev-only layout gate

**Files:**
- Create: `app/watering/debug/layout.tsx`

This layout ensures the entire `/watering/debug` subtree is inaccessible in production. In development it simply renders children; in production it shows a "Not Found" message.

- [ ] **Step 1: Create the debug layout**

```tsx
// app/watering/debug/layout.tsx
import type { ReactNode } from "react";

export default function DebugLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#999" }}>
        调试面板仅在开发环境可用
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify no syntax error**

Run: `npx tsc --noEmit app/watering/debug/layout.tsx 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/watering/debug/layout.tsx
git commit -m "feat(watering/debug): add dev-only layout gate"
```

---

### Task 2: Core simulator hook — `useIotSimulator`

**Files:**
- Create: `app/watering/debug/hooks/use-iot-simulator.ts`

This hook encapsulates all IoT request logic: building query strings that match the ESP32 firmware protocol, sending GET requests to the local Next.js API routes, and collecting responses.

**Key protocol details from the IoT ROM v2 README and firmware source:**

- Firmware registers buttons as `TYPE_SENSOR` with keys `button_0`…`button_4`, so they are sent as `sensor:button_0` etc. (NOT `button:button_0`).
- Sensors are registered as `TYPE_SENSOR` with keys `sensor_0`…`sensor_4`, sent as `sensor:sensor_0` etc.
- Loads are registered as `TYPE_LOAD` with keys `load_0`…`load_3`, sent as `load:load_0` etc.
- The Next.js API routes are at `/watering/api/get-state` and `/watering/api/push-state`.

- [ ] **Step 1: Create the hook**

```ts
// app/watering/debug/hooks/use-iot-simulator.ts
"use client";

import { useState, useCallback, useRef } from "react";

// ---- Types ----

export type GpioState = {
  buttons: Record<string, number>;
  sensors: Record<string, number>;
  loads: Record<string, number>;
};

export type DeviceIdentity = {
  chipId: string;
  macAddress: string;
  stateId: string;
};

export type LogEntry = {
  id: number;
  timestamp: string;
  direction: "request" | "response";
  url: string;
  method: string;
  body?: string;
  status?: number;
  error?: string;
};

// Default GPIO values matching the ESP32 firmware's 4-pump setup
const DEFAULT_GPIO: GpioState = {
  buttons: { button_0: 0, button_1: 0, button_2: 0, button_3: 0, button_4: 0 },
  sensors: { sensor_0: 1827, sensor_1: 0, sensor_2: 0, sensor_3: 0, sensor_4: 355 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};

// ---- Hook ----

export function useIotSimulator() {
  const [identity, setIdentity] = useState<DeviceIdentity>({
    chipId: "5872424",
    macAddress: "20:E7:C8:59:9B:28",
    stateId: "",
  });
  const [gpio, setGpio] = useState<GpioState>(DEFAULT_GPIO);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const nextId = useRef(0);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs((prev) => [
      { ...entry, id: nextId.current++, timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }) },
      ...prev,
    ]);
  }, []);

  /**
   * Build the query string matching the ESP32 firmware's NetworkExt.getStateQuery() order:
   * 1. Base fields: macAddress, chipId
   * 2. Custom params: event, stateId, cause, type, message, etc.
   * 3. Component states: buttons as sensor:button_x, sensors as sensor:sensor_x, loads as load:load_x
   */
  const buildQuery = useCallback(
    (extra: Record<string, string> = {}): string => {
      const params = new URLSearchParams();
      params.set("macAddress", identity.macAddress);
      params.set("chipId", identity.chipId);

      // Extra params (event, stateId, cause, type, message, etc.)
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== "") {
          params.set(k, v);
        }
      }

      // Buttons: firmware sends them as sensor:button_x because
      // they are registered as TYPE_SENSOR in Process
      for (const [key, val] of Object.entries(gpio.buttons)) {
        params.set(`sensor:${key}`, String(val));
      }
      // Sensors: sensor:sensor_x
      for (const [key, val] of Object.entries(gpio.sensors)) {
        params.set(`sensor:${key}`, String(val));
      }
      // Loads: load:load_x
      for (const [key, val] of Object.entries(gpio.loads)) {
        params.set(`load:${key}`, String(val));
      }

      return params.toString();
    },
    [identity, gpio]
  );

  /** Fire a GET request to a local Next.js IoT API route */
  const sendRequest = useCallback(
    async (endpoint: string, extra: Record<string, string> = {}) => {
      const query = buildQuery(extra);
      const url = `/watering/api/${endpoint}?${query}`;

      addLog({ direction: "request", url, method: "GET" });
      setLoading(true);

      try {
        const res = await fetch(url);
        const text = await res.text();
        let body: string;
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          body = text;
        }
        addLog({ direction: "response", url, method: "GET", status: res.status, body });

        // If getState response contains stateId, auto-update it
        if (endpoint === "get-state") {
          try {
            const json = JSON.parse(text);
            if (json?.data?.stateId) {
              setIdentity((prev) => ({ ...prev, stateId: json.data.stateId }));
            }
          } catch {
            // ignore
          }
        }
      } catch (err: any) {
        addLog({ direction: "response", url, method: "GET", error: err.message });
      } finally {
        setLoading(false);
      }
    },
    [buildQuery, addLog]
  );

  // Convenience methods matching the IoT protocol events

  const getState = useCallback(() => {
    return sendRequest("get-state", { stateId: identity.stateId });
  }, [sendRequest, identity.stateId]);

  const pushBootstrap = useCallback(
    (cause = "0") => {
      return sendRequest("push-state", { event: "bootstrap", cause });
    },
    [sendRequest]
  );

  const pushChange = useCallback(
    (type: string, message = "") => {
      const extra: Record<string, string> = {
        event: "change",
        stateId: identity.stateId,
        type,
      };
      if (message) {
        extra.message = message;
      }
      return sendRequest("push-state", extra);
    },
    [sendRequest, identity.stateId]
  );

  const pushFinish = useCallback(() => {
    return sendRequest("push-state", { event: "finish", stateId: identity.stateId });
  }, [sendRequest, identity.stateId]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return {
    identity,
    setIdentity,
    gpio,
    setGpio,
    logs,
    loading,
    // Actions
    getState,
    pushBootstrap,
    pushChange,
    pushFinish,
    clearLogs,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/debug/hooks/use-iot-simulator.ts
git commit -m "feat(watering/debug): add useIotSimulator hook"
```

---

### Task 3: Device identity & GPIO state form

**Files:**
- Create: `app/watering/debug/components/device-form.tsx`

This form lets the user edit the device identity fields (chipId, macAddress, stateId) and all GPIO component states. Buttons are grouped under a "按钮" card with a note showing they are sent as `sensor:button_x`.

- [ ] **Step 1: Create the form component**

```tsx
// app/watering/debug/components/device-form.tsx
"use client";

import { Input, InputNumber, Card, Row, Col } from "antd";
import type { DeviceIdentity, GpioState } from "../hooks/use-iot-simulator";

export function DeviceForm({
  identity,
  onIdentityChange,
  gpio,
  onGpioChange,
}: {
  identity: DeviceIdentity;
  onIdentityChange: (identity: DeviceIdentity) => void;
  gpio: GpioState;
  onGpioChange: (gpio: GpioState) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Device Identity */}
      <Card title="设备标识" size="small">
        <Row gutter={[12, 8]}>
          <Col span={8}>
            <Input
              addonBefore="chipId"
              value={identity.chipId}
              onChange={(e) => onIdentityChange({ ...identity, chipId: e.target.value })}
            />
          </Col>
          <Col span={8}>
            <Input
              addonBefore="MAC"
              value={identity.macAddress}
              onChange={(e) => onIdentityChange({ ...identity, macAddress: e.target.value })}
            />
          </Col>
          <Col span={8}>
            <Input
              addonBefore="stateId"
              value={identity.stateId}
              onChange={(e) => onIdentityChange({ ...identity, stateId: e.target.value })}
            />
          </Col>
        </Row>
      </Card>

      {/* Buttons — sent as sensor:button_x per firmware protocol */}
      <Card title="按钮 (→ sensor:button_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.buttons).map(([key, val]) => (
            <Col span={4} key={key}>
              <InputNumber
                addonBefore={key}
                value={val}
                min={0}
                max={1}
                onChange={(v) =>
                  onGpioChange({
                    ...gpio,
                    buttons: { ...gpio.buttons, [key]: v ?? 0 },
                  })
                }
                style={{ width: "100%" }}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Sensors */}
      <Card title="传感器 (→ sensor:sensor_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.sensors).map(([key, val]) => (
            <Col span={4} key={key}>
              <InputNumber
                addonBefore={key}
                value={val}
                min={0}
                max={1023}
                onChange={(v) =>
                  onGpioChange({
                    ...gpio,
                    sensors: { ...gpio.sensors, [key]: v ?? 0 },
                  })
                }
                style={{ width: "100%" }}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Loads */}
      <Card title="水泵 (→ load:load_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.loads).map(([key, val]) => (
            <Col span={6} key={key}>
              <InputNumber
                addonBefore={key}
                value={val}
                min={0}
                max={1024}
                onChange={(v) =>
                  onGpioChange({
                    ...gpio,
                    loads: { ...gpio.loads, [key]: v ?? 0 },
                  })
                }
                style={{ width: "100%" }}
              />
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/debug/components/device-form.tsx
git commit -m "feat(watering/debug): add DeviceForm component"
```

---

### Task 4: Event action buttons

**Files:**
- Create: `app/watering/debug/components/event-buttons.tsx`

Buttons to trigger each IoT event type, matching the protocol's bootstrap / getState / change / finish events. Includes dropdowns for change types and bootstrap cause values.

- [ ] **Step 1: Create the event buttons component**

```tsx
// app/watering/debug/components/event-buttons.tsx
"use client";

import { Button, Space, Select, Input, Card } from "antd";
import { PlayCircleOutlined, CloudUploadOutlined } from "@ant-design/icons";
import { useState } from "react";

const CHANGE_TYPES = [
  { value: "step_ready", label: "step_ready (步骤就绪)" },
  { value: "step_begin", label: "step_begin (步骤开始)" },
  { value: "step_end", label: "step_end (步骤正常结束)" },
  { value: "step_timeout", label: "step_timeout (步骤超时)" },
  { value: "step_interrupt", label: "step_interrupt (步骤中断)" },
];

const CAUSE_OPTIONS = [
  { value: "0", label: "0 (正常上电)" },
  { value: "2", label: "2 (外部唤醒)" },
  { value: "4", label: "4 (定时器唤醒)" },
];

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
  const [changeType, setChangeType] = useState("step_begin");
  const [changeMessage, setChangeMessage] = useState("");
  const [bootstrapCause, setBootstrapCause] = useState("0");

  return (
    <Card title="模拟事件" size="small">
      <Space wrap direction="vertical" style={{ width: "100%" }}>
        <Space wrap>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => onGetState()}
            loading={loading}
          >
            getState (轮询)
          </Button>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => onPushBootstrap(bootstrapCause)}
            loading={loading}
          >
            bootstrap (开机)
          </Button>
          <Select
            value={bootstrapCause}
            onChange={setBootstrapCause}
            options={CAUSE_OPTIONS}
            style={{ width: 160 }}
          />
        </Space>

        <Space wrap>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => onPushChange(changeType, changeMessage)}
            loading={loading}
          >
            change (步骤变更)
          </Button>
          <Select
            value={changeType}
            onChange={setChangeType}
            options={CHANGE_TYPES}
            style={{ width: 220 }}
          />
          <Input
            placeholder="message (可选)"
            value={changeMessage}
            onChange={(e) => setChangeMessage(e.target.value)}
            style={{ width: 200 }}
          />
        </Space>

        <Button
          icon={<PlayCircleOutlined />}
          onClick={() => onPushFinish()}
          loading={loading}
        >
          finish (流程完成)
        </Button>
      </Space>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/debug/components/event-buttons.tsx
git commit -m "feat(watering/debug): add EventButtons component"
```

---

### Task 5: Response log component

**Files:**
- Create: `app/watering/debug/components/response-log.tsx`

Scrollable log showing all requests and responses in reverse chronological order (newest first).

- [ ] **Step 1: Create the response log component**

```tsx
// app/watering/debug/components/response-log.tsx
"use client";

import { Card, Button, Tag } from "antd";
import { ClearOutlined } from "@ant-design/icons";
import type { LogEntry } from "../hooks/use-iot-simulator";

const directionTag = {
  request: { color: "blue", label: "REQ" },
  response: { color: "green", label: "RES" },
};

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
      size="small"
      extra={
        <Button icon={<ClearOutlined />} size="small" onClick={onClear}>
          清空
        </Button>
      }
    >
      <div
        style={{
          maxHeight: 400,
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: 12,
          background: "#fafafa",
          padding: 8,
          borderRadius: 4,
        }}
      >
        {logs.length === 0 && <div style={{ color: "#999" }}>暂无请求</div>}
        {logs.map((log) => {
          const tag = directionTag[log.direction];
          return (
            <div
              key={log.id}
              style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Tag color={tag.color} style={{ margin: 0 }}>
                  {tag.label}
                </Tag>
                <span style={{ color: "#999" }}>{log.timestamp}</span>
                {log.status !== undefined && (
                  <Tag color={log.status < 400 ? "green" : "red"}>
                    {log.status}
                  </Tag>
                )}
                {log.error && <Tag color="red">ERROR</Tag>}
              </div>
              <div style={{ color: "#666", wordBreak: "break-all", marginTop: 2 }}>
                {log.url}
              </div>
              {log.body && (
                <pre style={{ margin: "4px 0 0", color: "#333", fontSize: 11 }}>
                  {log.body}
                </pre>
              )}
              {log.error && (
                <div style={{ color: "#ff4d4f", marginTop: 2 }}>{log.error}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/debug/components/response-log.tsx
git commit -m "feat(watering/debug): add ResponseLog component"
```

---

### Task 6: Main debug page

**Files:**
- Create: `app/watering/debug/page.tsx`

Assembles all debug components into the full page.

- [ ] **Step 1: Create the debug page**

```tsx
// app/watering/debug/page.tsx
"use client";

import { useIotSimulator } from "./hooks/use-iot-simulator";
import { DeviceForm } from "./components/device-form";
import { EventButtons } from "./components/event-buttons";
import { ResponseLog } from "./components/response-log";
import { Typography } from "antd";

const { Title, Paragraph } = Typography;

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Title level={4} style={{ margin: 0 }}>
          IoT 设备模拟器
        </Title>
        <Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
          模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议
        </Paragraph>
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

- [ ] **Step 2: Verify the page renders in dev mode**

Run: `pnpm dev` and navigate to `http://localhost:3000/watering/debug`
Expected: The debug panel with all forms and buttons visible.

- [ ] **Step 3: Commit**

```bash
git add app/watering/debug/page.tsx
git commit -m "feat(watering/debug): add main debug page"
```

---

### Task 7: Add debug menu item to watering layout (dev-only)

**Files:**
- Modify: `app/watering/layout.tsx`

Add a "调试面板" menu item that only appears in development mode. This replaces the entire file content since the changes touch the imports, the `menuItems` array, and the component itself.

- [ ] **Step 1: Update the layout with the dev-only menu item**

```tsx
// app/watering/layout.tsx
"use client";

import { Layout, Menu, Button } from "antd";
import { HomeOutlined, BugOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const { Sider, Content, Header } = Layout;

const isDev = process.env.NODE_ENV === "development";

const menuItems = [
  { key: "/watering", label: "设备列表" },
  { key: "/watering/logs", label: "运行日志", disabled: true },
  ...(isDev ? [{ key: "/watering/debug", label: "调试面板", icon: <BugOutlined /> }] : []),
];

export default function WateringLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 根据路径确定当前选中菜单
  const selectedKey = menuItems.find((item) => pathname.startsWith(item.key))?.key || "/watering";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f0f0f0" }}>
        <Button type="text" icon={<HomeOutlined />} onClick={() => router.push("/")} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>浇花帮手</span>
      </Header>
      <Layout>
        <Sider width={200} theme="light" style={{ borderRight: "1px solid #f0f0f0" }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => router.push(key)}
            style={{ height: "100%", borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: "#fff" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 2: Verify the menu item appears in dev**

Run: `pnpm dev` — sidebar should show "调试面板" item with a bug icon.
In production build (`pnpm build && pnpm start`), the item should be absent.

- [ ] **Step 3: Commit**

```bash
git add app/watering/layout.tsx
git commit -m "feat(watering): add debug menu item (dev-only) to sidebar"
```

---

### Task 8: End-to-end smoke test

**Files:**
- None (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Verify bootstrap creates a device**

1. Navigate to `http://localhost:3000/watering/debug`
2. Keep default chipId `5872424` and MAC address
3. Click "bootstrap (开机)"
4. Check the response log shows a successful response with `status 200`
5. Navigate to `http://localhost:3000/watering` — a new device "IOT-5872424" should appear

- [ ] **Step 3: Verify getState returns server state**

1. Go back to the debug panel
2. Click "getState (轮询)"
3. The response log should show `{ "data": { "changed": true, "stateId": "...", "switch": "off" } }`
4. The stateId field should auto-populate from the response

- [ ] **Step 4: Verify change event logs correctly**

1. Select "step_begin" from the change type dropdown
2. Click "change (步骤变更)"
3. Check the response log shows a successful push

- [ ] **Step 5: Verify finish clears process state**

1. Turn on the device from the main page (switch to "开")
2. Go back to debug, click "finish (流程完成)"
3. Verify the device card shows "关" again

- [ ] **Step 6: Verify production gate works**

1. Stop dev server
2. Run `pnpm build && pnpm start`
3. Navigate to `http://localhost:3000/watering/debug` — should show "调试面板仅在开发环境可用"
4. Sidebar should not show "调试面板" menu item

- [ ] **Step 7: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix(watering/debug): adjustments from smoke test"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Debug interface in `app/watering` — Task 6 (page), Task 7 (nav entry)
- ✅ Only visible in development environment — Task 1 (layout gate), Task 7 (menu gate)
- ✅ Simulates IoT device requests — Tasks 2–5 (hook + components for getState/pushState)
- ✅ References IoT ROM v2 README protocol — all parameter names and event types match exactly

**2. Placeholder scan:**
- No TBD / TODO / "implement later" found
- No "add appropriate error handling" — error handling is in the hook
- No "write tests for the above" without test code — this is a UI feature, manual smoke test in Task 8

**3. Type consistency:**
- `DeviceIdentity`, `GpioState`, `LogEntry` defined in Task 2 hook, used consistently in Tasks 3–5
- `useIotSimulator` return values match the props consumed by `DeviceForm`, `EventButtons`, `ResponseLog`
- `pushChange(type: string, message: string)` signature matches the `onPushChange` prop type
- URL paths use `/watering/api/get-state` and `/watering/api/push-state` matching the actual Next.js route file locations
- Buttons sent as `sensor:button_x` matching the ESP32 firmware's TYPE_SENSOR registration
