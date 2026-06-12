# 浇花 Debug 页面重构设计

**日期：** 2026-06-13
**目标：** 将 `app/watering/debug` 的 antd (desktop) 组件替换为 antd-mobile，同时重构 GPIO 传感器分类以匹配固件 ROM 语义。

## 1. 背景

当前 debug 页面使用 antd (desktop) 组件（Card、Button、Select、Input、InputNumber、Space、Row、Col、Tag），与项目主栈 antd-mobile 不一致。此外，传感器统一处理为 0-1024 范围，与 ESP32 固件实际分类（数字/模拟）不符。

## 2. 固件语义对齐

从 `app/watering/rom-v2/README.md` 和源码确认的传感器分类：

| 类型 | 组件 | 键名 | 值域 | 说明 |
|------|------|------|------|------|
| 数字传感器 ×2 | Sensor | `sensor_1`, `sensor_2` | 0/1 | 水浸检测 |
| 模拟传感器 ×3 | AnalogSensor | `sensor_0`, `sensor_3`, `sensor_4` | 0-1024 | 温度、负载电压、电源电压 |
| 按钮 ×5 | Button | `button_0`~`button_4` | 0/1 | 物理按键，默认高电平(1) |
| 负载 ×4 | Motor | `load_0`~`load_3` | 0/255/1024 | 水泵，由 Process 流程驱动 |

## 3. 架构

文件结构不变，仅修改组件实现：

```
app/watering/debug/
├── page.tsx                        # 页面入口（不变）
├── layout.tsx                      # 仅 dev 渲染（不变）
├── hooks/use-iot-simulator.ts      # GpioState 类型调整
└── components/
    ├── device-form.tsx             # 重构：拆分 GPIO 卡片
    ├── event-buttons.tsx           # 重构：2×2 网格 + Popup
    └── response-log.tsx            # 替换 antd Tag/Button
```

## 4. 数据模型变更

```typescript
// 原：统一 sensors
type GpioState = {
  buttons: Record<string, number>;
  sensors: Record<string, number>;  // 5 个，混在一起
  loads: Record<string, number>;
};

// 新：数字/模拟分类
type GpioState = {
  digitalSensors: Record<string, number>;  // sensor_1, sensor_2 — 0/1
  analogSensors: Record<string, number>;   // sensor_0, sensor_3, sensor_4 — 0-1024
  buttons: Record<string, number>;         // button_0~4 — 0/1，默认 1
  loads: Record<string, number>;           // load_0~3 — 纯展示
};

// 默认值
const DEFAULT_GPIO: GpioState = {
  digitalSensors: { sensor_1: 0, sensor_2: 0 },
  analogSensors: { sensor_0: 1024, sensor_3: 0, sensor_4: 355 },
  buttons: { button_0: 1, button_1: 1, button_2: 1, button_3: 1, button_4: 1 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};
```

`buildQuery` 方法需调整：按钮仍以 `sensor:button_x` 发送（固件协议），数字传感器以 `sensor:sensor_x`，模拟传感器以 `sensor:sensor_x`，负载以 `load:load_x`。

## 5. 页面布局与组件映射

页面纵向排列，标题区 + 表单分组：

### 5.0 页面标题

```
┌─ IoT 设备模拟器 ──────────────────┐  ← NavBar back={null}
│ 模拟 ESP32 设备发起 getState / ... │  ← NoticeBar color="default"
├────────────────────────────────────┤
│  Form sections...                  │  ← Space direction="vertical" block
│  Form sections...                  │
└────────────────────────────────────┘
```

- 标题：antd-mobile `<NavBar back={null}>`
- 副标题：antd-mobile `<NoticeBar color="default">`
- 内容区：`<Space direction="vertical" block>` 包裹所有表单分组

### 5.1 设备标识

```
┌─ 设备标识 ─────────────────────┐  ← Form + Form.Header
│ chipId  [5872424              ] │
│ MAC     [20:E7:C8:59:9B:28    ] │
│ stateId [          (只读)      ] │  ← readOnly，getState 响应自动填充
└────────────────────────────────┘
```

- 组件：antd-mobile `<Form>` + `<Form.Header>` + `<Form.Item>` + `<Input>` ×3
- stateId 为 `readOnly`，由 getState 响应自动更新

### 5.2 数字传感器 (×2)

```
┌─ 数字传感器 ───────────────────┐
│ sensor_1 (水浸1)    [Switch ○] │
│ sensor_2 (水浸2)    [Switch ○] │
└────────────────────────────────┘
```

- 组件：antd-mobile `<Switch>`
- 默认值 0，一行一个

### 5.3 模拟传感器 (×3)

```
┌─ 模拟传感器 ───────────────────┐  ← Form + Form.Header
│ sensor_0 (温度)                 │
│ [═══════╪═══════]  [-] 512 [+] │  ← Grid(4col): Slider span=3 + Stepper span=1
│ sensor_3 (负载电压)              │
│ [═══════╪═══════]  [-]   0 [+] │
│ sensor_4 (电源电压)              │
│ [═══════╪═══════]  [-] 355 [+] │
└────────────────────────────────┘
```

- 组件：antd-mobile `<Grid columns={4}>` + `<Slider>` (span=3, 0-1024) + `<Stepper>` (span=1)
- Slider 拖动 + Stepper 步进增减，同一 Form.Item 内双向同步

### 5.4 按钮 (×5)

```
┌─ 按钮 ─────────────────────────┐
│ button_0   [Switch ●]  ← 默认1 │
│ button_1   [Switch ●]          │
│ button_2   [Switch ●]          │
│ button_3   [Switch ●]          │
│ button_4   [Switch ●]          │
│ 切为 0 后 2 秒自动回 1          │
└────────────────────────────────┘
```

- 组件：antd-mobile `<Switch>`
- 默认值 1（模拟物理按键默认高电平）
- **自动复位逻辑**：Switch onChange 若新值为 0，启动 2 秒 `setTimeout`，到期自动 set 回 1。组件卸载时清除定时器防止内存泄漏。若在 2 秒内用户再次手动切回 1，则取消定时器。

### 5.5 负载 (×4) — 纯展示

```
┌─ 负载 ─────────────────────────────────┐  ← Form + Form.Header
│   ⭕ load_0         ⭕ load_1           │  ← Grid columns=2
│    0 停止            180 PWM 71%       │    AutoCenter > ProgressCircle
│                                         │
│   ⭕ load_2         ⭕ load_3           │
│    1024 全速          0 停止            │
└─────────────────────────────────────────┘
```

- 组件：antd-mobile `<Grid columns={2}>` + `<AutoCenter>` + `<ProgressCircle>` ×4
- 颜色规则：0=灰色(`--adm-color-weak`)，1-255=绿色(`--adm-color-success`)，1024=红色(`--adm-color-danger`)
- 百分比计算：PWM 模式下 `percent = value / 255 * 100`；1024=100%；0=0%
- 状态文字：0="停止"，1-255=`PWM xx%`，1024="全速"
- **不可编辑**，值由 getState 响应自动更新

### 5.6 模拟事件

```
┌─ 模拟事件 ────────────────────────────┐
│  ┌──────────┐  ┌──────────┐          │
│  │bootstrap │  │ getState │          │  ← Grid columns={2}
│  └──────────┘  └──────────┘          │
│  ┌──────────┐  ┌──────────┐          │
│  │  change  │  │  finish  │          │
│  └──────────┘  └──────────┘          │
└────────────────────────────────────────┘
```

- 按钮网格：antd-mobile `<Grid columns={2} gap={8}>` + `<Grid.Item>`
- **getState / finish** — 直接发送，无参数
- **bootstrap / change** — 弹出底部 `<Popup>`，内部结构统一：

```
┌─ ← bootstrap 参数 ─────────────────┐  ← NavBar onBack={closePopup}
│                                     │
│  启动原因                            │  ← Form layout="horizontal"
│  ○ 0 (正常上电)                      │    Radio.Group + Space vertical
│  ○ 2 (外部唤醒)                      │
│  ○ 4 (定时器唤醒)                    │
│                                     │
│  ┌──────────────────────────────┐   │
│  │          确认发送              │   │  ← Form footer Button
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

- **bootstrap 参数** — `Radio.Group` 选 cause，通过 `<Form footer={Button}>` 确认发送
- **change 参数** — `Radio.Group` 选 type + `TextArea` 填 message，通过 `<Form footer={Button}>` 确认发送

### 5.7 请求日志

```
┌─ 请求日志 ─────────────── [清空] ─┐  ← Card + extra Button
│ 空态：ErrorBlock status="empty"    │
│                                    │
│ [REQ] 14:30:02      [200]         │  ← List.Item prefix=Tag, extra=Tag
│ /watering/api/get-state?...        │      description=URL(截断/展开)
│ {"code":0,...}                     │      children=timestamp + body
└────────────────────────────────────┘
```

- 容器：antd-mobile `<Card>` + extra `<Button size="mini" color="danger">`
- 空态：antd-mobile `<ErrorBlock status="empty" />`
- 列表：antd-mobile `<List>` + `<List.Item>` > `<Tag>` 标签 + URL 截断/展开
- 样式：Tailwind（`max-h-[400px]`、`overflow-y-auto`、`break-all` 等），仅 `--border-top` 用 CSS 变量
- URL 超出 80 字符自动截断，点击展开/收起

## 6. 错误处理与边界情况

| 场景 | 处理 |
|------|------|
| 按钮定时器 | 组件卸载时 `clearTimeout`，防止内存泄漏 |
| 按钮手动恢复 | 2 秒内用户再次切回 1，取消定时器 |
| Slider/Input 双向绑定 | 防止循环更新：Slider onChange 更新 Input，Input onBlur 更新 Slider |
| 模拟传感器越界 | Stepper/Slider 值超出 0-1024 时自动 clamp |
| 请求中 loading | 所有操作按钮共享 loading 状态，请求中 disabled + 显示 spinner |
| 日志溢出 | 保持当前 max-h-[400px] + overflow-y-auto，无分页 |

## 7. 测试

- 现有 hook 逻辑不变，无需新增 hook 测试
- 按钮自动复位逻辑单元测试：`__tests__/watering/debug/button-autoreset.test.tsx`（3 个测试）
  - 切换为 0 后 2 秒自动回 1
  - 2 秒内手动切回 1 则取消定时器
  - 模拟传感器值 clamp（0-1024 边界）

## 8. 依赖

仅使用 antd-mobile 现有 API，不需要新增 npm 依赖。
- 原有的 antd (desktop) 导入全部移除
- 确认 antd-mobile 已安装且版本可用（项目已有 `components/antd-mobile-compat.tsx`）

## 9. 实施顺序

1. 调整 `use-iot-simulator.ts` 数据模型（GpioState 类型 + buildQuery）
2. 重构 `device-form.tsx`（5 个 GPIO 卡片 — 设备标识、数字、模拟、按钮、负载）
3. 重构 `event-buttons.tsx`（Grid 2×2 按钮 + Popup/Form/Radio.Group）
4. 重构 `response-log.tsx`（自绘标签 + URL 截断展开）
5. 重构 `page.tsx`（NavBar + NoticeBar 标题）
6. 编写测试（按钮复位 + clamp）
7. `npm run format` → `npm run check` → 修复 → `npm run test` 通过

## 10. 附加修复

- `lib/db.ts` — SQLite WASM 设置 `PRAGMA busy_timeout = 5000`，防止并发读写 "database is locked"
