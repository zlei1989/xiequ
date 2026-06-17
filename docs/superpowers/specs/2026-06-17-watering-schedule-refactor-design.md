# 浇花定时任务重构设计

## 概述

重构浇花模块的定时任务功能，将原有的「类型」改为「循环类型」必选项（单次/天/分钟/星期），「禁用计划」改名为「禁用任务」，并为每种循环类型设计专属的表单字段和触发逻辑。同时完善定时任务列表的描述展示。

不考虑旧数据兼容，用户需重新配置定时任务。

## 1. 数据模型

### ScheduleConfig 类型变更

```typescript
/** 定时任务 — 按循环类型触发指定流程 */
export type ScheduleConfig = {
  key?: string;
  /** 循环类型：once=单次, day=按天, minute=按分钟, week=按星期 */
  type: 'once' | 'day' | 'minute' | 'week';
  /** 开始时间（Unix 时间戳 ms）
   *  - once: 执行时间
   *  - day/week: 启用日期（此日期起生效）
   *  - minute: 首次执行时间 */
  startTime: number;
  /** 循环时间（距 00:00 毫秒偏移）— 仅 day/week 类型，表示每天/每周几的触发时刻 */
  value?: number;
  /** 间隔数 — day: 间隔天数(0=每天, 1=隔天), minute: 间隔分钟数(最小30) */
  interval?: number;
  /** 星期几 (1=周一...7=周日) — 仅 week 类型 */
  week?: number;
  /** 要触发的流程索引 */
  process: number;
  /** 是否禁用（单次任务执行后自动设为 true） */
  disabled?: boolean;
};
```

### 与旧类型映射

| 字段 | 旧版 | 新版 | 变化 |
|------|------|------|------|
| `type` | `'minute'\|'day'\|'week'\|'month'` | `'once'\|'day'\|'minute'\|'week'` | 移除 `month`，新增 `once` |
| `value` | 必填，距 00:00 毫秒偏移 | 可选，仅 day/week 使用循环时间 | 语义不变，变为可选 |
| `interval` | 必填，每 N 天/分钟 | 可选，day:间隔天数(0=每天), minute:间隔分钟数 | 语义变化 + 变为可选 |
| `startTime` | 不存在 | 必填，开始时间戳 | 新增 |
| `week` | 可选 | 可选，仅 week 类型 | 语义不变 |
| `day`/`month` | 可选 | 移除 | 不再需要 |

### 新建任务默认值

| 类型 | startTime | value | interval | week |
|------|-----------|-------|----------|------|
| once | 当前时间 | — | — | — |
| day | 当前日期 00:00 | 8:00 (28800000) | 0 | — |
| minute | 当前时间 | — | 30 | — |
| week | 当前日期 00:00 | 8:00 (28800000) | — | 1(周一) |

## 2. ScheduleConfigPicker UI

### 循环类型选择器

```typescript
const TYPE_OPTIONS = [
  { label: '单次', value: 'once' },
  { label: '天', value: 'day' },
  { label: '分钟', value: 'minute' },
  { label: '星期', value: 'week' },
];
```

### 各类型表单字段

**单次（once）**

| 字段 | 组件 | 说明 |
|------|------|------|
| 循环类型 | Selector | 必选 |
| 开始时间 | DatePicker precision='minute' | 执行时间，精确到年/月/日/时/分 |
| 执行流程 | Picker | 选择流程 |
| 禁用任务 | Switch | 改名 |

**天（day）**

| 字段 | 组件 | 说明 |
|------|------|------|
| 循环类型 | Selector | 必选 |
| 间隔（天） | Stepper min=0 | 0=每天，1=隔天 |
| 开始时间 | DatePicker precision='minute' | 启用日期 |
| 循环时间 | Picker columns=[小时0~23, 分钟0~59] | 每天的触发时刻 |
| 执行流程 | Picker | 选择流程 |
| 禁用任务 | Switch | 改名 |

**分钟（minute）**

| 字段 | 组件 | 说明 |
|------|------|------|
| 循环类型 | Selector | 必选 |
| 间隔（分钟） | Stepper min=30 step=1 | 默认30 |
| 开始时间 | DatePicker precision='minute' | 首次执行时间 |
| 执行流程 | Picker | 选择流程 |
| 禁用任务 | Switch | 改名 |

**星期（week）**

| 字段 | 组件 | 说明 |
|------|------|------|
| 循环类型 | Selector | 必选 |
| 星期 | Picker columns=[周一~周日] | 单选，值 1~7 |
| 开始时间 | DatePicker precision='minute' | 启用日期 |
| 循环时间 | Picker columns=[小时0~23, 分钟0~59] | 触发时刻 |
| 执行流程 | Picker | 选择流程 |
| 禁用任务 | Switch | 改名 |

### 循环时间 Picker

用 `Picker` 实现两列（小时 0~23、分钟 0~59），值存储为距 00:00 的毫秒偏移，显示格式 `HH:mm`。

### 切换类型时字段处理

切换循环类型时，保留 `process` 和 `disabled`，重置其余字段为新类型的默认值，避免残留无效数据。

## 3. 定时任务列表描述

### 列表项结构

- **标题行**：循环描述（类型 + 频率 + 时间）
- **描述行**：流程名 + 状态标记

### 各类型标题格式

| 类型 | 标题格式 | 示例 |
|------|---------|------|
| once | `单次 · yyyy-MM-dd HH:mm` | 单次 · 2024-06-17 08:30 |
| day (interval=0) | `每天 HH:mm` | 每天 08:30 |
| day (interval>0) | `每隔N天 HH:mm` | 每隔3天 08:30 |
| minute | `每隔N分钟` | 每隔30分钟 |
| week | `每周X HH:mm` | 每周一 08:30 |

### 描述格式

```
流程名 · 开始 yyyy-MM-dd【已禁用】
```

- "开始" 后面只显示日期（不含时间，时间已在标题中体现）
- 单次类型不显示"开始"（标题已包含完整时间）
- `disabled=true` 时追加 `【已禁用】`

### 示例效果

| 类型 | 标题 | 描述 |
|------|------|------|
| once | 单次 · 2024-06-17 08:30 | 浇花 |
| day | 每天 08:30 | 浇花 · 开始 2024-06-17 |
| day | 每隔2天 14:00 | 浇花 · 开始 2024-06-17 |
| minute | 每隔30分钟 | 浇花 · 开始 2024-06-17 10:00 |
| week | 每周三 18:00 | 浇花 · 开始 2024-06-17【已禁用】 |

### 代码变更

- `formatScheduleTime` → 重构为 `formatScheduleTitle`，按类型生成标题
- `formatScheduleDesc` → 增加 `startTime` 显示，按类型调整描述逻辑
- 函数签名不变：`(sch: ScheduleConfig, processes: ProcessConfig[]) => string`

## 4. 服务端定时触发逻辑

当前 `checkAndExecuteSchedule`（`app/watering/api/get-state/route.ts`）只实现了 `day` 类型，需扩展支持 `once`、`minute`、`week`。

### 触发判断逻辑

**once（单次）**

```
条件: startTime ≤ now 且 |now - startTime| ≤ SCHEDULE_OFFSET 且未执行过
触发: 执行流程，设置 disabled = true，保存配置
```

- 触发后自动将 `schedule.disabled` 设为 `true`，调用 `saveDeviceConfig` 持久化
- 通过 `schedule_log` 的 `(chipId, triggerTime, processIndex)` 去重

**day（按天）**

```
条件: now ≥ startTime（启用日期已到）
      且 |今天循环时间 - now| ≤ SCHEDULE_OFFSET
      且 interval 天内未执行过
触发: 执行流程，记录 schedule_log
```

- `startTime` 只取日期部分，时间部分忽略（由 `value` 循环时间决定）
- `interval=0` 表示每天都执行（跳过间隔天数检查）
- `interval>0` 时检查：往前推 interval 天，若有执行记录则跳过

**minute（按分钟）**

```
条件: now ≥ startTime
      且距上次执行 ≥ interval 分钟
触发: 执行流程，记录 schedule_log
```

- 从 `startTime` 开始，每次执行间隔 `interval` 分钟
- 计算理论触发时间：`startTime + N * interval * 60000`（N 取使结果 ≤ now 的最大值）
- 用理论触发时间作为 `triggerTime` 调用 `hasScheduleLog` 去重

**week（按星期）**

```
条件: now ≥ startTime
      且今天是 schedule.week 对应的星期
      且 |今天循环时间 - now| ≤ SCHEDULE_OFFSET
      且今日未执行过
触发: 执行流程，记录 schedule_log
```

- 星期映射：JS `getDay()` 返回 0(周日)~6(周六)，转换为 1(周一)~7(周日)
- 每周指定星期几只触发一次，通过 `schedule_log` 去重

### calcNextScheduleDelay 扩展

| 类型 | 计算方式 |
|------|---------|
| once | `startTime - now`（已过期返回 SLEEP_DURATION） |
| day | 今天循环时间未过 → `todayTrigger - now`；否则 → `明天循环时间 + interval天数 - now` |
| minute | `startTime + ceil((now - startTime) / interval分钟) * interval分钟 - now` |
| week | 今天是目标星期且循环时间未过 → 差值；否则 → 下一个目标星期循环时间 - now |

### 代码结构

- 保持现有函数签名不变，在 `checkAndExecuteSchedule` 的 `switch` 中新增 `once`、`minute`、`week` 分支
- 重命名 `calcDayTriggerTime` 为 `calcDayLoopTriggerTime`
- 新增 `calcMinuteTriggerTime(schedule, now)` — 计算分钟类型的理论触发时间
- 新增 `calcWeekTriggerTime(schedule, now)` — 计算星期类型的今日触发时间

## 5. 影响范围

| 文件 | 变更内容 |
|------|---------|
| `app/watering/types.ts` | ScheduleConfig 类型定义 |
| `app/watering/components/schedule-config-picker.tsx` | UI 表单按类型条件渲染 |
| `app/watering/components/device-config-form.tsx` | 列表标题/描述调用更新、addSchedule 默认值 |
| `app/watering/utils/format-desc.ts` | formatScheduleTitle + formatScheduleDesc 重构 |
| `app/watering/api/get-state/route.ts` | checkAndExecuteSchedule + calcNextScheduleDelay 扩展 |
