# 传感器历史趋势折线图 — 设计文档

> 2026-06-17 | 状态：待实现

## 概述

在浇花模块中新增传感器数值的历史趋势展示功能。服务端在 `get-state` 接口中按自然时间每 15 分钟采样一次传感器读数，存入新表 `watering_sensor_log`；前端通过独立子页面展示折线图，支持时间范围切换和数据点详情。

## 需求背景

ESP32 设备每次轮询 `get-state` 时都会上报传感器数据（`sensor:sensor_0=1024` 等参数），但服务端当前未持久化这些定时数据。用户希望记录传感器数值的历史变化趋势，以便观察设备运行环境和诊断问题。

## 数据模型

### 新表 `watering_sensor_log`

```sql
CREATE TABLE IF NOT EXISTS watering_sensor_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chip_id TEXT NOT NULL,
  record_time TEXT NOT NULL,   -- 采样时间点，对齐到 00/15/30/45 分
  readings JSON NOT NULL,      -- [{ "label": "电池电压", "value": 12.3 }, ...]
  created_time TEXT NOT NULL,
  FOREIGN KEY (chip_id) REFERENCES watering_devices(chip_id)
);

CREATE INDEX IF NOT EXISTS idx_sensor_log_time
  ON watering_sensor_log(chip_id, record_time);
```

- `record_time`：对齐到自然 15 分钟点（如 `2026-06-17T14:15:00.000Z`），ISO 8601 格式
- `readings`：格式与 `watering_logs.readings` 一致（`{ label: string; value: number }[]`），复用 `calcSensorReadings()` 计算逻辑
- 索引覆盖主要查询模式：某设备在时间范围内的采样记录

### 数据保留

每次写入时附带清理：`DELETE FROM watering_sensor_log WHERE record_time < datetime('now', '-7 days')`，单条 SQL 即可。

## 采样逻辑

### 触发时机

在 `GET /api/watering/get-state` 路由中，ESP32 约每 15 秒调用一次且携带传感器参数。当前路由未解析 `sensor:` 前缀参数，需新增解析逻辑。

### 采样判断流程

```
get-state 请求到达
  → 解析 sensor:xxx 参数（同 push-state 解析方式）
  → 调用 calcSensorReadings() 计算实际值
  → 查询该设备最后一条记录的 record_time（lastRecordTime）
  → 计算当前自然时间之前最近的 15 分钟整点 = latestSlot
     （分钟数向下取整到 0/15/30/45，秒/毫秒归零）
  → 如果 latestSlot > lastRecordTime
     → INSERT 新记录（record_time = latestSlot）
```

### 设计要点

- **去重**：只比较 `latestSlot > lastRecordTime`，同一 slot 内多次请求不重复写入
- **离线恢复**：设备离线数小时后恢复，只补录最新一个 slot，不回溯遗漏点，避免冷启动写入风暴
- **无额外开销**：不引入计划任务框架，利用现有请求驱动；写入操作轻量（单条 INSERT + 单条 DELETE）

## API 设计

### Server Action：`getSensorLogs(chipId, range)`

```
输入：
  chipId: string
  range: '1h' | '6h' | '24h' | '7d'

输出：
  {
    records: {
      recordTime: string          // ISO 8601
      readings: {
        label: string
        value: number
      }[]
    }[]
  }
```

- 查询：`SELECT * FROM watering_sensor_log WHERE chip_id = ? AND record_time BETWEEN ? AND ? ORDER BY record_time ASC`
- 不做分页——7 天最多 672 条（1 设备 × 4 条/时 × 24 时 × 7 天），一次返回即可
- 前端按 `label` 分组，每个传感器画一条折线

## UI 设计

### 页面路由

`app/watering/(subpages)/charts/[chipId]/page.tsx` — 独立子页面

### 入口

设备卡片（`DeviceCard`）中，"日志"按钮点击弹出 `ActionSheet`：
- **执行日志** → 跳转现有日志页 `/watering/logs/[chipId]`
- **环境日志** → 跳转新增图表页 `/watering/charts/[chipId]`

### 页面布局（从上到下）

1. **导航栏**：返回按钮 + 标题"传感器趋势"
2. **时间范围切换**：`CapsuleTabs` 组件，选项 `[1小时, 6小时, 24小时, 7天]`
3. **图表列表**：每个传感器一张独立 Recharts `<LineChart>`，垂直排列。每张图包含：
   - 传感器名称标题
   - X 轴：时间（根据 range 自动选择格式：1h/6h 显示 HH:mm，24h 显示 HH:mm，7d 显示 MM-DD）
   - Y 轴：自动刻度
   - Tooltip：悬停/长按显示时间和数值

### 交互

| 交互 | 实现 |
|------|------|
| 时间范围切换 | `CapsuleTabs` onChange → 重新请求 getSensorLogs → 图表数据更新 |
| 数据点详情 | Recharts `<Tooltip>` 组件，显示时间 + 数值 |
| 空数据 | 无数据时显示 `ErrorBlock status="empty"` |
| 加载态 | 数据请求中显示 `DotLoading` |

### 主题适配

- 折线颜色：使用 Tailwind 色板（red-400、emerald-400、blue-400 等），亮/暗通用
- 图表背景、网格线、坐标轴颜色：通过 CSS 变量或 Tailwind `dark:` 前缀跟随系统主题
- Tooltip 背景：反色处理，亮色主题用深色底白字，暗色主题用浅色底黑字
- Recharts 的 stroke/fill 属性通过 props 传入主题感知颜色值

## 实现清单

| 序号 | 内容 | 涉及文件 |
|------|------|---------|
| 1 | 新建表 + `writeSensorLog()` / `getSensorLogs()` + 清理 | `services/db.ts` |
| 2 | `get-state` 解析 `sensor:` 参数 + 采样判断 | `api/get-state/route.ts` |
| 3 | 新增 `getSensorLogs` Server Action | `actions/get-sensor-logs.ts` |
| 4 | 安装 Recharts 依赖 | `package.json` |
| 5 | 新建折线图子页面 | `(subpages)/charts/[chipId]/page.tsx` |
| 6 | 图表组件（每传感器独立图 + 主题适配） | `components/sensor-chart.tsx` |
| 7 | `DeviceCard` 日志按钮改为 ActionSheet | `components/device-card.tsx` |
| 8 | 测试 | `__tests__/` |

## 架构图

```
ESP32 (~15s 轮询)
  │
  ▼
GET /api/watering/get-state?chipId=xxx&sensor:sensor_0=1024&...
  │
  ├─ 现有逻辑：状态变更检测、长轮询、计划任务 → 返回响应
  │
  └─ 新增：解析 sensor: 参数 → calcSensorReadings()
         → 15 分钟 slot 判断 → writeSensorLog() → watering_sensor_log 表

前端入口：
  DeviceCard "日志" 按钮
    → ActionSheet
      ├─ "执行日志" → /watering/logs/[chipId]（现有）
      └─ "环境日志" → /watering/charts/[chipId]（新增）
                           │
                           ▼
                    getSensorLogs(chipId, range)
                           │
                           ▼
                    Recharts LineChart × N（每传感器一张）
```
