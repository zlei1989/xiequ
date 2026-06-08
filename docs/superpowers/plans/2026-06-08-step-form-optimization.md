# 步骤表单优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化步骤编辑表单：删除"延迟运行"字段、负载改为可选并联动禁用启动/停止参数、触发按钮从步骤级提升到流程级。

**Architecture:** 四个文件协同变更——types.ts 定义数据模型（Step 去 delay/trigger 加 component 可选，Process 加 trigger），process-step-editor.tsx 精简表单字段并加联动逻辑，process-editor.tsx 新增触发按钮下拉框，device-editor.tsx 调整 props 传递和模板数据。

**Tech Stack:** React 19 + TypeScript + Ant Design 6

---

### 文件结构

| 文件 | 职责 | 变更类型 |
|------|------|----------|
| `app/watering/types.ts` | Step / Process 类型定义 | 修改 |
| `app/watering/components/process-step-editor.tsx` | 步骤编辑表单 UI | 修改 |
| `app/watering/components/process-editor.tsx` | 流程编辑表单 UI | 修改 |
| `app/watering/components/device-editor.tsx` | 设备编辑器（编排层） | 修改 |

---

### Task 1: types.ts — Step 和 Process 类型变更

**Files:**
- Modify: `app/watering/types.ts:1-11`

- [ ] **Step 1: 修改 Step 类型**

将 `component` 改为可选，删除 `trigger` 和 `delay` 字段。

```typescript
// 流程步骤
export type Step = {
  name: string;
  component?: string;
  value: { begin: unknown; end: unknown };
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};
```

- [ ] **Step 2: 修改 Process 类型**

新增 `trigger` 可选字段。

```typescript
// 流程
export type Process = {
  name: string;
  trigger?: string;
  steps: Step[];
};
```

- [ ] **Step 3: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -40
```

预期：只有本次类型变更导致的类型错误（后续 task 会修复），无其他意外错误。

- [ ] **Step 4: Commit**

```bash
git add app/watering/types.ts
git commit -m "refactor(watering): make Step.component optional, remove delay/trigger, add Process.trigger"
```

---

### Task 2: process-editor.tsx — 新增触发按钮 + gpio prop

**Files:**
- Modify: `app/watering/components/process-editor.tsx`

- [ ] **Step 1: 新增导入**

在现有导入中添加 `Select, Empty` from antd 和 `GpioInfo` from hooks。

```typescript
import { Input, Button, Table, Select, Empty } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Process, Step } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";
```

- [ ] **Step 2: 添加 toOptions 辅助函数 + gpio prop**

在组件定义前添加辅助函数，在 props 中添加 `gpio`。

```typescript
/** 从 GPIO 键名列表生成 Select options */
function toOptions(keys: string[] | undefined) {
  if (!keys || keys.length === 0) {
    return [];
  }
  return keys.map((k) => ({ value: k, label: k }));
}

export function ProcessEditor({
  process,
  gpio,
  onChange,
  onRemove,
  onEditStep,
  onAddStep,
}: {
  process: Process;
  gpio: GpioInfo;
  onChange: (updated: Process) => void;
  onRemove: () => void;
  onEditStep: (index: number) => void;
  onAddStep: () => void;
}) {
```

- [ ] **Step 3: 添加触发按钮 UI（功能名称下方，独占整行）**

在功能名称的 `<div>` 块之后、步骤 `<div>` 块之前，插入触发按钮的完整 div 块。

```tsx
  const buttonOptions = toOptions(gpio.buttons);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          功能名称
        </label>
        <Input
          value={process.name}
          onChange={(e) => onChange({ ...process, name: e.target.value })}
          placeholder="输入流程名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          触发按钮
        </label>
        {buttonOptions.length > 0 ? (
          <Select
            value={process.trigger ?? undefined}
            onChange={(v) => onChange({ ...process, trigger: v })}
            options={buttonOptions}
            allowClear
            placeholder="选择触发按钮（可选）"
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用按钮（buttons），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
      </div>

      <div>
        {/* 步骤表格保持不变 */}
```

保持步骤表格及之后的代码不变。

- [ ] **Step 4: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -40
```

预期：process-editor.tsx 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/process-editor.tsx
git commit -m "feat(watering): add trigger button field to ProcessEditor with gpio prop"
```

---

### Task 3: process-step-editor.tsx — 删除延迟运行和触发按钮，负载可选 + 联动禁用

**Files:**
- Modify: `app/watering/components/process-step-editor.tsx`

- [ ] **Step 1: 删除 buttonOptions 变量**

删除第 32 行的 `const buttonOptions = toOptions(gpio.buttons);`。

- [ ] **Step 2: 负载改为可选（添加 allowClear）**

修改负载的 Select 组件：添加 `allowClear`，修改 placeholder。

找到负载部分的 `<Select>`（约第 70-76 行），修改为：

```tsx
        {loadOptions.length > 0 ? (
          <Select
            value={step.component ?? undefined}
            onChange={(v) => onChange({ ...step, component: v })}
            options={loadOptions}
            allowClear
            placeholder="选择负载（可选）"
            style={{ width: "100%" }}
          />
        ) : (
```

- [ ] **Step 3: 删除「触发按钮」整个 div 块**

删除约第 85-105 行的触发按钮 `<div>` 块（从 `<label>触发按钮</label>` 到对应的 `</div>`）。

- [ ] **Step 4: 启动参数添加 disabled 联动**

在启动参数 `<div>` 之前添加 `hasLoad` 常量，给 InputNumber 加 `disabled`。

```tsx
      const hasLoad = !!step.component;

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          启动参数
        </label>
        <InputNumber
          value={step.value.begin as number}
          onChange={(v) =>
            onChange({ ...step, value: { ...step.value, begin: v ?? 0 } })
          }
          disabled={!hasLoad}
          style={{ width: "100%" }}
        />
      </div>
```

- [ ] **Step 5: 停止参数添加 disabled 联动**

```tsx
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          停止参数
        </label>
        <InputNumber
          value={step.value.end as number}
          onChange={(v) =>
            onChange({ ...step, value: { ...step.value, end: v ?? 0 } })
          }
          disabled={!hasLoad}
          style={{ width: "100%" }}
        />
      </div>
```

- [ ] **Step 6: 删除「延迟运行」整个 div 块**

删除约第 133-144 行的延迟运行 `<div>` 块（从 `<label>延迟运行（毫秒）</label>` 到 `</div>`）。

- [ ] **Step 7: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -40
```

预期：process-step-editor.tsx 无类型错误。

- [ ] **Step 8: Commit**

```bash
git add app/watering/components/process-step-editor.tsx
git commit -m "refactor(watering): remove delay/trigger from step editor, make load optional with disable cascade"
```

---

### Task 4: device-editor.tsx — 传递 gpio + 清理模板数据

**Files:**
- Modify: `app/watering/components/device-editor.tsx`

- [ ] **Step 1: ProcessEditor 调用处添加 gpio prop**

找到 `<ProcessEditor` 调用（约第 475 行），添加 `gpio={gpio}`：

```tsx
          <ProcessEditor
            process={form.processes[processIndex]}
            gpio={gpio}
            onChange={(updated) => updateProcess(processIndex, updated)}
            onRemove={deleteProcess}
            onEditStep={(stepIdx) => {
              setStepIndex(stepIdx);
              setStepVisible(true);
            }}
            onAddStep={addStep}
          />
```

- [ ] **Step 2: addProcess() 去掉 step 模板中的 delay**

找到 `addProcess` 函数（约第 89-110 行），去掉 `delay: 0`：

```typescript
  function addProcess() {
    const item: Process = {
      key: crypto.randomUUID(),
      name: "新流程",
      steps: [
        {
          key: crypto.randomUUID(),
          name: "新步骤",
          component: gpio.loads[0] ?? "load_0",
          value: { begin: 255, end: 0 },
          timeout: 600000,
          interrupts: [],
        },
      ],
    };
```

- [ ] **Step 3: addStep() 去掉 step 模板中的 delay**

找到 `addStep` 函数（约第 126-141 行），去掉 `delay: 0`：

```typescript
  function addStep() {
    const proc = { ...form.processes[processIndex] };
    const item: Step = {
      key: crypto.randomUUID(),
      name: "新步骤",
      component: gpio.loads[0] ?? "load_0",
      value: { begin: 0, end: 0 },
      timeout: 600000,
      interrupts: [],
    };
```

- [ ] **Step 4: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit --pretty 2>&1 | head -40
```

预期：零类型错误，编译通过。

- [ ] **Step 5: Commit**

```bash
git add app/watering/components/device-editor.tsx
git commit -m "refactor(watering): pass gpio to ProcessEditor, remove delay from step templates"
```

---

### 最终验证

- [ ] **运行 TypeScript 全量检查**

```bash
npx tsc --noEmit --pretty
```

预期：零错误。

- [ ] **检查 git log 确认提交链完整**

```bash
git log --oneline -5
```
