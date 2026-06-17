# DeviceConfigForm 重构设计

**日期**：2026-06-14\
**状态**：设计完成，待实施

## 概述

将 `DeviceEditor` / `device-editor.tsx` 重构为 `DeviceConfigForm` / `device-config-form.tsx`：

1. 基本设置区 `List` → `Form` + `Form.Item`
2. 5 个子编辑器统一命名为 `XxxPicker`，全部提供声明式组件 + 静态 `.prompt()` 双 API
3. `Process`/`Step`/`Interrupt`/`Schedule` 类型统一加 `Config` 后缀
4. 各 Picker 统一入参 `gpio: GpioInfo`

## 文件变更

| 操作 | 原文件 | 新文件 |
|------|--------|--------|
| 改名+重构 | `device-editor.tsx` | `device-config-form.tsx` |
| 改名+扩展 | `voltage-config-popup.tsx` | `voltage-config-picker.tsx` |
| 改名+Form迁移 | `process-editor.tsx` | `process-config-picker.tsx` |
| 改名+Form迁移 | `process-step-editor.tsx` | `step-config-picker.tsx` |
| 改名+Form迁移 | `process-interrupt-editor.tsx` | `interrupt-config-picker.tsx` |
| 改名+Form迁移 | `schedule-editor.tsx` | `schedule-config-picker.tsx` |
| 更新引用 | `page.tsx` | — |
| 更新引用 | `types.ts` | — |
| 更新引用 | `use-device-config.ts` | — |
| 更新引用 | `__tests__/` | — |

## 组件树

```
DeviceDetailPage (page.tsx)                                     ← 更新 import
└── DeviceConfigForm (device-config-form.tsx)                   ← 改名，保持 saveRef 模式
    ├── [Form layout="vertical"] 基本设置区                      ← List→Form
    │   ├── Form.Header "基本设置"
    │   ├── Form.Item 设备名称 / <Input>
    │   ├── Form.Item 空闲睡眠 / <Switch>
    │   ├── Form.Item 空闲超时 / <Stepper> (idleSleep 条件显示)
    │   ├── Form.Item 开机执行 / <Input readOnly> + onClick→Picker.prompt
    │   └── Form.Item 延迟执行 / <Stepper disabled={bootExec<0}>
    │
    ├── 电压检测配置摘要栏 → 触发 VoltageConfigPicker            ← 抽取，不再内联 Popup
    ├── [List] 流程列表 + SwipeAction → ProcessConfigPicker
    ├── [List] 计划任务列表 + SwipeAction → ScheduleConfigPicker
    │
    ├── VoltageConfigPicker (声明式挂载)
    ├── ProcessConfigPicker (声明式挂载)
    │   └── 内部触发 → StepConfigPicker
    ├── StepConfigPicker (声明式挂载)
    │   └── 内部触发 → InterruptConfigPicker
    ├── InterruptConfigPicker (声明式挂载)
    └── ScheduleConfigPicker (声明式挂载)
```

## Picker API 设计

### 统一签名

所有 5 个 Picker 遵循一致 API：

```tsx
// 声明式组件
<XxxPicker
  open={boolean}
  gpio={GpioInfo}            // 统一入参，内部按需取 loads/sensors/buttons
  xxx={XxxConfig}            // 初始数据（voltage/process/step/interrupt/schedule）
  onConfirm={(result: XxxConfig) => void}
  onClose={() => void}
  onDelete?: () => void      // 除 VoltageConfigPicker 外均支持（可通过 NavBar 删除按钮触发）
/>

// 命令式静态方法
XxxPicker.prompt({
  gpio: GpioInfo,
  xxx: XxxConfig,
  onConfirm: (result: XxxConfig) => void,
  onDelete?: () => void,     // 除 VoltageConfigPicker 外均支持
})
```

### 各 Picker 签名速查

| Picker | 数据 prop | onConfirm 返回 | 额外 props |
|--------|----------|---------------|-----------|
| `VoltageConfigPicker` | `voltage: VoltageConfig` | `VoltageConfig` | —（无删除按钮） |
| `ProcessConfigPicker` | `process: ProcessConfig` | `ProcessConfig` | `onDelete` |
| `StepConfigPicker` | `step: StepConfig` | `StepConfig` | `onDelete` |
| `InterruptConfigPicker` | `interrupt: InterruptConfig` | `InterruptConfig` | `onDelete` |
| `ScheduleConfigPicker` | `schedule: ScheduleConfig` | `ScheduleConfig` | `processes`, `onDelete` |

### `.prompt()` 实现机制

利用 `ReactDOM.createRoot` 或 antd-mobile 内部 `renderToBody` 工具：

1. 创建 body 下临时 DOM 容器
2. `createRoot` 挂载 Picker 组件，`open={true}`
3. `onConfirm` 时调用用户回调并卸载
4. `onClose` 时卸载并清理 DOM
5. 确保卸载时移除容器节点

## DeviceConfigForm 内部结构

### 保持受控模式

不使用 `Form.useForm()`。理由：数据流涉及三层嵌套索引（processIndex/stepIndex/interruptIndex），Field name 路径管理在索引频繁变更时增加复杂度。维持 `useState<DeviceConfig>` + 不可变更新。

### 状态清单（11 个）

| 状态 | 类型 | 用途 |
|------|------|------|
| `form` | `DeviceConfig` | 主数据 |
| `processVisible` | `boolean` | ProcessPicker 可见性 |
| `processIndex` | `number` | 当前编辑的流程索引 |
| `stepVisible` | `boolean` | StepPicker 可见性 |
| `stepIndex` | `number` | 当前编辑的步骤索引 |
| `interruptVisible` | `boolean` | InterruptPicker 可见性 |
| `interruptIndex` | `number` | 当前编辑的中断索引 |
| `scheduleVisible` | `boolean` | SchedulePicker 可见性 |
| `scheduleIndex` | `number` | 当前编辑的计划任务索引 |
| `voltageVisible` | `boolean` | VoltagePicker 可见性 |

### handleSave 暴露出 `saveRef`

保持不变 — `useEffect(() => { saveRef.current = handleSave; })` 将保存函数传给 `page.tsx` Header。

### 确认删除 Dialog

保持使用 `Dialog.confirm()`，由 `DeviceConfigForm` 统一处理。

## 子编辑器 Form 迁移

### ProcessConfigPicker（已有 Form，微调）

- 保持现有 `Form layout="vertical"` 结构
- `trigger` 选择改用 `Form.Item onClick` + `Picker.prompt` 模式
- 步骤列表保持 `SwipeAction` + `Form.Item onClick` 模式
- 改名、加 `.prompt()`

### StepConfigPicker（List → Form）

```
Form.Item label="步骤名称"       → <Input>
Form.Item label="负载" onClick   → Picker.prompt
Form.Item label="启动参数"       → <Stepper disabled={!hasLoad}>
Form.Item label="停止参数"       → <Stepper disabled={!hasLoad}>
Form.Item label="超时限制 (ms)"  → <Stepper step={1000}>
Form.Item label="禁用"           → <Switch>
Form.Header 中断列表
  [SwipeAction 包裹的中断项 onClick → InterruptConfigPicker]
  Button 添加中断
```

### InterruptConfigPicker（List → Form）

```
Form.Item label="中断名称"       → <Input>
Form.Item label="传感器"         → <Selector options={gpio.sensors}>
Form.Item label="信号类型"       → <Selector options={digital/analog}>
{signalType='digital' && (
  Form.Item label="触发状态"     → <Switch>
)}
{signalType='analog' && (
  Form.Item label="逻辑"         → <Selector options={>/<}>
  Form.Item label="触发阈值"     → <Stepper step={1}>
)}
Form.Item label="屏蔽抖动间隔"   → <Stepper step={100}>
Form.Item label="延迟检测"       → <Stepper step={1000}>
Form.Item label="持续时间"       → <Stepper step={1000}>
Form.Item label="禁用"           → <Switch>
```

### ScheduleConfigPicker（List → Form）

```
Form.Item label="类型" onClick   → Picker.prompt（day/minute/week/month）
Form.Item label="间隔（天）"     → <Stepper min={1}>
Form.Item label="时间" onClick   → DatePicker.prompt(precision='minute')
Form.Item label="执行流程" onClick → Picker.prompt（processOptions）
Form.Item label="禁用"           → <Switch>
```

## 类型重命名

在 `types.ts` 中：

- `Process` → `ProcessConfig`
- `Step` → `StepConfig`
- `Interrupt` → `InterruptConfig`
- `Schedule` → `ScheduleConfig`

影响范围：所有引用这些类型的文件（组件、hooks、actions、测试）。

## 数据流

### 单向数据流规则

1. **Picker 不直接修改父级 state** — 通过 `onConfirm(updated)` 回调向上传递
2. **立即同步模式** — 每个字段变更即时调 `onConfirm`，无"确认/取消"按钮
3. **Picker 内部 useState** — `useEffect` 在 `props.open` 变化时重置 draft 为最新 props 值
4. **CRUD 操作留在 DeviceConfigForm** — 添加/删除 Step/Interrupt 等操作需要 `processIndex`/`stepIndex` 上下文

### 嵌套添加流程

以添加步骤为例：

```
用户点击「添加步骤」
  → DeviceConfigForm.addStep()
  → setForm 更新 process.steps 数组
  → setStepIndex(新索引)
  → setStepVisible(true)
  → StepConfigPicker 接收最新 step props
```

## 构建验证

完成后按顺序执行：

```
npm run format  → ESLint + Stylelint 自动修复
npm run check   → TypeScript 类型检查 + Lint 检查
```

全部通过后方可进入代码审查。

## 迁移顺序（建议）

1. `types.ts` — 类型重命名
2. `voltage-config-picker.tsx` — 最成熟，快速完成
3. `interrupt-config-picker.tsx` — 无子级嵌套，最简单
4. `step-config-picker.tsx` — 依赖 InterruptConfigPicker
5. `process-config-picker.tsx` — 依赖 StepConfigPicker
6. `schedule-config-picker.tsx` — 独立，无子级嵌套
7. `device-config-form.tsx` — 接入所有 Picker
8. `page.tsx` — 更新 import
9. 测试文件 — 同步更新类型引用
10. `npm run format && npm run check` — 验证
