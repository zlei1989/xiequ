# 表单选项统一为 Selector 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 4 个表单 Pickers 中的单选字段从 `Picker.prompt()` 统一改为内联 `Selector`

**Architecture:** 每个文件独立改造，模式一致——删除 `Form.Item` 的 `onClick` + `Picker.prompt()` + `Input`/`<div>` 包裹，替换为内嵌 `<Selector>`。可为空的字段（触发按钮、负载）利用 Selector 自带 toggle 行为；无选项时统一用 `ErrorBlock` 降级。

**Tech Stack:** antd-mobile (Selector, ErrorBlock), React, TypeScript

---

### Task 1: process-config-picker.tsx — 触发按钮

**Files:**
- Modify: `app/watering/components/process-config-picker.tsx`
- Test: `__tests__/watering/components/process-editor.test.tsx`（无需变更，仅验证）

- [ ] **Step 1: 更新 import**

将 L10 的 import 行替换——移除 `Input`、`Picker`，新增 `Selector`：

```tsx
import { ErrorBlock, Selector, Button, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
```

`ErrorBlock` 已存在，无需新增。

- [ ] **Step 2: 替换触发按钮 UI**

找到 (L104-124) `Form.Item label="触发按钮"` 区块，整体替换：

```tsx
<Form.Item label="触发按钮">
  {buttonOptions.length > 0 ? (
    <Selector
      options={buttonOptions}
      value={draft.trigger ? [draft.trigger] : []}
      onChange={(vals) => update({ trigger: vals.length > 0 ? vals[0] : undefined })}
    />
  ) : (
    <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用按钮" />
  )}
</Form.Item>
```

- [ ] **Step 3: 格式化与检查**

```bash
npm run format && npm run check
```

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/process-config-picker.tsx
git commit -m "refactor: replace trigger button Picker with Selector in ProcessConfigPicker"
```

---

### Task 2: voltage-config-picker.tsx — 电压检测传感器

**Files:**
- Modify: `app/watering/components/voltage-config-picker.tsx`
- Test: `__tests__/watering/components/voltage-config-picker.test.tsx`（无需变更，仅验证）

- [ ] **Step 1: 更新 import**

将 L11 的 import 行替换——移除 `Picker`、`Input`，新增 `Selector`、`ErrorBlock`：

```tsx
import { Popup, NavBar, Selector, Stepper, Form, Card, ErrorBlock } from 'antd-mobile';
```

- [ ] **Step 2: 替换传感器选择 UI**

找到 (L110-130) `Form.Item label="电压检测传感器"` 区块，整体替换：

```tsx
<Form.Item
  help="选择用于电压检测的 ADC 传感器引脚"
  label="电压检测传感器"
>
  {sensorColumns.length > 0 ? (
    <Selector
      options={sensorColumns}
      value={[config.sensor]}
      onChange={(vals) => {
        if (vals.length > 0) update({ sensor: vals[0] });
      }}
    />
  ) : (
    <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用传感器" />
  )}
</Form.Item>
```

- [ ] **Step 3: 格式化与检查**

```bash
npm run format && npm run check
```

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/voltage-config-picker.tsx
git commit -m "refactor: replace voltage sensor Picker with Selector in VoltageConfigPicker"
```

---

### Task 3: step-config-picker.tsx — 负载

**Files:**
- Modify: `app/watering/components/step-config-picker.tsx`
- Modify: `__tests__/watering/components/step-config-picker.test.tsx`

- [ ] **Step 1: 更新 import**

将 L10 的 import 行替换——移除 `Picker`，新增 `Selector`、`ErrorBlock`（`Input` 保留，步骤名称仍使用）：

```tsx
import { Input, Stepper, Switch, Selector, ErrorBlock, Button, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
```

- [ ] **Step 2: 替换负载选择 UI**

找到 (L97-118) `Form.Item label="负载"` 区块，整体替换：

```tsx
<Form.Item
  help={loadOptions.length === 0 ? '请等待设备上报 GPIO 状态' : undefined}
  label="负载"
>
  {loadOptions.length > 0 ? (
    <Selector
      options={loadOptions}
      value={step.component ? [step.component] : []}
      onChange={(vals) => update({ component: vals.length > 0 ? vals[0] : undefined })}
    />
  ) : (
    <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用负载" />
  )}
</Form.Item>
```

- [ ] **Step 3: 更新测试断言**

`__tests__/watering/components/step-config-picker.test.tsx` L72，将 `getByPlaceholderText` 改为 `getByText`（`ErrorBlock` 渲染的是文本节点而非 Input placeholder）：

```tsx
// 旧：expect(screen.getByPlaceholderText('无可用负载')).toBeDefined();
// 新：
expect(screen.getByText('无可用负载')).toBeDefined();
```

- [ ] **Step 4: 运行测试验证**

```bash
npx vitest run __tests__/watering/components/step-config-picker.test.tsx
```

预期：全部通过。

- [ ] **Step 5: 格式化与检查**

```bash
npm run format && npm run check
```

- [ ] **Step 6: Commit**

```bash
git add app/watering/components/step-config-picker.tsx __tests__/watering/components/step-config-picker.test.tsx
git commit -m "refactor: replace load Picker with Selector in StepConfigPicker"
```

---

### Task 4: schedule-config-picker.tsx — 定时任务类型

**Files:**
- Modify: `app/watering/components/schedule-config-picker.tsx`
- Test: `__tests__/watering/components/schedule-editor.test.tsx`（无需变更，`getByText('每天')` 仍有效）

- [ ] **Step 1: 更新 import**

将 L11 的 import 行替换——新增 `Selector`（`Picker` 保留，"执行流程"字段仍使用 `Picker.prompt()`）：

```tsx
import { Stepper, Switch, Picker, Selector, DatePicker, Popup, NavBar, Form, Dialog, Button } from 'antd-mobile';
```

- [ ] **Step 2: 替换类型选择 UI**

找到 (L104-121) `Form.Item label="类型"` 区块，整体替换：

```tsx
<Form.Item label="类型">
  <Selector
    options={TYPE_OPTIONS}
    value={[draft.type]}
    onChange={(vals) => {
      if (vals.length > 0) update({ ...draft, type: vals[0] as ScheduleConfig['type'] });
    }}
  />
</Form.Item>
```

- [ ] **Step 3: 格式化与检查**

```bash
npm run format && npm run check
```

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/schedule-config-picker.tsx
git commit -m "refactor: replace schedule type Picker with Selector in ScheduleConfigPicker"
```

---

### Task 5: 全量测试验证

- [ ] **Step 1: 运行全部浇水模块测试**

```bash
npx vitest run __tests__/watering/
```

预期：全部通过。

- [ ] **Step 2: 最终格式化与检查**

```bash
npm run format && npm run check
```

预期：无错误。
