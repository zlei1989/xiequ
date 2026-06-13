# 日志卡片内容增强

**日期**：2026-06-14
**状态**：已确认

## 目标

增强 LogCard 的信息展示密度，用中文友好文案替代原始数字和英文字段，让用户一眼看懂设备运行状况。

## 背景

当前日志卡片信息量不足：
- 标题 `State ID: yOV6QqbD` 对用户无意义
- 开机事件只显示简单描述，唤醒原因用数字 `cause: "0"` 展示
- 变更事件只显示 Tag「变更」，不区分具体变更类型
- 电压、流程名称、步骤数等信息完全缺失

设备固件实际上报了丰富数据（唤醒原因、变更类型、流程详情、传感器读数），但服务端未完整存储，前端也未渲染。

## 卡片布局

```
┌──────────────────────────────────────────┐
│ 第 yOV6QqbD 批次运行           [已完成]  │  标题 · 状态标签
│ 浇花、施肥 · 共 5 个步骤 · 32分钟 · 3.7V │  摘要行
│──────────────────────────────────────────│
│ ● 开机  14:30:22                         │  bootstrap：唤醒原因 + 休眠 + 电压
│   定时唤醒 · 休眠 18小时 · 3.7V           │
│──────────────────────────────────────────│
│ ● 开始  14:30:23           [步骤开始]    │  change：中文消息 + 变更类型子标签
│   步骤「浇水」开始执行                    │
│──────────────────────────────────────────│
│ ● 完成  14:35:23                         │  finish：简单消息
│   流程执行完毕                            │
└──────────────────────────────────────────┘
```

## 变更点

### 一、数据库：表结构调整

**文件**：`app/watering/services/db.ts`

#### 1.1 新增独立列

从 `state` JSON 中提取高频字段为独立列，方便索引和查询：

```sql
ALTER TABLE watering_logs ADD COLUMN mac_address TEXT;
ALTER TABLE watering_logs ADD COLUMN state_id TEXT;
ALTER TABLE watering_logs ADD COLUMN message TEXT;
ALTER TABLE watering_logs ADD COLUMN voltage REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_watering_logs_state_id ON watering_logs(state_id);
```

#### 1.2 列职责

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | INTEGER PK | 自增主键 |
| `chip_id` | TEXT | 设备标识 |
| `mac_address` | TEXT | 设备 MAC 地址（每条日志必有） |
| `event` | TEXT | 事件类型 |
| `state_id` | TEXT | 批次标识，用于前端分组，可索引 |
| `message` | TEXT | 设备生成的中文描述，change 事件专有 |
| `state` | JSON | 剩余结构化数据（cause, type, sensors, loads, process, index） |
| `voltage` | REAL | 写日志时的设备电压，未配置时为 0 |
| `created_time` | TEXT | ISO 时间戳 |

#### 1.3 电压计算

在 `writeDeviceLog` 内部实现。从 GPIO 数据取对应配置引脚的传感器读数，应用分压公式。无配置或传感器读数缺失时返回 `0`。

分压公式：`V_actual = V_sensor × (R1 + R2) / R2`，仅在 `r1 > 0 && r2 > 0` 时应用，否则直接使用原始读数。结果保留 2 位小数。

#### 1.4 `writeDeviceLog` 签名

```ts
writeDeviceLog(
  chipId: string,
  event: string,
  macAddress: string,
  state?: Record<string, unknown>,
  voltage?: number,
  stateId?: string,
  message?: string,
)
```

#### 1.5 `getDeviceLogs` 返回

返回对象新增 `macAddress`、`stateId`、`message`、`voltage` 顶层字段。

### 二、服务端：数据补全

**文件**：`app/watering/api/push-state/route.ts`

每个事件写日志时传入完整参数。新增 `case 'change'` 分支。

| 事件 | 独立列 | state JSON |
|------|--------|-----------|
| bootstrap | macAddress, stateId, voltage | `{ cause, sensors, loads }` |
| change | macAddress, stateId, message, voltage | `{ sensors, loads, type }` |
| finish | macAddress, stateId, voltage | — |
| heartbeat/default | macAddress, voltage | `{ sensors, loads }` |

### 三、前端：LogCard 增强

**文件**：`app/watering/components/log-card.tsx`

#### 3.1 LogItem 类型

```ts
export type LogItem = {
  event: string;
  createdTime: string;
  state?: unknown;         // { cause?, type?, sensors?, loads?, process?, index? }
  macAddress?: string;
  stateId?: string;
  message?: string;        // 设备生成的中文描述
  voltage?: number;        // 写日志时的设备电压
};
```

#### 3.2 标题

- 变更前：`State ID: yOV6QqbD`
- 变更后：`第 yOV6QqbD 批次运行`

#### 3.3 摘要行（新增）

标题下方一行灰色小字，格式：`{流程名列表} · 共 X 个步骤 · {用时} · {电压}V`

- 流程名从 change 事件的 `message` 中提取，去重后用顿号分隔
- 步骤数统计所有 change 事件数
- 用时取组内首尾事件时间差
- 电压从 `item.voltage` 读取，`voltage > 0` 时显示

#### 3.4 bootstrap 步骤（增强消息）

- 从 `state.cause` 映射中文唤醒原因
- 休眠时长 = 当前 bootstrap 时间 - 上一条日志时间，不足 1 分钟不显示
- 电压从 `item.voltage` 读取
- 示例：「定时唤醒 · 休眠 18小时 · 3.7V」

#### 3.5 change 步骤（增强消息 + 新增子标签）

- 优先使用 `item.message`（设备已生成中文描述）
- 额外展示变更类型子标签，从 `state.type` 映射

#### 3.6 时间格式化（简化）

| 时长 | 显示 |
|------|------|
| < 1 分钟 | 刚刚 |
| < 1 小时 | X分钟 |
| < 1 天 | X小时 |
| ≥ 1 天 | X天 |

休眠时长不足 1 分钟时不显示休眠部分。

#### 3.7 数据映射表

**唤醒原因**（`state.cause`）：

| 原始值 | 中文 |
|--------|------|
| `"0"` | 正常上电 |
| `"2"` | 外部唤醒 |
| `"4"` | 定时唤醒 |

**变更类型**（`state.type`）：

| 原始值 | 中文标签 | Tag 颜色 |
|--------|---------|----------|
| `step_ready` | 步骤就绪 | default |
| `step_begin` | 步骤开始 | primary |
| `step_end` | 步骤结束 | success |
| `step_timeout` | 步骤超时 | warning |
| `step_interrupt` | 步骤中断 | danger |

### 四、不变的部分

- `LogGroup` 类型定义不变
- `groupByStateId` / `getStepStatus` / `getGroupStatus` 等工具函数不删
- `useDeviceLogs` hook 不变
- 日志页 `page.tsx` 不变

## 边界情况

- **没有 bootstrap 事件**：不显示唤醒原因和休眠时长
- **没有 change 事件**：摘要行不显示流程名和步骤数，仅显示用时和电压
- **voltage 为 0**：不显示电压
- **stateId 为空**：fallback 到 `_unknown`
- **休眠时长 < 1 分钟**（首条日志或刚休眠）：不显示休眠信息

## 不涉及

- 不修改 `DeviceCard`
- 不修改 ROM 固件代码
- 不修改日志页的加载、刷新、清空逻辑
