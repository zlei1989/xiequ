# 传感器配置内联列表设计

**日期**：2026-06-16

## 目标

将传感器配置参考功能从弹层式列表改为表单内嵌列表，与"功能"列表同模式。点击列表项弹出编辑层，不在弹层里显示列表。

## 当前状态

`SensorConfigPicker` 是两层 Popup 结构：
- 列表层（70vh）：SortableList + SwipeAction 删除 + 拖拽排序 + 添加按钮
- 编辑层（60vh）：Form 表单

`DeviceConfigForm` 中传感器仅显示为一条摘要行（"已配置 N 项 / 未配置"），点击打开 SensorConfigPicker 列表层。

"功能"列表是直接内嵌在表单中的 SortableList + SwipeAction 模式，传感器列表应改为同样方式。

## 变更方案（方案 B：DeviceConfigForm 接管列表，SensorConfigPicker 仅做编辑）

### 组件职责变更

**SensorConfigPicker → 降为纯编辑组件**

- 去掉外层 Popup / SortableList / SwipeAction / 删除逻辑
- 只保留编辑 Popup，props 简化为：

| Props | 类型 | 说明 |
|-------|------|------|
| `open` | boolean | 编辑层显隐 |
| `sensor` | SensorConfig | 当前编辑的传感器 |
| `gpio` | GpioInfo | 传感器引脚选项 |
| `onConfirm` | `(s: SensorConfig) => void` | 确认回调 |
| `onClose` | `() => void` | 关闭回调 |

**DeviceConfigForm → 接管传感器列表**

- 在基本设置区下方、功能列表上方新增传感器 `SortableList` 区域
- 模式与"功能"列表一致：SortableList + SwipeAction 右划删除 + 拖拽排序 + 底部"添加"按钮
- 点击列表项 → 打开 SensorConfigPicker 编辑 Popup

### 列表项摘要增强

新增 `formatSensorDesc(s: SensorConfig): string`，根据类型/转换显示：

- 数字信号：`sensor_0 · 数字`
- 模拟信号（无转换）：`sensor_1 · 模拟 · ADC`
- 分压：`sensor_0 · 模拟 · 分压 · R1=30kΩ R2=10kΩ`
- 温感：`sensor_1 · 模拟 · 温感 · B=3435`

### 数据流

DeviceConfigForm 新增状态：
- `sensorEditVisible: boolean`
- `editingSensor: SensorConfig | null`

交互：
1. 点击列表项 → `setEditingSensor(sensor)` + `setSensorEditVisible(true)`
2. 点击"添加" → `setEditingSensor(defaultSensor(gpio))` + `setSensorEditVisible(true)`
3. 编辑确认 → 更新 `form.sensors` → 关闭 Popup
4. 右划删除 → Dialog 确认 → filter 移除
5. 拖拽排序 → arrayMove 重排

### 数据状态管理（用户明确要求方案 B）

传感器列表数据由 `DeviceConfigForm` 的 `form.sensors` 管理，与"功能"列表（`form.processes`）相同的模式：
- 增删改排序直接在 `form.sensors` 上操作
- `setForm` 触发更新
- 保存时通过 `handleSave` 一并提交

### 代码变更范围

| 文件 | 变更 |
|------|------|
| `components/sensor-config-picker.tsx` | 去掉外层 Popup / 列表逻辑，只保留编辑 Popup；props 简化为 5 个 |
| `components/device-config-form.tsx` | 新增传感器 SortableList 区域；新增编辑/删除/排序操作；移除传感器摘要行 |
| `utils/format-desc.ts` | 新增 `formatSensorDesc` 函数 |

### 不修改

- 编辑 Popup 内部 Form 结构不变
- `types.ts` 类型定义不变
- 其他列表（功能、计划任务）不动
