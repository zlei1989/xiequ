# Voltage Detection Config & Enhanced Process Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voltage detection configuration (sensor selection + R1/R2 resistor values) to the device editor, display calculated voltage on the device list, and enhance process buttons with multi-function actions.

**Architecture:** A new `VoltageConfig` type stores `{sensor, r1, r2}` in the DB as a JSON column on `watering_devices`. The device list reads raw sensor values and applies the voltage divider formula `V_actual = V_sensor * (R1 + R2) / R2`. The device editor gains a new drawer for configuring voltage detection. Process buttons on the device list gain a dropdown with "执行"/"终止"/"编辑流程" actions.

**Tech Stack:** Next.js App Router, React Server Components + Client Components, Ant Design v5, sql.js (SQLite), TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/watering/types.ts` | Modify | Add `VoltageConfig` type, add `voltageConfig` to `DeviceConfig` |
| `app/watering/services/db.ts` | Modify | Add `voltage_config` column, update CRUD queries |
| `app/watering/hooks/use-device-config.ts` | Modify | Parse `voltageConfig` from row, pass to components |
| `app/watering/components/voltage-config-drawer.tsx` | **Create** | Drawer UI: sensor selector + R1/R2 number inputs |
| `app/watering/components/device-editor.tsx` | Modify | Add voltage config section + wire up drawer |
| `app/watering/components/device-card.tsx` | Modify | Use voltage config for calculated display, add process dropdown |

---

### Task 1: Add VoltageConfig type and extend DeviceConfig

**Files:**
- Modify: `app/watering/types.ts`

- [ ] **Step 1: Add `VoltageConfig` type and extend `DeviceConfig`**

Add the new type and property to `app/watering/types.ts`. Insert `VoltageConfig` after the `Schedule` type, and add `voltageConfig` to `DeviceConfig`:

```typescript
// 电压检测配置
export type VoltageConfig = {
  sensor: string;   // 传感器引脚名，如 "sensor_0"
  r1: number;       // R1 电阻值（欧姆），默认 30000
  r2: number;       // R2 电阻值（欧姆），默认 10000
};
```

In `DeviceConfig`, add the new optional property after `schedules`:

```typescript
export type DeviceConfig = {
  chipId: string;
  name: string;
  macAddress: string;
  processes: Process[];
  idleSleep: boolean;
  idleTimeout: number;
  bootExec: number;
  execDelay: number;
  schedules: Schedule[];
  voltageConfig?: VoltageConfig;  // <-- 新增
  createdTime: string;
  lastWriteTime: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat(watering): add VoltageConfig type and extend DeviceConfig"
```

---

### Task 2: Update DB schema and queries for voltage_config

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: Add `voltage_config` column in `initDb`**

In `initDb()`, after the `CREATE TABLE IF NOT EXISTS watering_devices` block, add an ALTER TABLE to add the column if it doesn't exist. Insert this right after the `CREATE TABLE` statement for `watering_devices` (after line 40):

```typescript
  // 为已有表添加 voltage_config 列（兼容旧数据库）
  try {
    db.exec(`ALTER TABLE watering_devices ADD COLUMN voltage_config JSON`);
  } catch {
    // 列已存在，忽略
  }
```

- [ ] **Step 2: Update `getAllDevices` query to include `voltage_config`**

In the `getAllDevices` function, add `d.voltage_config` to the SELECT clause. Change the SELECT line (line 82-84):

```typescript
    const rows = db.prepare(`
    SELECT d.chip_id, d.name, d.mac_address, d.processes, d.idle_sleep, d.idle_timeout,
           d.boot_exec, d.exec_delay, d.schedules, d.voltage_config, d.created_time, d.last_write_time,
           s.state_id, s.switch, s.buttons, s.sensors, s.loads,
           s.current_index, s.current_process, s.message,
           s.last_tick_time as state_last_tick_time, s.last_write_time as state_last_write_time
    FROM watering_devices d
    LEFT JOIN watering_device_state s ON d.chip_id = s.chip_id
    ORDER BY d.name
  `).all() as any[];
```

And in the row mapping inside `rows.map()`, add `voltageConfig` to the config object (after the `schedules` line, around line 104):

```typescript
        schedules: parseJSON(row.schedules, [] as DeviceConfig["schedules"]),
        voltageConfig: parseJSON(row.voltage_config, undefined as DeviceConfig["voltageConfig"]),
```

- [ ] **Step 3: Update `getDeviceConfig` query**

In the `getDeviceConfig` function, the `SELECT *` already picks up the new column. Just add `voltageConfig` to the return object (after `schedules`, around line 148):

```typescript
    schedules: parseJSON(row.schedules, [] as DeviceConfig["schedules"]),
    voltageConfig: parseJSON(row.voltage_config, undefined as DeviceConfig["voltageConfig"]),
```

- [ ] **Step 4: Update `saveDeviceConfig` to persist `voltage_config`**

In `saveDeviceConfig`, add `@voltage_config` to both the INSERT column list and the ON CONFLICT DO UPDATE SET clause. Change the SQL (lines 159-165):

```typescript
  db.prepare(`
    INSERT INTO watering_devices (chip_id, name, mac_address, processes, idle_sleep, idle_timeout, boot_exec, exec_delay, schedules, voltage_config, created_time, last_write_time)
    VALUES (@chip_id, @name, @mac_address, @processes, @idle_sleep, @idle_timeout, @boot_exec, @exec_delay, @schedules, @voltage_config, @created_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      name=@name, mac_address=@mac_address, processes=@processes, idle_sleep=@idle_sleep,
      idle_timeout=@idle_timeout, boot_exec=@boot_exec, exec_delay=@exec_delay,
      schedules=@schedules, voltage_config=@voltage_config, last_write_time=@last_write_time
  `).run({
```

Add the `@voltage_config` binding in the `.run()` params object (after `@schedules`):

```typescript
    "@schedules": JSON.stringify(config.schedules),
    "@voltage_config": config.voltageConfig ? JSON.stringify(config.voltageConfig) : null,
```

- [ ] **Step 5: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat(watering): add voltage_config column to DB schema and queries"
```

---

### Task 3: Parse voltageConfig in useDeviceConfig hook

**Files:**
- Modify: `app/watering/hooks/use-device-config.ts`

- [ ] **Step 1: Parse `voltageConfig` from the raw row data**

In `useDeviceConfig`, inside the `load` callback where `safeConfig` is built (around line 42-47), add `voltageConfig` parsing:

```typescript
        const safeConfig: DeviceConfig = {
          ...(found as unknown as DeviceConfig),
          processes: parseJsonArray((found as any).processes),
          schedules: parseJsonArray((found as any).schedules),
          voltageConfig: parseJsonVoltageConfig((found as any).voltageConfig),
        };
```

Add the helper function at the top of the file, after `parseJsonArray`:

```typescript
/** 解析 voltage_config JSON，可能是字符串 */
function parseJsonVoltageConfig(v: unknown): DeviceConfig["voltageConfig"] {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.sensor === "string" && typeof obj.r1 === "number" && typeof obj.r2 === "number") {
      return { sensor: obj.sensor, r1: obj.r1, r2: obj.r2 };
    }
  }
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed.sensor === "string" && typeof parsed.r1 === "number" && typeof parsed.r2 === "number") {
        return { sensor: parsed.sensor, r1: parsed.r1, r2: parsed.r2 };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}
```

Add the `DeviceConfig` import at the top of the file (line 4), since it's now used in the helper:

```typescript
import type { DeviceConfig } from "../types";
```

(Note: this import already exists at line 4, so no change needed unless it's missing.)

- [ ] **Step 2: Commit**

```bash
git add app/watering/hooks/use-device-config.ts
git commit -m "feat(watering): parse voltageConfig in useDeviceConfig hook"
```

---

### Task 4: Create VoltageConfigDrawer component

**Files:**
- Create: `app/watering/components/voltage-config-drawer.tsx`

- [ ] **Step 1: Create the component file**

Create `app/watering/components/voltage-config-drawer.tsx`:

```typescript
"use client";

import { Drawer, Select, InputNumber, Button, Space, message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { VoltageConfig } from "../types";

interface VoltageConfigDrawerProps {
  open: boolean;
  voltageConfig: VoltageConfig | undefined;
  sensors: string[];
  onChange: (config: VoltageConfig | undefined) => void;
  onClose: () => void;
}

const DEFAULT_R1 = 30000; // 30kΩ
const DEFAULT_R2 = 10000; // 10kΩ

export function VoltageConfigDrawer({
  open,
  voltageConfig,
  sensors,
  onChange,
  onClose,
}: VoltageConfigDrawerProps) {
  const config = voltageConfig || { sensor: sensors[0] || "sensor_0", r1: DEFAULT_R1, r2: DEFAULT_R2 };

  function update(partial: Partial<VoltageConfig>) {
    onChange({ ...config, ...partial });
  }

  function handleClose() {
    // 如果 sensor 无效且没有配置任何值，清除配置
    if (!voltageConfig && !sensors.length) {
      onChange(undefined);
    }
    onClose();
  }

  return (
    <Drawer
      title="电压检测配置"
      placement="bottom"
      size="60%"
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button
          icon={<CloseOutlined />}
          onClick={handleClose}
          size="small"
        >
          关闭
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 传感器选择 */}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 4,
              display: "block",
            }}
          >
            电压检测传感器
          </label>
          <Select
            value={config.sensor}
            onChange={(v) => update({ sensor: v })}
            options={sensors.map((s) => ({ value: s, label: s }))}
            placeholder="选择传感器引脚"
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            选择用于电压检测的 ADC 传感器引脚
          </div>
        </div>

        {/* R1 电阻值 */}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 4,
              display: "block",
            }}
          >
            R1 电阻值（Ω）
          </label>
          <InputNumber
            value={config.r1}
            onChange={(v) => update({ r1: v ?? DEFAULT_R1 })}
            min={0}
            step={1000}
            style={{ width: "100%" }}
            addonAfter="Ω"
            placeholder="默认 30000Ω (30kΩ)"
          />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            分压电阻 R1，上拉至被测电压。默认 30kΩ
          </div>
        </div>

        {/* R2 电阻值 */}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 4,
              display: "block",
            }}
          >
            R2 电阻值（Ω）
          </label>
          <InputNumber
            value={config.r2}
            onChange={(v) => update({ r2: v ?? DEFAULT_R2 })}
            min={0}
            step={1000}
            style={{ width: "100%" }}
            addonAfter="Ω"
            placeholder="默认 10000Ω (10kΩ)"
          />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            分压电阻 R2，下拉至 GND。默认 10kΩ
          </div>
        </div>

        {/* 电压计算公式说明 */}
        <div
          style={{
            background: "#f6f8fa",
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            padding: "12px 16px",
            fontSize: 12,
            color: "#666",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>计算公式</div>
          <div>
            V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
          </div>
          <div style={{ marginTop: 4 }}>
            当前分压比: {config.r1 > 0 && config.r2 > 0
              ? `${((config.r1 + config.r2) / config.r2).toFixed(2)}`
              : "—"}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/components/voltage-config-drawer.tsx
git commit -m "feat(watering): create VoltageConfigDrawer component"
```

---

### Task 5: Add voltage config section to DeviceEditor

**Files:**
- Modify: `app/watering/components/device-editor.tsx`

- [ ] **Step 1: Import VoltageConfigDrawer**

Add the import at the top of `device-editor.tsx`, after the existing imports (after line 27):

```typescript
import { VoltageConfigDrawer } from "./voltage-config-drawer";
```

- [ ] **Step 2: Add voltage config drawer state**

In the `DeviceEditor` function body, add drawer state after the existing drawer states (after line 61):

```typescript
  const [voltageConfigVisible, setVoltageConfigVisible] = useState(false);
```

- [ ] **Step 3: Add voltage config form section**

Add a new section in the JSX, after the basic settings form (the closing `</div>` of the basic settings at line 357) and before the process table section (line 360). Insert this block:

```typescript

      {/* ---- 电压检测配置 ---- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: 6,
          border: "1px solid #f0f0f0",
        }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>电压检测配置</span>
          {form.voltageConfig ? (
            <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>
              {form.voltageConfig.sensor} · R1={form.voltageConfig.r1}Ω · R2={form.voltageConfig.r2}Ω
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#ccc", marginLeft: 8 }}>
              未配置
            </span>
          )}
        </div>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => setVoltageConfigVisible(true)}
        >
          {form.voltageConfig ? "修改" : "配置"}
        </Button>
      </div>
```

- [ ] **Step 4: Add the VoltageConfigDrawer to the JSX**

Add the drawer component in the JSX, after all existing drawers (after line 565, before the closing `</div>` on line 567):

```typescript

      {/* 电压检测配置 Drawer (60%) */}
      <VoltageConfigDrawer
        open={voltageConfigVisible}
        voltageConfig={form.voltageConfig}
        sensors={gpio.sensors}
        onChange={(vc) => setForm({ ...form, voltageConfig: vc })}
        onClose={() => setVoltageConfigVisible(false)}
      />
```

- [ ] **Step 5: Update `handleSave` to include `voltageConfig`**

In the `handleSave` function (around line 67-75), add `voltageConfig` to the data passed to `onSave`:

```typescript
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
        voltageConfig: form.voltageConfig,
      });
      message.success("保存成功");
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add app/watering/components/device-editor.tsx
git commit -m "feat(watering): add voltage config section to DeviceEditor"
```

---

### Task 6: Update DeviceCard with calculated voltage and enhanced process buttons

**Files:**
- Modify: `app/watering/components/device-card.tsx`

- [ ] **Step 1: Replace simple voltage display with calculated voltage**

Replace the existing voltage calculation (lines 25-29) with one that uses `voltageConfig`:

```typescript
  // 电压计算：使用分压公式 V_actual = V_sensor * (R1 + R2) / R2
  const voltageConfig = device.voltageConfig;
  const rawVoltage = voltageConfig?.sensor
    ? (device.state?.sensors?.[voltageConfig.sensor] as number | undefined)
    : (device.state?.sensors?.voltage_0 as number | undefined);

  const voltage =
    typeof rawVoltage === "number"
      ? voltageConfig && voltageConfig.r1 > 0 && voltageConfig.r2 > 0
        ? rawVoltage * ((voltageConfig.r1 + voltageConfig.r2) / voltageConfig.r2)
        : rawVoltage
      : undefined;
```

- [ ] **Step 2: Update the voltage display to show calculated value with annotation**

In the JSX where voltage is displayed (lines 134-139), update to show whether it's a calculated value:

```typescript
        {voltage !== undefined && (
          <Col span={12}>
            <span style={{ color: "#999", fontSize: 12 }}>电压: </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {voltage.toFixed(2)}V
            </span>
            {voltageConfig && (
              <span style={{ fontSize: 10, color: "#bbb", marginLeft: 2 }}>
                (计算)
              </span>
            )}
          </Col>
        )}
```

Also update the `Col` span for the chip info — when voltage is shown, chip takes `span={12}`, otherwise `span={16}`. This logic already exists (line 130), so no change needed.

- [ ] **Step 3: Add Dropdown-based multi-function process buttons**

Replace the existing process button grid (lines 169-204) with a version that adds a dropdown menu to each process button. First, add the `Dropdown` import at the top (line 3, add to the antd imports):

```typescript
import { Card, Tag, Button, Row, Col, message, Popconfirm, Dropdown } from "antd";
```

Add icons needed for the dropdown menu items. Update the icon imports (line 4-10):

```typescript
import {
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
```

Now replace the entire process button grid section (lines 169-204):

```typescript
      {/* 流程快捷按钮 — 匹配 IotCard 的 2 列网格，带多功能下拉菜单 */}
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
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: "exec",
                            icon: exec ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
                            label: exec ? "终止" : "执行",
                            danger: exec,
                            disabled: !exec && device.idleSleep,
                            onClick: () => onClickSwitch(idx),
                          },
                          {
                            key: "edit",
                            icon: <SettingOutlined />,
                            label: "编辑流程",
                            onClick: () =>
                              router.push(
                                `/watering/devices/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`
                              ),
                          },
                        ],
                      }}
                      trigger={["contextMenu", "click"]}
                    >
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
                        style={{ marginBottom: 2 }}
                      >
                        {exec ? "运行中: " : ""}
                        {processes[idx].name}
                      </Button>
                    </Dropdown>
                  </Col>
                );
              })}
            </Row>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/device-card.tsx
git commit -m "feat(watering): add calculated voltage display and multi-function process dropdowns"
```

---

### Task 7: Integration verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Verify TypeScript compilation**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -50
```

Expected: No new TypeScript errors related to the watering module.

- [ ] **Step 2: Start the dev server and verify the pages render**

```bash
# Start dev server (if not already running)
# Visit http://localhost:3000/watering
# Verify:
#   - Device list shows voltage (calculated if voltageConfig exists, raw otherwise)
#   - Process buttons show dropdown on click/right-click with "执行"/"终止" and "编辑流程"
#   - Click a device's "配置" button → navigates to devices/[chipId]
#   - Voltage config section visible with current config summary
#   - Click "配置" or "修改" → drawer opens
#   - Drawer shows sensor selector, R1/R2 number inputs with defaults 30k/10k
#   - Formula preview updates as values change
#   - Save works and voltage appears on list after refresh
```

- [ ] **Step 3: Commit any fixes found during verification**

```bash
git add -A
git commit -m "chore(watering): verification fixes for voltage config feature"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Covered By |
|-------------|------------|
| 列表展示电压 | Task 6 — DeviceCard voltage display with calculated value |
| 流程的多功能按钮 | Task 6 — Dropdown menu on each process button (执行/终止/编辑流程) |
| 电压检测配置抽屉 | Task 4 — VoltageConfigDrawer component |
| 选择传感器 | Task 4 — Select dropdown from gpio.sensors |
| R1 阻值数字输入，默认 30k | Task 4 — InputNumber, default 30000Ω |
| R2 阻值数字输入，默认 10k | Task 4 — InputNumber, default 10000Ω |
| 界面参考 ListView.vue | Task 6 — Dropdown pattern, 2-column grid matching existing IotCard style |

### 2. Placeholder Scan
No TBD, TODO, or "implement later" found. All steps contain complete code.

### 3. Type Consistency
- `VoltageConfig` defined in Task 1 with `sensor: string, r1: number, r2: number` → used consistently in Tasks 4, 5, 6
- `DeviceConfig.voltageConfig?: VoltageConfig` → used in Tasks 2 (DB), 3 (hook), 5 (editor), 6 (card)
- `gpio.sensors: string[]` → passed to `VoltageConfigDrawer` in Task 5, consumed in Task 4
