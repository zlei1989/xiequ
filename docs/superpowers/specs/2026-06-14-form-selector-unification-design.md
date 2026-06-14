# 表单选项统一为 Selector 交互设计

**日期**：2026-06-14
**目标**：将设备配置表单中的单选字段统一从 `Picker.prompt()` 改为内联 `Selector`，统一交互逻辑。

## 背景

`interrupt-config-picker.tsx` 已使用 antd-mobile `Selector` 组件处理传感器、信号类型、比较逻辑等单选字段，体验优于弹窗式的 `Picker.prompt()`。以下四个字段目前仍用 `Picker.prompt()`，需统一：

- 触发按钮（`ProcessConfigPicker`）
- 电压检测传感器（`VoltageConfigPicker`）
- 负载（`StepConfigPicker`）
- 定时任务类型（`ScheduleConfigPicker`）

## 交互规则

| 字段 | 文件 | 可为空 | 允许取消选中 |
|------|------|--------|--------------|
| 触发按钮 | `process-config-picker.tsx` | 是 | 是 |
| 电压检测传感器 | `voltage-config-picker.tsx` | 否 | 否 |
| 负载 | `step-config-picker.tsx` | 是 | 是 |
| 定时任务类型 | `schedule-config-picker.tsx` | 否 | 否 |

可为空的字段：点击已选中的选项取消选中（toggle 行为），`onChange` 传空数组时对应字段置为 `undefined`。
不可为空的字段：与 `interrupt-config-picker` 一致的标准单选行为。

无可用选项时的降级：统一使用 `ErrorBlock` 显示空状态提示，不渲染 `Selector`。

## 文件级改动

### 1. `process-config-picker.tsx` — 触发按钮

**删除**：`Form.Item` 的 `onClick` 属性及 `Picker.prompt()` 调用、`Input` 包裹。
**新增**：内嵌 `<Selector>`，allowEmpty 逻辑。

```
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

**Import 清理**：移除 `Picker`、`Input`，新增 `Selector`。

### 2. `voltage-config-picker.tsx` — 电压检测传感器

**删除**：`Form.Item` 的 `onClick` 属性及 `Picker.prompt()` 调用、`Input` 包裹。
**新增**：内嵌 `<Selector>`，标准单选（不可取消）。无传感器时显示 `ErrorBlock`。

```
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

**Import 清理**：移除 `Picker`、`Input`，新增 `Selector`、`ErrorBlock`。

### 3. `step-config-picker.tsx` — 负载

**删除**：`Form.Item` 的 `onClick` 属性及 `Picker.prompt()` 调用、`Input` 包裹。
**新增**：内嵌 `<Selector>`，allowEmpty 逻辑。无负载时显示 `ErrorBlock`。

```
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

**Import 清理**：移除 `Picker`，新增 `Selector`、`ErrorBlock`。`Input` 保留（步骤名称仍使用）。

### 4. `schedule-config-picker.tsx` — 定时任务类型

**删除**：`Form.Item` 的 `onClick` 属性及 `Picker.prompt()` 调用、`<div>` 包裹。
**新增**：内嵌 `<Selector>`，标准单选（不可取消），复用已有 `TYPE_OPTIONS`。

```
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

**Import 清理**：新增 `Selector`。`Picker` 保留（"执行流程"字段仍使用 `Picker.prompt()`）。

## 测试更新

### `step-config-picker.test.tsx` L72

**变更**：`getByPlaceholderText('无可用负载')` → `getByText('无可用负载')`
**原因**：负载字段从 `Input`（有 placeholder）改为 `ErrorBlock`，文本内容不变。

### `schedule-editor.test.tsx` L33

`getByText('每天')` 仍可通过——`Selector` 会渲染选项 label 文本。

### 其他测试文件

`process-editor.test.tsx`、`voltage-config-picker.test.tsx` 不依赖具体的选项控件交互方式，无需变更。
