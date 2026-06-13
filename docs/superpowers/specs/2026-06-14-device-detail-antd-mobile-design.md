# 设备详情页 antd-mobile 改造设计

## 目标

将 `app/watering/(subpages)/devices/[chipId]/page.tsx` 及其依赖组件
（`DeviceEditor` + 全部子编辑器）的 antd (桌面端) 组件替换为 antd-mobile (移动端) 组件，
功能逻辑不变。

## 范围

| 文件 | 改动类型 |
|------|----------|
| `app/watering/(subpages)/devices/[chipId]/page.tsx` | 重写 UI 层 |
| `app/watering/components/device-editor.tsx` | 重写 UI 层 |
| `app/watering/components/process-editor.tsx` | 重写 UI 层 |
| `app/watering/components/process-step-editor.tsx` | 重写 UI 层 |
| `app/watering/components/process-interrupt-editor.tsx` | 重写 UI 层 |
| `app/watering/components/schedule-editor.tsx` | 重写 UI 层 |
| `app/watering/components/voltage-config-drawer.tsx` | 重写 UI 层 |

不涉及：hooks、types、layout.tsx、其他页面。

## 组件映射表

### 通用

| antd (桌面) | antd-mobile (移动) | 备注 |
|---|---|---|
| `Button` | `Button` | |
| `Popconfirm` | `Dialog.confirm` | 命令式调用 |
| `message.success/.error` | `Toast.show({ icon })` | |
| `Spin` | `DotLoading` | 居中容器复用 |
| `Space` / `Space.Compact` | CSS flex/gap | antd-mobile 无 Space.Compact |
| `Input` | `Input` | |
| `InputNumber` | `Stepper` | min/step 参数照搬 |
| `Switch` (+ checkedChildren) | `Switch` (无 checkedChildren) | 开关旁用独立文案说明 |
| `<select>` | `Picker` | 通过 `Picker.prompt` 或受控 Picker 实现 |
| `Select` (antd) | `Picker` | 同上 |
| `Table` | `List` (卡片模式) + `SwipeAction` | 左滑删除，点击编辑 |
| `Drawer` | `Popup` (position=bottom) + `NavBar` | 内嵌标题栏统一交互 |
| `Empty` | `ErrorBlock status="empty"` | |
| `Radio.Group` (buttonStyle= solid) | `Selector` | 按钮式单选 |
| `TimePicker` | `DatePicker` (precision= minute) | 见下方特殊处理 |

### 图标

| @ant-design/icons | antd-mobile-icons | 用途 |
|---|---|---|
| `ArrowLeftOutlined` | — (NavBar 内置) | 返回 |
| `SaveOutlined` | `SaveOutline` (手动导入) | 保存 |
| `DeleteOutlined` | `DeleteOutline` | 删除 |
| `PlusOutlined` | `AddOutline` | 添加 |
| `EditOutlined` | — (点击 List.Item 直接触发) | 编辑 |
| `CloseOutlined` | — (NavBar 内置返回) | 关闭 Drawer |

## 各文件设计

### 1. page.tsx — 设备详情页

```
┌──────────────────────────────────┐
│  NavBar                          │
│  ← 设备名称                       │
│              💾 保存  🗑 删除    │
├──────────────────────────────────┤
│                                  │
│  DeviceEditor (全屏内容区)        │
│                                  │
└──────────────────────────────────┘
```

- `NavBar` 左侧返回 → `router.back()`
- `NavBar` 标题 → `config.name || '设备配置'`
- `NavBar` 右侧：`SaveOutline` 图标按钮触发 `saveRef.current()`；`DeleteOutline` 图标按钮 → `Dialog.confirm` → 确认后 `remove()`
- 加载态：`Spin` → `DotLoading` 居中
- `saveRef` 模式不变
- 错误提示：`message.xxx` → `Toast.show({ icon })`

### 2. device-editor.tsx — 设备编辑器主页

#### 表单控件区

```
┌──────────────────────────────────┐
│  List                            │
├──────────────────────────────────┤
│  设备名称          [Input______] │
├──────────────────────────────────┤
│  空闲睡眠          [Switch]      │
│  开启后设备将不接受实时控制        │ ← description
├──────────────────────────────────┤
│  空闲超时 (ms)      [Stepper]    │ ← idleSleep=true 才显示
├──────────────────────────────────┤
│  开机执行          [Picker >]    │ ← "无" + 流程名列表
├──────────────────────────────────┤
│  延迟执行 (ms)      [Stepper]    │
└──────────────────────────────────┘
```

- 所有字段用 `List` 包裹，每字段一个 `List.Item`
- `Switch`: antd-mobile 无 `checkedChildren`，说明文字用 `List.Item` 的 `description` 属性
- `Picker` (开机执行): 两个受控状态 → `visible` + `value`。columns = `[{label: '无', value: -1}, ...processes.map((p,i)=>({label:p.name, value:i}))]`

#### 电压检测配置

```
┌──────────────────────────────────┐
│  电压检测配置              [>]   │
│  未配置 / sensor · R1·R2         │ ← description
└──────────────────────────────────┘
```

- 一个 `List.Item`，`clickable`，右侧箭头
- description 根据是否已配置显示不同文案
- 点击打开电压 Popup

#### 功能列表（原 Table）

```
┌─ 功能 ──────────────────────────┐
│  SwipeAction ← 删除 | 流程名 →  │
│  SwipeAction ← 删除 | 流程名 →  │
├──────────────────────────────────┤
│  [+ 添加功能]                    │
└──────────────────────────────────┘
```

- 用 `List` + `SwipeAction`（官方示例模式，非 card mode）。每个流程一个 `List.Item`，右侧箭头
- `SwipeAction` 包裹每行（`rightActions`），左滑露出红色"删除"按钮
- 删除按钮 → `Dialog.confirm` 确认 → `deleteProcess(index)`
- 点击 `List.Item` → 打开流程编辑 Popup
- 底部 `Button block` "添加功能" → `addProcess()`

#### 计划任务列表（原 Table）

- 结构与功能列表相同
- 每行显示格式化时间（HH:mm）+ 间隔，点击编辑，左滑删除
- 底部 `Button block` "添加任务"

#### 嵌套 Popup 层

将 5 个 `Drawer` 替换为 `Popup`（`position="bottom"`），高度沿用原有百分比：

| Popup | 高度 | 对应编辑器 |
|-------|------|-----------|
| 流程编辑 | 80% | ProcessEditor |
| 步骤编辑 | 75% | ProcessStepEditor |
| 中断编辑 | 70% | ProcessInterruptEditor |
| 定时编辑 | 70% | ScheduleEditor |
| 电压配置 | 60% | VoltageConfigDrawer |

每个 Popup 内部结构：

```
┌──────────────────────────────────┐
│  NavBar:  ← 编辑XXX              │
│                   🗑 删除        │
├──────────────────────────────────┤
│  （编辑器组件内容）                │
└──────────────────────────────────┘
```

- NavBar 左侧返回箭头 → 关闭当前 Popup
- NavBar 右侧删除图标 → `Dialog.confirm` → 删除 + 关闭
- 物理返回键：复用 `useBackButton(visible, onClose)` 机制
- Popup 的 `visible` 状态控制逻辑不变（`processVisible`/`stepVisible` 等 state）
- 子编辑器组件的回调（onChange/onAddXxx/onEditXxx）不变

### 3. process-editor.tsx — 流程编辑器

当前组件：`Input`、`Select`（触发按钮）、`Table`（步骤列表）、`Empty`、`Button`

改造：
- 流程名称：`List.Item` + `Input`
- 触发按钮：`List.Item` + `Picker`（无可用按钮时显示 `ErrorBlock empty`）
- 步骤列表：`List` + `SwipeAction`（同功能列表模式），每行显示名称和组件，点击进入步骤编辑
- 底部 `Button block` "添加步骤"

### 4. process-step-editor.tsx — 步骤编辑器

当前组件（antd）：`Input`、`Select`、`InputNumber`×3（启动参数/停止参数/超时）、`Switch`、`Table`（中断列表）、`Button`、`Empty`

改造：
- 步骤名称：`List.Item` + `Input`
- 负载：`List.Item` + `Picker`（无负载时 `ErrorBlock empty`）
- 启动参数/停止参数：`List.Item` + `Stepper`（无负载时 disabled）
- 超时限制：`List.Item` + `Stepper`
- 禁用：`List.Item` + `Switch`，description 显示"启用/禁用"
- 中断列表：`List` + `SwipeAction`，点击编辑
- 底部 `Button block` "添加中断"

### 5. process-interrupt-editor.tsx — 中断编辑器

当前组件（antd）：`Input`、`Select`（传感器）、`Radio.Group`（信号类型、逻辑）、`Switch`（触发状态/禁用）、`InputNumber`×4

改造：
- 中断名称：`List.Item` + `Input`
- 传感器：`List.Item` + `Picker`（无传感器时 `ErrorBlock empty`）
- **信号类型**：`Selector`（`options: [{label:'数字信号',value:'digital'},{label:'模拟信号',value:'analog'}]`），替代 `Radio.Group`
- 数字信号 → 触发状态：`List.Item` + `Switch`，description "触发(1)/未触发(0)"
- 模拟信号 → 逻辑：`Selector`（`options: [{label:'大于',value:'>'},{label:'小于',value:'<'}]`）
- 模拟信号 → 触发阈值：`List.Item` + `Stepper`
- 屏蔽抖动间隔：`List.Item` + `Stepper`
- 延迟检测：`List.Item` + `Stepper`
- 持续时间：`List.Item` + `Stepper`
- 禁用：`List.Item` + `Switch`

### 6. schedule-editor.tsx — 定时任务编辑器

当前组件（antd）：`Select`（类型）、`InputNumber`（间隔）、`TimePicker`、`Select`（执行流程）、`Switch`

改造：
- 类型：`List.Item` + `Picker`（选项：每天/每分钟/每周/每月）
- **时间选择**：antd-mobile `DatePicker`（`precision='minute'`），点击触发

  **时间值转换**（关键）：
  - 显示：`dayjs().startOf('day').add(schedule.value, 'millisecond')` → Date
  - 保存：`DatePicker` 返回 `Date | null` → `dayjs(d).diff(dayjs().startOf('day'), 'millisecond')` 转回毫秒偏移量
  - 注意：DatePicker 返回完整日期，但只需要时间部分（距 00:00 的毫秒偏移），丢弃日期部分

- 间隔（天）：`List.Item` + `Stepper`
- 执行流程：`List.Item` + `Picker`（选项为流程名列表）
- 禁用：`List.Item` + `Switch`

### 7. voltage-config-drawer.tsx — 电压检测配置

当前组件（antd）：`Drawer`、`Select`、`InputNumber`、`Space.Compact`、`Button`

改造为 `Popup` + `NavBar`：

```
┌──────────────────────────────────┐
│  NavBar:  ← 电压检测配置          │
├──────────────────────────────────┤
│  电压检测传感器     [Picker >]   │
│  选择 ADC 传感器引脚              │
├──────────────────────────────────┤
│  R1 电阻值 (Ω)     [Stepper] Ω   │ ← flex 行内放 Stepper + "Ω" 文字
│  分压电阻 R1，上拉至被测电压       │
├──────────────────────────────────┤
│  R2 电阻值 (Ω)     [Stepper] Ω   │
│  分压电阻 R2，下拉至 GND          │
├──────────────────────────────────┤
│  ┌ 计算公式 ──────────────────┐  │
│  │ V实际 = V传感器×(R1+R2)/R2 │  │
│  │ 当前分压比: 4.00           │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

- `Drawer` → `Popup` position=bottom height=60%
- `Select` → `Picker`
- `InputNumber` → `Stepper`
- `Space.Compact`（InputNumber + "Ω" Button）→ flex 行：`Stepper` + `<span>Ω</span>`
- `Button` (关闭) → NavBar 内置返回箭头
- 关闭逻辑：`handleClose` 函数不变

## 数据流不变

- `page.tsx` → `useDeviceConfig(chipId)` → config/gpio/loading/save/remove
- `saveRef` 模式：DeviceEditor `useEffect` 注册 `handleSave` → Header 保存按钮通过 ref 调用
- 嵌套 CRUD 冒泡：ProcessEditor/StepEditor/InterruptEditor 的增删改操作 → `onChange` → DeviceEditor `setForm`
- 物理返回键：`useBackButton(visible, close)` 处理各层 Popup

## 测试策略

- 现有功能行为不变，回归测试覆盖即可
- vitest 单元测试确保 saveRef 机制、嵌套 CRUD 逻辑正确
- 手动验证：各 Popup 打开/关闭/嵌套、Picker 选择、Stepper 步进、SwipeAction 删除、Dialog.confirm 确认

## 注意事项

1. **Stepper 大数值场景**：空闲超时默认 30000ms、step=1000，需点击 30 次。当前阶段按方案 A 使用 Stepper，若后续反馈不佳可单独将特定字段换为 `Input type="number"`
2. **DatePicker 时间选择**：DatePicker 返回完整日期，转换时取 `dayjs().startOf('day')` 差值，丢弃日期部分
3. **SwipeAction 与 List 卡片模式**：`List` 的 `mode="card"` 和 `SwipeAction` 需要确认版本兼容，必要时用 Card 组件替代
4. **图标来源**：`antd-mobile-icons` 需要单独安装，项目中可能已有。若缺少 `SaveOutline`/`AddOutline`，可用 antd-mobile 内置的 `RightOutline`/`AddCircleOutline` 等替代
