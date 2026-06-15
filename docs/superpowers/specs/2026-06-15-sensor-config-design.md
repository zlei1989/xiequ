# 传感器配置重构设计

**日期**: 2026-06-15
**状态**: 设计中

## 目标

将单一电压检测配置（`voltage` 字段）替换为通用传感器配置数组（`sensors`），支持数字信号和模拟信号（含电阻分压器、温感电阻两种转换），配置项可拖拽排序，并在设备卡片上按规则展示。

## 类型定义

### 新增 SensorConfig

```typescript
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

### DeviceConfig 变更

```diff
- voltage?: VoltageConfig;
+ sensors: SensorConfig[];
```

`VoltageConfig` 类型标记 `@deprecated` 但保留，待后续清理时移除。

### LogItem 变更

```diff
- voltage?: number;
+ readings?: { label: string; value: number }[];
```

## 数据库变更

### watering_devices

```diff
- voltage JSON,
+ sensors JSON NOT NULL DEFAULT '[]',
```

旧 `voltage` 列直接 DROP，不迁移。用户重新配置。

### watering_logs

```diff
- voltage REAL NOT NULL DEFAULT 0,
+ readings JSON,
```

旧 `voltage` 列通过 `ALTER TABLE DROP COLUMN` 删除。sql.js WASM 绑定的 SQLite ≥ 3.35 支持此语法。若运行时失败，回退为重建表（CREATE TABLE … AS SELECT … 排除旧列后 RENAME）。

## 传感器值计算

### 数据来源

从 `device.state.sensors[config.sensor]` 取原始 ADC 读数（0~4095，ESP32 12 位分辨率）。

### 计算规则

| 信号类型 | 转换 | 计算 |
|----------|------|------|
| digital | — | `raw > 0` → 高电平，否则低电平（不显示数值） |
| analog | 无 | 直接显示 ADC 原始值 |
| analog | resistor_divider | `V = (raw / 4095) × 3.3 × (R1 + R2) / R2` |
| analog | ntc_10k | `R_ntc = 10000 × V_adc / (3.3 - V_adc)`，`T = 1 / (1/298.15 + ln(R_ntc/10000)/B) - 273.15` |

### 计算公式（前端 help 展示）

**电阻分压器：**
```
V_actual = V_sensor × (R1 + R2) / R2
```
V_sensor = ADC / 4095 × 3.3V（引脚电压）

**温感电阻 10K：**
```
R_ntc = 10KΩ × V_adc / (3.3V - V_adc)
T(K) = 1 / (1/298.15 + ln(R_ntc/10000)/B)
T(°C) = T(K) - 273.15
```

## 设备卡片展示（device-card.tsx）

在设备信息区下方、流程按钮上方，新增传感器展示区。每行一个传感器：

```
感应名称    显示值
```

- **digital**：显示 `高电平` 或 `低电平`
- **analog 无转换**：显示原始 ADC 值（如 `2048`）
- **analog resistor_divider**：显示 `12.56V`
- **analog ntc_10k**：显示 `25.3°C`
- 数据缺失时显示 `—`
- 传感器未配置时该区域不渲染

## 配置表单（device-config-form.tsx + SensorConfigPicker）

### 入口

表单"传感器配置"行，点击弹出 Picker。摘要行显示：

```
传感器配置    已配置 N 项 >
```

### SensorConfigPicker（列表层，70vh）

- 使用已有的 `SortableList` 组件，支持拖拽排序
- 每行支持 SwipeAction 删除
- 每行显示摘要：`感应名称 · sensor_0 · 模拟/分压`
- 底部"添加传感器"按钮

### 编辑子 Picker（60vh）

| 表单项 | 组件 | 条件/说明 |
|--------|------|-----------|
| 感应名称 | Input | 必填 |
| 传感器引脚 | Selector（gpio.sensors） | 单选 |
| 信号类型 | Selector：数字信号/模拟信号 | 切换联动后序字段 |
| 转换 | Selector：无/电阻分压器/温感电阻10K | 仅 analog，可选。help 展示选中项公式 |
| B值 | Selector：3435/3950 | 仅 ntc_10k，默认 3435，必填 |
| R1电阻值 | Stepper（步长 1000） | 仅 resistor_divider，默认 30000 |
| R2电阻值 | Stepper（步长 1000） | 仅 resistor_divider，默认 10000 |

导航：编辑层 NavBar 返回列表层，列表层 NavBar 关闭。

### 公式 help 实现

在"转换" Selector 下方用 Card 组件展示当前选中转换类型的公式和计算结果预览。

## 服务端计算（db.ts）

新增 `calcSensorReadings` 函数，替代 `calcVoltage`：

```typescript
function calcSensorReadings(
  configs: SensorConfig[],
  sensorValues: Record<string, number> | undefined,
): { label: string; value: number }[]
```

`writeDeviceLog` 参数从 `voltage?: number` 改为 `readings?: { label: string; value: number }[]`。

## 日志卡片展示（log-card.tsx）

- `LogItem.voltage` → `LogItem.readings`
- bootstrap 描述中多传感器分项展示，替代原单电压格式化
- 渲染时遍历 readings 数组

## 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `app/watering/types.ts` | 新增 SensorConfig，DeviceConfig.voltage → sensors，LogItem.voltage → readings |
| `app/watering/services/db.ts` | 列变更、calcSensorReadings、writeDeviceLog 参数、initDb |
| `app/watering/api/push-state/route.ts` | calcVoltage → calcSensorReadings |
| `app/watering/components/device-card.tsx` | 替换电压展示为传感器展示区 |
| `app/watering/components/device-config-form.tsx` | 替换 voltage 入口为 sensors |
| `app/watering/components/sensor-config-picker.tsx` | 新建（替代 voltage-config-picker.tsx） |
| `app/watering/components/log-card.tsx` | voltage → readings 适配 |
| `app/watering/hooks/use-device-config.ts` | parseJsonVoltage → parseJsonSensors |

## ROM 固件

无影响。ROM 仅上报原始传感器读数，不涉及 voltage/sensor 配置字段。

## 约束

- 不迁移旧 voltage 数据，旧列直接删除，用户重新配置
- 使用已有 SortableList 组件实现拖拽
- 保持 antd-mobile + Tailwind 技术栈
- 遵循 CLAUDE.md 注释和日志规范
