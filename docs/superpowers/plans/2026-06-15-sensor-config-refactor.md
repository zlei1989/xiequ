# 传感器配置重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单一电压检测配置（`voltage`）替换为通用传感器配置数组（`sensors`），支持数字信号、模拟信号（电阻分压/温感电阻转换），配置项可拖拽排序，设备卡片按类型展示。

**Architecture:** 自底向上重构 — 先改类型定义，再改数据库和计算层，最后改 UI 层。计算函数 `calcSensorReadings` 抽取为纯函数放到 `utils/calc-sensor.ts`，方便测试。

**Tech Stack:** TypeScript + React + antd-mobile + @dnd-kit + SQLite（sql.js WASM）+ vitest + @testing-library/react

---

### Task 1: 类型定义 — 新增 SensorConfig，更新 DeviceConfig / LogItem

**Files:**
- Modify: `app/watering/types.ts`

**Purpose:** 定义新的传感器配置类型，替换旧的 voltage 字段。

- [ ] **Step 1: 新增 SensorConfig 类型，标记 VoltageConfig 为 @deprecated，更新 DeviceConfig 和 LogItem**

在 `types.ts` 末尾新增类型，修改现有类型：

```typescript
// 在 VoltageConfig 上方新增：

/** 传感器配置 — 单个传感器检测参数 */
export type SensorConfig = {
  /** 感应名称，如 "电池电压"、"土壤湿度" */
  name: string;
  /** 传感器引脚名，如 "sensor_0" */
  sensor: string;
  /** 信号类型 */
  type: 'digital' | 'analog';
  /** 转换类型（仅模拟信号可选），不选则直接显示 ADC 原始值 */
  conversion?: 'resistor_divider' | 'ntc_10k';
  /** NTC B 值 3435 或 3950（仅 ntc_10k 显示，默认 3435） */
  bValue?: 3435 | 3950;
  /** 上拉电阻 R1（Ω），仅 resistor_divider 显示，默认 30000 */
  r1?: number;
  /** 下拉电阻 R2（Ω），仅 resistor_divider 显示，默认 10000 */
  r2?: number;
};
```

修改 VoltageConfig（加 @deprecated）：

```typescript
/** 电压检测配置 — 分压电阻参数，用于计算实际电压
 * @deprecated 使用 SensorConfig[] 替代，将在后续版本移除
 */
export type VoltageConfig = {
  sensor: string;
  r1: number;
  r2: number;
};
```

修改 DeviceConfig.voltage → sensors：

```typescript
// device config 中
// - voltage?: VoltageConfig;
// + sensors: SensorConfig[];
```

修改 LogItem（在 log-card.tsx 中的导出类型）：

```typescript
// LogItem 中
// - voltage?: number;
// + readings?: { label: string; value: number }[];
```

- [ ] **Step 2: 运行类型检查确认无编译错误**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

预期：会有其他文件引用 `voltage` 导致的类型错误（后续任务逐一修复）。

- [ ] **Step 3: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat(types): add SensorConfig type, deprecate VoltageConfig"
```

---

### Task 2: 传感器计算函数 — 抽取纯函数到 utils

**Files:**
- Create: `app/watering/utils/calc-sensor.ts`
- Create: `__tests__/watering/calc-sensor.test.ts`

**Purpose:** 将传感器值计算逻辑抽取为纯函数，方便测试。`db.ts` 后续直接导入。

- [ ] **Step 1: 编写测试**

创建 `__tests__/watering/calc-sensor.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { calcSensorReadings } from '@/app/watering/utils/calc-sensor';
import type { SensorConfig } from '@/app/watering/types';

describe('calcSensorReadings', () => {
  const sensorValues = { sensor_0: 2048, sensor_1: 0, sensor_2: 4095 };

  it('空配置数组返回空 readings', () => {
    expect(calcSensorReadings([], sensorValues)).toEqual([]);
  });

  it('sensorValues 为 undefined 返回空 readings', () => {
    const configs: SensorConfig[] = [
      { name: '测试', sensor: 'sensor_0', type: 'digital' },
    ];
    expect(calcSensorReadings(configs, undefined)).toEqual([]);
  });

  it('数字信号 — 高电平', () => {
    const configs: SensorConfig[] = [
      { name: '按钮', sensor: 'sensor_0', type: 'digital' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '按钮', value: 1 }]);
  });

  it('数字信号 — 低电平', () => {
    const configs: SensorConfig[] = [
      { name: '按钮', sensor: 'sensor_1', type: 'digital' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '按钮', value: 0 }]);
  });

  it('模拟信号无转换 — 显示 ADC 原始值', () => {
    const configs: SensorConfig[] = [
      { name: '湿度', sensor: 'sensor_0', type: 'analog' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '湿度', value: 2048 }]);
  });

  it('电阻分压器 — 计算实际电压', () => {
    const configs: SensorConfig[] = [
      { name: '电池', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 30000, r2: 10000 },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    // V_sensor = 2048/4095*3.3 ≈ 1.6505, V_actual = 1.6505 * 4 ≈ 6.60
    expect(result[0]?.label).toBe('电池');
    expect(result[0]?.value).toBeCloseTo(6.60, 1);
  });

  it('电阻分压器 — R1/R2 为 0 时不应用分压比', () => {
    const configs: SensorConfig[] = [
      { name: '电池', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 0, r2: 10000 },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    // 不应用分压比，直接 V_sensor = 2048/4095*3.3 ≈ 1.65
    expect(result[0]?.value).toBeCloseTo(1.65, 1);
  });

  it('温感电阻 NTC 10K — 计算温度', () => {
    const configs: SensorConfig[] = [
      { name: '温度', sensor: 'sensor_0', type: 'analog', conversion: 'ntc_10k', bValue: 3435 },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result[0]?.label).toBe('温度');
    // V_adc = 1.6505, R_ntc = 10000*1.6505/1.6495 ≈ 10006
    // T(K) = 1/(1/298.15 + ln(1.0006)/3435) ≈ 298.10, T(°C) ≈ 24.9
    expect(typeof result[0]?.value).toBe('number');
    expect(result[0]!.value).toBeGreaterThan(20);
    expect(result[0]!.value).toBeLessThan(30);
  });

  it('传感器引脚数据缺失时 value 为 0', () => {
    const configs: SensorConfig[] = [
      { name: '缺失', sensor: 'sensor_missing', type: 'analog' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '缺失', value: 0 }]);
  });

  it('多个传感器同时计算', () => {
    const configs: SensorConfig[] = [
      { name: '电压', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 30000, r2: 10000 },
      { name: '按钮', sensor: 'sensor_1', type: 'digital' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toHaveLength(2);
    expect(result[0]?.label).toBe('电压');
    expect(result[1]?.label).toBe('按钮');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/calc-sensor.test.ts
```

预期：FAIL — 模块不存在。

- [ ] **Step 3: 实现 calcSensorReadings**

创建 `app/watering/utils/calc-sensor.ts`：

```typescript
/**
 * 传感器读数计算工具
 *
 * 根据传感器配置和原始 ADC 读数，计算每个传感器的显示值。
 * 纯函数，无副作用，可独立测试。
 */

import type { SensorConfig } from '../types';

/**
 * 根据传感器配置和原始读数计算所有传感器的显示值
 *
 * @param configs - 传感器配置数组
 * @param sensorValues - 原始传感器读数（引脚名 → ADC 值）
 * @returns 传感名称和计算值数组，数据缺失时 value 为 0
 */
export function calcSensorReadings(
  configs: SensorConfig[],
  sensorValues: Record<string, number> | undefined,
): { label: string; value: number }[] {
  if (!configs.length || !sensorValues) return [];

  return configs.map((config) => {
    const raw = sensorValues[config.sensor];
    if (typeof raw !== 'number') return { label: config.name, value: 0 };

    // 数字信号 — 高/低电平
    if (config.type === 'digital') {
      return { label: config.name, value: raw > 0 ? 1 : 0 };
    }

    // 模拟信号
    if (config.conversion === 'resistor_divider') {
      /** ADC 原始值换算为引脚电压（3.3V 参考电压，ESP32 12 位分辨率 0~4095） */
      const vSensor = (raw / 4095) * 3.3;
      const r1 = config.r1 ?? 30000;
      const r2 = config.r2 ?? 10000;
      /** 通过分压比反推实际电压：V_actual = V_sensor × (R1 + R2) / R2 */
      const value = r1 > 0 && r2 > 0 ? vSensor * ((r1 + r2) / r2) : vSensor;
      return { label: config.name, value: Math.round(value * 100) / 100 };
    }

    if (config.conversion === 'ntc_10k') {
      /** 引脚电压 — ADC 换算 */
      const vAdc = (raw / 4095) * 3.3;
      /** NTC 电阻值 — 分压公式反算：R_ntc = R_series × V_adc / (V_ref - V_adc) */
      const rNtc = 10000 * vAdc / (3.3 - vAdc);
      const B = config.bValue ?? 3435;
      /** 开尔文温度 — B 值公式：1/T = 1/T0 + ln(R/R0)/B */
      const tempK = 1 / (1 / 298.15 + Math.log(rNtc / 10000) / B);
      /** 摄氏度 */
      const tempC = tempK - 273.15;
      return { label: config.name, value: Math.round(tempC * 10) / 10 };
    }

    // 无转换 — 直接返回 ADC 原始值
    return { label: config.name, value: raw };
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/watering/calc-sensor.test.ts
```

预期：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add app/watering/utils/calc-sensor.ts __tests__/watering/calc-sensor.test.ts
git commit -m "feat(calc-sensor): add calcSensorReadings utility with tests"
```

---

### Task 3: 数据库层 — 列变更 + adapt writeDeviceLog / getDeviceLogs

**Files:**
- Modify: `app/watering/services/db.ts`

**Purpose:** 数据库 schema 更新，`writeDeviceLog` 签名从 `voltage` 改为 `readings`，`getDeviceLogs` 返回 `readings`，废弃 `calcVoltage`，导入 `calcSensorReadings`。

- [ ] **Step 1: 修改 initDb — 添加 sensors/readings 列，删除 voltage 列**

`initDb()` 中修改 `watering_devices` 建表语句：

```sql
-- voltage JSON,          ← 删除这行
sensors JSON NOT NULL DEFAULT '[]',
```

删除之前为旧数据库添加 voltage 列的 ALTER TABLE（`ALTER TABLE watering_devices ADD COLUMN voltage JSON` 整个 try/catch 块）。

在 `initDb()` 末尾添加 sensors 列迁移（兼容旧数据库）和 voltage 列删除：

```typescript
// ---- voltage → sensors 迁移 ----

// 为旧数据库添加 sensors 列
try {
  db.exec('ALTER TABLE watering_devices ADD COLUMN sensors JSON NOT NULL DEFAULT \'[]\'');
} catch {
  // 列已存在，忽略
}

// 删除旧 voltage 列
try {
  db.exec('ALTER TABLE watering_devices DROP COLUMN voltage');
} catch {
  // 列不存在或 SQLite 版本不支持，忽略
}
```

修改 `watering_logs` 建表语句：

```sql
-- voltage REAL NOT NULL DEFAULT 0,   ← 删除
readings JSON,
```

删除 `voltage` 列的 ALTER TABLE 迁移（`ALTER TABLE watering_logs ADD COLUMN voltage REAL NOT NULL DEFAULT 0` 整个 try/catch 块）。

在 `initDb()` 末尾添加 readings 列迁移和 voltage 列删除：

```typescript
// 为旧日志表添加 readings 列
try {
  db.exec('ALTER TABLE watering_logs ADD COLUMN readings JSON');
} catch {
  // 列已存在，忽略
}

// 删除旧 voltage 列
try {
  db.exec('ALTER TABLE watering_logs DROP COLUMN voltage');
} catch {
  // 列不存在或 SQLite 版本不支持，忽略
}
```

- [ ] **Step 2: 修改 DeviceRow / JoinRow — 适配新列名**

```typescript
interface DeviceRow {
  // ...
  // voltage: string | null;       ← 删除
  sensors: string;                 // ← 新增
  // ...
}
```

```typescript
interface JoinRow extends DeviceRow {
  // ... (JOIN 列不变)
}
```

- [ ] **Step 3: 修改 LogRow — voltage → readings**

```typescript
interface LogRow {
  // ...
  // voltage: number;              ← 删除
  readings: string | null;         // ← 新增
  // ...
}
```

- [ ] **Step 4: 修改 getAllDevices — SQL 和映射**

SQL 中 `d.voltage` → `d.sensors`：

```sql
-- d.voltage,                     ← 删除
d.sensors,                         -- ← 新增
```

映射中：

```typescript
// voltage: parseJSON(row.voltage, undefined as DeviceConfig['voltage']),  ← 删除
sensors: parseJSON(row.sensors, [] as DeviceConfig['sensors']),            // ← 新增
```

- [ ] **Step 5: 修改 getDeviceConfig — SQL 和映射**

SQL 不变（`SELECT *`），映射中：

```typescript
// voltage: parseJSON(row.voltage, undefined as DeviceConfig['voltage']),  ← 删除
sensors: parseJSON(row.sensors, [] as DeviceConfig['sensors']),            // ← 新增
```

- [ ] **Step 6: 修改 saveDeviceConfig — SQL 参数**

INSERT/UPDATE SQL 中 `@voltage` → `@sensors`，参数绑定：

```typescript
// '@voltage': config.voltage ? JSON.stringify(config.voltage) : null,  ← 删除
'@sensors': JSON.stringify(config.sensors),                               // ← 新增
```

- [ ] **Step 7: 修改 writeDeviceLog — 签名和实现**

函数签名：

```typescript
export async function writeDeviceLog(
  chipId: string,
  event: string,
  macAddress: string,
  state?: Record<string, unknown>,
  // voltage?: number,                         ← 删除
  readings?: { label: string; value: number }[],  // ← 新增
  stateId?: string,
  message?: string,
)
```

INSERT SQL：

```sql
INSERT INTO watering_logs (chip_id, mac_address, event, state_id, message, state, readings, created_time)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

参数绑定：

```typescript
[
  chipId,
  macAddress,
  event,
  stateId ?? null,
  message ?? null,
  state ? JSON.stringify(state) : null,
  readings ? JSON.stringify(readings) : null,  // voltage ?? 0 → readings JSON
  new Date().toISOString(),
]
```

- [ ] **Step 8: 修改 getDeviceLogs — SQL 和映射**

SQL 中 `voltage` → `readings`：

```sql
-- voltage,                ← 删除
readings,                  -- ← 新增
```

映射中：

```typescript
// voltage: typeof row.voltage === 'number' ? row.voltage : undefined,  ← 删除
readings: parseJSON(row.readings, undefined as { label: string; value: number }[] | undefined),  // ← 新增
```

- [ ] **Step 9: 标记 calcVoltage 为 @deprecated，添加 calcSensorReadings 导入和 re-export**

在文件顶部添加导入：

```typescript
import { calcSensorReadings } from '../utils/calc-sensor';
```

为 `calcVoltage` 添加 `@deprecated` 注释（不删除，push-state 后续任务切换后用不到）。

添加 re-export：

```typescript
export { calcSensorReadings };
```

- [ ] **Step 10: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

预期：仍有 push-state、device-card 等文件的类型错误（后续任务修复）。

- [ ] **Step 11: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat(db): migrate voltage columns to sensors/readings, adapt writeDeviceLog"
```

---

### Task 4: push-state API — calcVoltage → calcSensorReadings

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

**Purpose:** push-state 路由适配新的 `writeDeviceLog` 签名和 `calcSensorReadings`。

- [ ] **Step 1: 更新导入**

```typescript
import { ..., calcSensorReadings } from '@/app/watering/services/db';
// 删除 calcVoltage 导入
```

- [ ] **Step 2: 替换所有调用点**

每个事件分支中，将：

```typescript
const xxxVoltage = calcVoltage(config?.voltage, gpioState.sensors);
```

替换为：

```typescript
const xxxReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
```

将各 `writeDeviceLog` 调用中的 `voltage` 参数替换为 `readings`：

bootstrap 分支（第 41 行附近）：

```typescript
// 替换 calcVoltage → calcSensorReadings
const bootstrapReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);

// writeDeviceLog 调用中 voltage 参数名改为 readings
await writeDeviceLog(chipId, 'bootstrap', macAddress, {
  cause: searchParams.get('cause') || '',
  sensors: gpioState.sensors,
  loads: gpioState.loads,
}, bootstrapReadings, state.stateId);  // ← bootstrapVoltage → bootstrapReadings
```

第二处 writeDeviceLog（execute 日志，第 117 行）：

```typescript
await writeDeviceLog(chipId, 'execute', macAddress, {
  index: state.index,
}, bootstrapReadings, state.stateId);  // ← bootstrapVoltage → bootstrapReadings
```

change 分支（第 122 行附近）：

```typescript
const changeReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
await writeDeviceLog(chipId, 'change', macAddress, {
  sensors: gpioState.sensors,
  loads: gpioState.loads,
  type,
  stepIndex: stepIndex ?? undefined,
}, changeReadings, stateId, message);  // ← changeVoltage → changeReadings
```

finish 分支（第 142 行附近）：

```typescript
const finishReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
await writeDeviceLog(chipId, 'finish', macAddress, undefined, finishReadings, state?.stateId);
```

default 分支（第 162 行附近）：

```typescript
const defaultReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
await writeDeviceLog(chipId, event || 'heartbeat', macAddress, {
  sensors: gpioState.sensors,
  loads: gpioState.loads,
}, defaultReadings);
```

- [ ] **Step 3: 删除 defaultValue 中 `voltage: undefined`**

bootstrap 自动创建配置中（第 48-63 行）：

```typescript
// voltage: undefined,  ← 删除
sensors: [],             // ← 新增
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

预期：device-config-form、device-card、log-card、use-device-config 仍有类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat(push-state): use calcSensorReadings and readings in logs"
```

---

### Task 5: use-device-config — parseJsonVoltage → parseJsonSensors

**Files:**
- Modify: `app/watering/hooks/use-device-config.ts`

**Purpose:** 安全解析逻辑从 voltage 切换到 sensors。

- [ ] **Step 1: 替换解析函数**

删除 `parseJsonVoltage` 函数（第 35-56 行），新增 `parseJsonSensors`：

```typescript
/** 安全解析 sensors 配置数组 — 支持数组或 JSON 字符串两种格式 */
function parseJsonSensors(v: unknown): DeviceConfig['sensors'] {
  if (Array.isArray(v)) return v as DeviceConfig['sensors'];
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? (parsed as DeviceConfig['sensors']) : [];
    } catch {
      return [];
    }
  }
  return [];
}
```

- [ ] **Step 2: 更新 load 回调中的解析调用**

```typescript
// voltage: parseJsonVoltage(raw.voltage),  ← 删除
sensors: parseJsonSensors(raw.sensors),     // ← 新增
```

- [ ] **Step 3: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add app/watering/hooks/use-device-config.ts
git commit -m "feat(hooks): parse sensors array instead of voltage config"
```

---

### Task 6: SensorConfigPicker — 新建传感器配置编辑组件

**Files:**
- Create: `app/watering/components/sensor-config-picker.tsx`
- Create: `__tests__/watering/components/sensor-config-picker.test.tsx`

**Purpose:** 替代 VoltageConfigPicker，支持多传感器列表（拖拽排序）+ 单传感器编辑（两层 Popup）。

- [ ] **Step 1: 编写测试**

创建 `__tests__/watering/components/sensor-config-picker.test.tsx`：

```typescript
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { SensorConfigPicker } from '@/app/watering/components/sensor-config-picker';
import type { SensorConfig } from '@/app/watering/types';

const mockGpio = { loads: [], sensors: ['sensor_0', 'sensor_1'], buttons: [] };

describe('SensorConfigPicker', () => {
  it('关闭时渲染空内容', () => {
    const { container } = render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={false}
        sensors={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeDefined();
  });

  it('打开时渲染标题', () => {
    render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={true}
        sensors={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('传感器配置').length).toBeGreaterThan(0);
  });

  it('空传感器列表时显示空状态', () => {
    render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={true}
        sensors={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('暂无传感器').length).toBeGreaterThan(0);
  });

  it('已有传感器时显示列表项', () => {
    const sensors: SensorConfig[] = [
      { name: '电池', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 30000, r2: 10000 },
    ];
    render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={true}
        sensors={sensors}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('电池').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/watering/components/sensor-config-picker.test.tsx
```

预期：FAIL — 模块不存在。

- [ ] **Step 3: 实现 SensorConfigPicker 组件**

创建 `app/watering/components/sensor-config-picker.tsx`：

```typescript
/**
 * 传感器配置 Picker — 管理多个传感器配置项的列表（拖拽排序）和单项编辑
 *
 * 两层 Popup 结构：
 * - 列表层（70vh）：SortableList + SwipeAction 删除 + 拖拽排序 + 添加按钮
 * - 编辑层（60vh）：Form 表单，根据 signalType 和 conversion 动态显示字段
 * 使用 antd-mobile Form/Popup/NavBar/Selector/Stepper/Input/SwipeAction + @dnd-kit
 */

'use client';

import { arrayMove } from '@dnd-kit/sortable';
import {
  Popup,
  NavBar,
  Selector,
  Stepper,
  Form,
  Card,
  ErrorBlock,
  Button,
  Input,
  List,
  SwipeAction,
  Dialog,
} from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';
import React, { useState } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import { SortableList } from './sortable-list';

import type { SensorConfig } from '../types';

interface SensorConfigPickerProps {
  open: boolean;
  sensors: SensorConfig[];
  gpio: GpioInfo;
  onChange: (configs: SensorConfig[]) => void;
  onClose: () => void;
  /** Popup 关闭动画完成后的清理回调 */
  afterClose?: () => void;
}

/** 默认传感器配置 */
function defaultSensor(gpio: GpioInfo): SensorConfig {
  return {
    name: '',
    sensor: gpio.sensors[0] ?? 'sensor_0',
    type: 'analog',
  };
}

/** 类型中文标签映射 */
const typeLabels: Record<string, string> = {
  digital: '数字',
  analog: '模拟',
};

/** 转换类型中文标签映射 */
const conversionLabels: Record<string, string> = {
  resistor_divider: '分压',
  ntc_10k: '温感',
};

/** 生成列表项摘要 */
function sensorSummary(s: SensorConfig): string {
  const parts = [s.sensor, typeLabels[s.type] ?? s.type];
  if (s.conversion && conversionLabels[s.conversion]) {
    parts.push(conversionLabels[s.conversion]);
  }
  return parts.join(' · ');
}

export function SensorConfigPicker({
  open,
  sensors,
  gpio,
  onChange,
  onClose,
  afterClose,
}: SensorConfigPickerProps) {
  const [editVisible, setEditVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  // 编辑中的传感器副本
  const [editConfig, setEditConfig] = useState<SensorConfig>(defaultSensor(gpio));

  useBackButton(open && !editVisible, onClose);

  /** 打开编辑层 — 新增（-1）或编辑已有项 */
  function openEdit(index: number) {
    setEditIndex(index);
    setEditConfig(index >= 0 ? { ...sensors[index]! } : defaultSensor(gpio));
    setEditVisible(true);
  }

  /** 确认编辑 — 保存到列表并关闭编辑层 */
  function confirmEdit() {
    const updated = [...sensors];
    if (editIndex >= 0) {
      updated[editIndex] = editConfig;
    } else {
      updated.push(editConfig);
    }
    onChange(updated);
    setEditVisible(false);
    setEditIndex(-1);
  }

  /** 删除传感器 */
  function deleteSensor(index: number) {
    const updated = sensors.filter((_, i) => i !== index);
    onChange(updated);
  }

  /** 编辑层局部更新 */
  function updateEdit(partial: Partial<SensorConfig>) {
    setEditConfig({ ...editConfig, ...partial });
  }

  const sensorOptions = gpio.sensors.map((k) => ({ label: k, value: k }));

  return (
    <>
      {/* ========== 列表层 Popup ========== */}
      <Popup
        afterClose={afterClose}
        bodyStyle={{ height: '70vh' }}
        closeOnMaskClick={true}
        position="bottom"
        visible={open}
        onClose={onClose}
        onMaskClick={onClose}
      >
        <NavBar onBack={onClose}>传感器配置</NavBar>
        <div style={{ overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
          <SortableList
            emptyText="暂无传感器"
            getKey={(s, i) => (s as SensorConfig).sensor + String(i)}
            header="已配置传感器"
            items={sensors}
            renderItem={(sensor, index) => (
              <SwipeAction
                rightActions={[
                  {
                    key: 'delete',
                    text: '删除',
                    color: 'danger',
                    onClick: () => {
                      void Dialog.confirm({ title: '确认删除此传感器？' }).then((confirmed) => {
                        if (confirmed) deleteSensor(index);
                      });
                    },
                  },
                ]}
              >
                <List.Item
                  clickable
                  description={sensorSummary(sensor)}
                  onClick={() => { openEdit(index); }}
                >
                  {sensor.name || '未命名'}
                </List.Item>
              </SwipeAction>
            )}
            onReorder={(from, to) => {
              onChange(arrayMove(sensors, from, to));
            }}
          />
          <div className="p-2">
            <Button block size="small" onClick={() => { openEdit(-1); }}>
              <AddOutline /> 添加传感器
            </Button>
          </div>
        </div>
      </Popup>

      {/* ========== 编辑层 Popup ========== */}
      <Popup
        bodyStyle={{ height: '60vh' }}
        closeOnMaskClick={false}
        position="bottom"
        visible={editVisible}
        onClose={() => { setEditVisible(false); }}
      >
        <NavBar onBack={() => { setEditVisible(false); }}>
          {editIndex >= 0 ? '编辑传感器' : '添加传感器'}
        </NavBar>
        <div style={{ overflowY: 'auto', height: 'calc(60vh - 45px)' }}>
          <Form layout="vertical">
            {/* 感应名称 */}
            <Form.Item label="感应名称">
              <Input
                placeholder="如：电池电压"
                value={editConfig.name}
                onChange={(v) => { updateEdit({ name: v }); }}
              />
            </Form.Item>

            {/* 传感器引脚 */}
            <Form.Item label="传感器引脚">
              {sensorOptions.length > 0 ? (
                <Selector
                  options={sensorOptions}
                  value={[editConfig.sensor]}
                  onChange={(vals) => {
                    if (vals.length > 0) updateEdit({ sensor: vals[0]! });
                  }}
                />
              ) : (
                <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用传感器" />
              )}
            </Form.Item>

            {/* 信号类型 */}
            <Form.Item label="信号类型">
              <Selector
                options={[
                  { label: '数字信号', value: 'digital' },
                  { label: '模拟信号', value: 'analog' },
                ]}
                value={[editConfig.type]}
                onChange={(vals) => {
                  if (vals.length > 0) {
                    const type = vals[0] as SensorConfig['type'];
                    // 切换为数字信号时清除转换相关字段
                    const partial: Partial<SensorConfig> = { type };
                    if (type === 'digital') {
                      partial.conversion = undefined;
                      partial.r1 = undefined;
                      partial.r2 = undefined;
                      partial.bValue = undefined;
                    }
                    updateEdit(partial);
                  }
                }}
              />
            </Form.Item>

            {/* 转换类型（仅模拟信号） */}
            {editConfig.type === 'analog' && (
              <>
                <Form.Item label="转换">
                  <Selector
                    options={[
                      { label: '无', value: '' },
                      { label: '电阻分压器', value: 'resistor_divider' },
                      { label: '温感电阻10K', value: 'ntc_10k' },
                    ]}
                    value={[editConfig.conversion ?? '']}
                    onChange={(vals) => {
                      if (vals.length > 0) {
                        const conversion = (vals[0] || undefined) as SensorConfig['conversion'];
                        updateEdit({ conversion });
                      }
                    }}
                  />
                </Form.Item>

                {/* 公式 help */}
                {editConfig.conversion === 'resistor_divider' && (
                  <Card title="计算公式">
                    <div className="text-xs text-gray-500">
                      <div>
                        V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
                      </div>
                      <div className="mt-1">
                        V<sub>传感器</sub> = ADC / 4095 × 3.3V
                      </div>
                      <div className="mt-1">
                        分压比: {(editConfig.r1 ?? 30000) > 0 && (editConfig.r2 ?? 10000) > 0
                          ? (((editConfig.r1 ?? 30000) + (editConfig.r2 ?? 10000)) / (editConfig.r2 ?? 10000)).toFixed(2)
                          : '—'}
                      </div>
                    </div>
                  </Card>
                )}

                {editConfig.conversion === 'ntc_10k' && (
                  <Card title="计算公式">
                    <div className="text-xs text-gray-500">
                      <div>
                        R<sub>NTC</sub> = 10KΩ × V<sub>ADC</sub> / (3.3V - V<sub>ADC</sub>)
                      </div>
                      <div className="mt-1">
                        T(K) = 1 / (1/298.15 + ln(R<sub>NTC</sub>/10000)/B)
                      </div>
                      <div className="mt-1">
                        T(°C) = T(K) - 273.15
                      </div>
                    </div>
                  </Card>
                )}

                {/* R1 / R2（仅电阻分压器） */}
                {editConfig.conversion === 'resistor_divider' && (
                  <>
                    <Form.Item help="上拉电阻 R1，上拉至被测电压。默认 30kΩ" label="R1 电阻值 (Ω)">
                      <Stepper
                        min={0}
                        step={1000}
                        value={editConfig.r1 ?? 30000}
                        onChange={(v) => { updateEdit({ r1: v }); }}
                      />
                    </Form.Item>

                    <Form.Item help="下拉电阻 R2，下拉至 GND。默认 10kΩ" label="R2 电阻值 (Ω)">
                      <Stepper
                        min={0}
                        step={1000}
                        value={editConfig.r2 ?? 10000}
                        onChange={(v) => { updateEdit({ r2: v }); }}
                      />
                    </Form.Item>
                  </>
                )}

                {/* B 值（仅温感电阻） */}
                {editConfig.conversion === 'ntc_10k' && (
                  <Form.Item
                    help="NTC 热敏电阻 B 值常数，不同品牌不同。常见值 3435/3950"
                    label="B 值"
                  >
                    <Selector
                      options={[
                        { label: '3435', value: 3435 },
                        { label: '3950', value: 3950 },
                      ]}
                      value={[editConfig.bValue ?? 3435]}
                      onChange={(vals) => {
                        if (vals.length > 0) updateEdit({ bValue: vals[0] as 3435 | 3950 });
                      }}
                    />
                  </Form.Item>
                )}
              </>
            )}
          </Form>

          {/* 确认按钮 */}
          <div className="p-4">
            <Button block color="primary" onClick={confirmEdit}>
              确认
            </Button>
          </div>
        </div>
      </Popup>
    </>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/watering/components/sensor-config-picker.test.tsx
```

预期：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/sensor-config-picker.tsx __tests__/watering/components/sensor-config-picker.test.tsx
git commit -m "feat(picker): add SensorConfigPicker replacing VoltageConfigPicker"
```

---

### Task 7: device-config-form — 替换 voltage 入口为 sensors

**Files:**
- Modify: `app/watering/components/device-config-form.tsx`

**Purpose:** 表单中"电压检测配置"替换为"传感器配置"，接入 SensorConfigPicker。

- [ ] **Step 1: 更新导入**

```typescript
// - import { VoltageConfigPicker } from './voltage-config-picker';
// + import { SensorConfigPicker } from './sensor-config-picker';

// 类型导入中
// - import type { ..., VoltageConfig } from '../types';
// + import type { ..., SensorConfig } from '../types';
```

- [ ] **Step 2: 替换 voltage 状态和组件**

状态声明：

```typescript
// const [voltageVisible, setVoltageConfigVisible] = useState(false);  ← 删除
const [sensorVisible, setSensorVisible] = useState(false);              // ← 新增
```

handleSave 中：

```typescript
// voltage: form.voltage,  ← 删除
sensors: form.sensors,     // ← 新增
```

updateVoltage 函数 → 删除，新增 updateSensors：

```typescript
/** 更新传感器配置 — SensorConfigPicker onChange 回调 */
function updateSensors(configs: SensorConfig[]) {
  setForm({ ...form, sensors: configs });
}
```

- [ ] **Step 3: 替换表单项**

```tsx
{/* 替换 "电压检测配置" 行为 "传感器配置" */}
<Form.Item label="传感器配置" onClick={() => { setSensorVisible(true); }}>
  <span>
    {form.sensors.length > 0 ? `已配置 ${form.sensors.length} 项` : '未配置'}
  </span>
</Form.Item>
```

- [ ] **Step 4: 替换 Picker 组件**

```tsx
{/* - <VoltageConfigPicker ... /> */}
<SensorConfigPicker
  gpio={gpio}
  open={sensorVisible}
  sensors={form.sensors}
  onChange={updateSensors}
  onClose={() => { setSensorVisible(false); }}
/>
```

- [ ] **Step 5: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -10
```

- [ ] **Step 6: Commit**

```bash
git add app/watering/components/device-config-form.tsx
git commit -m "feat(config-form): replace VoltageConfigPicker with SensorConfigPicker"
```

---

### Task 8: device-card — 传感器展示区替换电压

**Files:**
- Modify: `app/watering/components/device-card.tsx`

**Purpose:** 移除电压计算和展示代码，新增传感器展示区。

- [ ] **Step 1: 添加 calcSensorReadings 导入**

```typescript
import { calcSensorReadings } from '../utils/calc-sensor';
```

- [ ] **Step 2: 删除电压计算逻辑（第 62-85 行），替换为传感器计算**

删除：

```typescript
const rawVoltage = device.voltage?.sensor
  ? device.state?.sensors?.[device.voltage.sensor]
  : device.state?.sensors?.voltage_0;

const voltage =
  typeof rawVoltage === 'number'
    ? device.voltage && device.voltage.r1 > 0 && device.voltage.r2 > 0
      ? (rawVoltage / 4095) * 3.3 *
        ((device.voltage.r1 + device.voltage.r2) / device.voltage.r2)
      : (rawVoltage / 4095) * 3.3
    : undefined;
```

新增：

```typescript
/** 传感器计算值 — 根据配置和原始读数生成展示数据 */
const sensorReadings =
  device.sensors.length > 0
    ? calcSensorReadings(device.sensors, device.state?.sensors)
    : [];
```

- [ ] **Step 3: 替换展示区域（第 270-284 行）**

删除原来的电压展示代码块，替换为传感器展示区：

```tsx
{/* 传感器展示 — 设备信息区下方 */}
{sensorReadings.length > 0 && (
  <div className="mb-2 border-t border-gray-100 pt-2">
    {sensorReadings.map((reading, idx) => {
      const config = device.sensors[idx];
      if (!config) return null;

      /** 根据类型格式化显示值 */
      function formatDisplay(): string {
        if (config.type === 'digital') {
          return reading.value > 0 ? '高电平' : '低电平';
        }
        if (config.conversion === 'resistor_divider') {
          return `${reading.value.toFixed(2)}V`;
        }
        if (config.conversion === 'ntc_10k') {
          return `${reading.value.toFixed(1)}°C`;
        }
        // 模拟信号无转换 — 显示 ADC 原始值
        return String(reading.value);
      }

      return (
        <div className="flex justify-between items-center py-0.5" key={`${config.sensor}-${idx}`}>
          <span className="text-xs text-gray-400">{config.name}</span>
          <span className="text-[13px] font-medium">
            {typeof reading.value === 'number' ? formatDisplay() : '—'}
          </span>
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -5
```

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/device-card.tsx
git commit -m "feat(device-card): replace voltage display with sensor readings section"
```

---

### Task 9: log-card — voltage → readings 适配

**Files:**
- Modify: `app/watering/components/log-card.tsx`

**Purpose:** 日志卡片从 `item.voltage` 改为 `item.readings` 数组展示。

- [ ] **Step 1: 更新 LogItem 类型**

```typescript
export type LogItem = {
  // ...
  // voltage?: number;                                              ← 删除
  readings?: { label: string; value: number }[];                   // ← 新增
  // ...
};
```

- [ ] **Step 2: 更新 renderBootstrapDescription（第 355-372 行）**

```typescript
function renderBootstrapDescription(
  item: LogItem,
  allLogs: LogItem[],
): string {
  const parts: string[] = [];
  const stateObj = item.state as Record<string, unknown> | undefined;
  const cause = stateObj?.cause;
  const causeLabel = formatCause(typeof cause === 'string' || typeof cause === 'number' ? String(cause) : '');
  if (causeLabel) parts.push(causeLabel);
  const sleepSec = calcSleepDuration(item, allLogs);
  if (sleepSec >= 60) {
    parts.push(`休眠 ${formatSimpleDuration(sleepSec)}`);
  }
  // 多传感器分项展示
  if (item.readings && item.readings.length > 0) {
    parts.push(
      item.readings
        .map((r) => `${r.label}: ${r.value}`)
        .join(' · '),
    );
  }
  return parts.join(' · ');
}
```

Wait — readings 的显示值需要格式化（电压/温度/电平）。但 log-card 中我们没有 SensorConfig 的上下文。简化处理：直接用 value 数值 + label，不做格式化。

修正上面代码：

```typescript
  // 多传感器分项展示
  if (item.readings && item.readings.length > 0) {
    for (const r of item.readings) {
      parts.push(`${r.label}: ${r.value}`);
    }
  }
```

实际上 readings 的 value 对于电压已经是小数点后两位，温度是小数点后一位。直接用数字即可。不需要额外的类型判断格式化。

- [ ] **Step 3: 更新 LogCard 组件中的 summaryVoltage（第 383 行）**

```typescript
// const summaryVoltage = group.items.find((i) => i.voltage && i.voltage > 0)?.voltage;  ← 删除
```

```typescript
// summaryVoltage 相关代码删除
// if (summaryVoltage && summaryVoltage > 0) {
//   summaryParts.push(`${String(summaryVoltage)}V`);
// }
```

替换为 readings 摘要：

```typescript
// 从组内取最后一条有效 readings
const summaryReadings = group.items.reduce<LogItem['readings']>((found, item) => {
  return item.readings?.length ? item.readings : found;
}, undefined);
if (summaryReadings && summaryReadings.length > 0) {
  summaryParts.push(
    summaryReadings.map((r) => `${r.label}: ${r.value}`).join(' · '),
  );
}
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -5
```

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat(log-card): adapt voltage to readings array display"
```

---

### Task 10: 清理 — 移除旧文件，运行完整检查

**Files:**
- Delete: `app/watering/components/voltage-config-picker.tsx`
- Delete: `__tests__/watering/components/voltage-config-picker.test.tsx`

**Purpose:** 清理废弃文件，确保全量类型检查和测试通过。

- [ ] **Step 1: 删除旧文件**

```bash
rm app/watering/components/voltage-config-picker.tsx
rm __tests__/watering/components/voltage-config-picker.test.tsx
```

- [ ] **Step 2: 运行格式化**

```bash
npm run format
```

- [ ] **Step 3: 运行类型检查和 Lint**

```bash
npm run check
```

修复所有类型错误和 lint 问题。

- [ ] **Step 4: 运行全量测试**

```bash
npm run test
```

确认所有现有测试和新测试通过。

- [ ] **Step 5: 验证构建**

```bash
npm run build
```

确认无构建错误。

- [ ] **Step 6: Commit**

```bash
git rm app/watering/components/voltage-config-picker.tsx __tests__/watering/components/voltage-config-picker.test.tsx
git add -A
git commit -m "chore: remove deprecated VoltageConfigPicker, final cleanup"
```

---

## 自审清单

1. **Spec 覆盖**：类型/DB/计算/卡片/表单/日志 6 个方面都有对应 Task
2. **无占位符**：所有步骤包含实际代码
3. **类型一致性**：`SensorConfig` 定义在 Task 1，后续所有 Task 使用相同字段名和类型
