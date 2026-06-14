# 列表描述信息增强设计

**日期**：2026-06-14  
**范围**：功能、步骤、中断、计划任务四种列表的描述信息自动生成  
**决策**：方案 A — 单行文本拼接，自动生成，信息全面，有条件渲染

---

## 1. 目标

在四种配置列表中，利用 `List.Item` 的 `description` 属性自动拼接关键字段，让用户无需点进详情即可看到配置摘要。

## 2. 核心规则

- **禁用显示**：`disabled === true` 时追加 `【已禁用】`，不满足则不显示
- **非零/非空显示**：数值为 0 或 undefined、数组为空、字符串为空，均跳过该字段
- **分隔符**：使用 ` · `（中间点+空格）连接各字段
- **描述行位置**：`List.Item` 的 `description` prop
- **时间格式化**：
  - `< 1000毫秒` → `X毫秒`（如 `500毫秒`）
  - `≥ 1000毫秒 且 < 60000毫秒` → `X秒`（如 `10秒`）
  - `≥ 60000毫秒` → `X分X秒`（秒为 0 时省略秒，如 `1分5秒`、`2分`）

## 3. 四种类型的描述格式

### 3.1 步骤（StepConfig）

**文件**：`app/watering/components/process-config-picker.tsx` 第 147 行

**当前**：`description={s.component}`

**改为**：

```
组件名 · 值:begin~end · 延迟X秒 · 超时X分X秒 · N个中断【已禁用】
```

**生成逻辑**：

| 字段 | 条件 | 输出 |
|------|------|------|
| `component` | 有值 | `motor_0` |
| `value` | `begin` 或 `end` 非 undefined | `值:0~100`（缺值侧显示 `?`） |
| `delay` | > 0 | `延迟2秒` |
| `timeout` | > 0 且 !== undefined | `超时10秒` |
| `interrupts` | 数组长度 > 0 | `3个中断` |
| `disabled` | === true | `【已禁用】`（追加到末尾） |

**示例**：
- `motor_0 · 值:0~100 · 延迟2秒 · 超时1分30秒 · 2个中断`
- `motor_0 · 延迟2秒 · 超时2分 · 【已禁用】`
- `pump_1`（仅组件名）

### 3.2 中断（InterruptConfig）

**文件**：`app/watering/components/step-config-picker.tsx` 第 173 行

**当前**：`description={intr.component}`

**改为**：

```
组件名 · 条件 · 拦截N次 · 延迟X秒 · 持续X分X秒【已禁用】
```

**生成逻辑**：

| 字段 | 条件 | 输出 |
|------|------|------|
| `component` | 有值 | `sensor_0` |
| 条件 | `signalType === 'analog'` 且 logic/threshold 有效 | `>30` |
| 条件 | `signalType === 'digital'` | `=开`（state 为 true）或 `=关`（state 为 false） |
| `intercept` | > 0 | `拦截3次` |
| `delay` | > 0 | `延迟1秒` |
| `duration` | > 0 | `持续5秒` |
| `disabled` | === true | `【已禁用】` |

**示例**：
- `sensor_0 · >30 · 拦截3次 · 延迟1秒 · 持续1分5秒`
- `button_0 · =开 · 持续2分 · 【已禁用】`
- `sensor_1 · <50`（仅条件）

### 3.3 计划任务（ScheduleConfig）

**文件**：`app/watering/components/device-config-form.tsx` 第 459 行

**当前**：`description={`间隔 ${sch.interval} 天`}` 且流程名在 `extra` 中

**改为**：流程名合并进 description，extra 移除

```
流程名 · 间隔N天/分钟【已禁用】
```

**生成逻辑**：

| 字段 | 条件 | 输出 |
|------|------|------|
| 流程名 | `process` 索引有效 | 对应 `ProcessConfig.name` |
| `interval` | > 1 | `间隔2天`（type=minute 时为 `间隔N分钟`） |
| `disabled` | === true | `【已禁用】` |

**同时移除**：`extra={...}` 属性（流程名已合并到 description）

**示例**：
- `浇灌 · 间隔2天`
- `日常浇水`（interval=1，不显示间隔）
- `浇灌 · 间隔3天 · 【已禁用】`

### 3.4 功能（ProcessConfig）

**文件**：`app/watering/components/device-config-form.tsx` 第 415-423 行

**当前**：无 description

**改为**：添加 description

```
N个步骤 · 触发:XXX
```

**生成逻辑**：

| 字段 | 条件 | 输出 |
|------|------|------|
| steps | 始终 | `3个步骤` |
| `trigger` | 有值 | `触发:button_1` |

> 注：ProcessConfig 没有 `disabled` 字段，无需禁用标记

**示例**：
- `3个步骤 · 触发:button_1`
- `2个步骤`

## 4. 实现方案

### 4.1 新增文件

**`app/watering/utils/format-desc.ts`** — 描述文本生成工具

**`formatMs(ms: number): string`**  
将毫秒转为中文时间字符串：`<1秒` 用 `X毫秒`，`1秒~59秒` 用 `X秒`，`≥60秒` 用 `X分X秒`（整分省略秒）

其余四个导出函数：

| 函数 | 用途 |
|------|------|
| `formatStepDesc(step)` | 步骤列表描述 |
| `formatInterruptDesc(intr)` | 中断列表描述 |
| `formatScheduleDesc(sch, processes)` | 计划任务列表描述 |
| `formatProcessDesc(proc)` | 功能列表描述 |

### 4.2 修改文件

| 文件 | 行号 | 变更 |
|------|------|------|
| `device-config-form.tsx` | 415-423 | 功能列表添加 `description`，调用 `formatProcessDesc` |
| `device-config-form.tsx` | 457-467 | 计划任务改用 `formatScheduleDesc`，移除 extra |
| `process-config-picker.tsx` | 145-151 | 步骤列表改用 `formatStepDesc` |
| `step-config-picker.tsx` | 173-178 | 中断列表改用 `formatInterruptDesc` |

### 4.3 不修改

- **类型定义**（`types.ts`）：不需要新增字段，纯自动生成
- **数据库**：不需要迁移
- **编辑器 Picker**：不需要改动

## 5. 测试要点

- 各字段为 0/空/undefined 时正确跳过
- `disabled: true` 时正确追加 `【已禁用】`
- `delay`/`timeout` 等时间字段的毫秒→中文时间转换正确（含边界：500→500毫秒、2000→2秒、60000→1分、125000→2分5秒）
- 时间的分秒省略逻辑正确（`2分` 不显示 `2分0秒`）
- 中断条件模拟信号和数字信号两种路径正确
- 计划任务 `interval=1` 时不显示间隔
- 功能 `trigger` 为空时不显示触发部分

## 6. 风险

- **低风险**：纯前端展示层变更，不涉及数据模型和数据库
- **兼容性**：不会破坏现有配置数据
