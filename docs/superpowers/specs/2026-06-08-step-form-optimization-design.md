# 步骤表单优化 — 删除延迟运行、负载可选、触发按钮移入流程 设计文档

**日期:** 2026-06-08  
**状态:** 已确认  
**范围:** `app/watering/types.ts`, `app/watering/components/process-step-editor.tsx`, `app/watering/components/process-editor.tsx`, `app/watering/components/device-editor.tsx`

---

## 目标

优化步骤编辑表单：删除"延迟运行"字段、负载改为可选并联动禁用启动/停止参数、触发按钮从步骤级提升到流程级。

---

## 设计

### 一、类型变更 (`types.ts`)

**Step 类型：**

| 字段 | 变更 |
|------|------|
| `component: string` | → `component?: string`（可选） |
| `trigger?: string` | 删除（移到 Process） |
| `delay?: number` | 删除（移除延迟运行功能） |

**Process 类型：**

| 字段 | 变更 |
|------|------|
| `trigger?: string` | 新增（流程级触发按钮，可选） |

变更后的类型：

```typescript
export type Step = {
  name: string;
  component?: string;       // 可选
  value: { begin: unknown; end: unknown };
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};

export type Process = {
  name: string;
  trigger?: string;         // 新增：流程级触发按钮
  steps: Step[];
};
```

### 二、ProcessStepEditor 变更

1. **删除「延迟运行（毫秒）」** — 移除整个 `<div>` 块（含 label + InputNumber）
2. **删除「触发按钮」** — 移除整个 `<div>` 块（含 label + Select），同时删除 `buttonOptions` 变量
3. **负载改为可选** — Select 添加 `allowClear`，placeholder 改为"选择负载（可选）"
4. **启动/停止参数联动禁用** — 当 `!step.component` 时，InputNumber 设置 `disabled={true}`

```tsx
const hasLoad = !!step.component;

// 启动参数
<InputNumber disabled={!hasLoad} ... />

// 停止参数
<InputNumber disabled={!hasLoad} ... />
```

### 三、ProcessEditor 变更

1. **新增「触发按钮」字段** — 在功能名称下方独占整行，使用 `Select` + `allowClear`
2. **新增 `gpio` prop** — 接收 `GpioInfo`，用 `toOptions(gpio.buttons)` 生成下拉选项

```tsx
export function ProcessEditor({
  process,
  gpio,          // 新增
  onChange,
  onRemove,
  onEditStep,
  onAddStep,
}: { ... })
```

触发按钮布局（独占整行）：

```
┌──────────────────────────────────────┐
│  功能名称                            │
│  ┌────────────────────────────────┐  │
│  │ 输入流程名称                    │  │
│  └────────────────────────────────┘  │
│  触发按钮                            │
│  ┌────────────────────────────────┐  │
│  │ 选择触发按钮（可选）        ▾   │  │
│  └────────────────────────────────┘  │
│  步骤                                │
│  ┌────────────────────────────────┐  │
│  │ # | 名称 | 组件 | ✏️            │  │
│  └────────────────────────────────┘  │
│  [+ 添加]                            │
└──────────────────────────────────────┘
```

### 四、device-editor.tsx 变更

1. **ProcessEditor 调用** — 新增 `gpio={gpio}` prop
2. **addProcess()** — 去掉 step 模板中的 `delay: 0`
3. **addStep()** — 去掉 `delay: 0`

---

## 移除的内容

- Step 类型中的 `delay` 和 `trigger` 字段
- ProcessStepEditor 中的「延迟运行」和「触发按钮」UI 块
- `buttonOptions` 变量及 `toOptions(gpio.buttons)` 调用（从 ProcessStepEditor）

## 新增的内容

- Process 类型中的 `trigger?: string`
- ProcessEditor 中的「触发按钮」Select 字段 + `gpio` prop
- ProcessStepEditor 中负载 Select 的 `allowClear` + 启动/停止参数的 `disabled` 联动

## 不变的内容

- ProcessStepEditor 的其他字段（名称、超时、禁用、中断）
- ProcessEditor 的其他字段（功能名称、步骤表格）
- ProcessInterruptEditor（完全不变）
- device-editor.tsx 的嵌套 Drawer 架构
