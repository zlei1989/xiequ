# 浇花 Debug 页面重构设计

**日期：** 2026-06-13
**目标：** 将 `app/watering/debug` 的 antd (desktop) 组件替换为 antd-mobile，同时重构 GPIO 传感器分类以匹配固件 ROM 语义。

## 1. 背景

当前 debug 页面使用 antd (desktop) 组件（Card、Button、Select、Input、InputNumber、Space、Row、Col、Tag），与项目主栈 antd-mobile 不一致。此外，传感器统一处理为 0-1023 范围，与 ESP32 固件实际分类（数字/模拟）不符。

## 2. 固件语义对齐

从 `app/watering/rom-v2/README.md` 和源码确认的传感器分类：

| 类型 | 组件 | 键名 | 值域 | 说明 |
|------|------|------|------|------|
| 数字传感器 ×2 | Sensor | `sensor_1`, `sensor_2` | 0/1 | 水浸检测 |
| 模拟传感器 ×3 | AnalogSensor | `sensor_0`, `sensor_3`, `sensor_4` | 0-1023 | 温度、负载电压、电源电压 |
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
  analogSensors: Record<string, number>;   // sensor_0, sensor_3, sensor_4 — 0-1023
  buttons: Record<string, number>;         // button_0~4 — 0/1，默认 1
  loads: Record<string, number>;           // load_0~3 — 纯展示
};

// 默认值
const DEFAULT_GPIO: GpioState = {
  digitalSensors: { sensor_1: 0, sensor_2: 0 },
  analogSensors: { sensor_0: 1827, sensor_3: 0, sensor_4: 355 },
  buttons: { button_0: 1, button_1: 1, button_2: 1, button_3: 1, button_4: 1 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};
```

`buildQuery` 方法需调整：按钮仍以 `sensor:button_x` 发送（固件协议），数字传感器以 `sensor:sensor_x`，模拟传感器以 `sensor:sensor_x`，负载以 `load:load_x`。

## 5. 页面布局与组件映射

页面纵向排列，标题区 + 7 个卡片：

### 5.0 页面标题

```
┌─ IoT 设备模拟器 ──────────────────┐  ← NavBar back={null}
│ 模拟 ESP32 设备发起 getState / ... │  ← NoticeBar color="default"
└────────────────────────────────────┘
```

- 标题：antd-mobile `<NavBar back={null}>`
- 副标题：antd-mobile `<NoticeBar color="default">`

### 5.1 设备标识

```
┌─ 设备标识 ─────────────────────┐
│ chipId  [5872424              ] │
│ MAC     [20:E7:C8:59:9B:28    ] │
│ stateId [                      ] │
└────────────────────────────────┘
```

- 组件：antd-mobile `<Input>` ×3
- 去掉原 Space.Compact + disabled Button 装饰

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
┌─ 模拟传感器 ───────────────────┐
│ sensor_0 (温度)                 │
│ [═══════╪═══════] 512  [输入框]│
│ sensor_3 (负载电压)              │
│ [═══════╪═══════] 0    [输入框]│
│ sensor_4 (电源电压)              │
│ [═══════╪═══════] 355  [输入框]│
└────────────────────────────────┘
```

- 组件：antd-mobile `<Slider>` (0-1023) + `<Input>` (手动输入精确值)
- 双向绑定：Slider 拖动更新 Input，Input 输入更新 Slider

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
┌─ 负载 ────────────────────────────────┐
│   ⭕ load_0    ⭕ load_1              │
│    0 停止       180 PWM 71%          │
│                                        │
│   ⭕ load_2    ⭕ load_3              │
│    1024 全速     0 停止               │
└────────────────────────────────────────┘
```

- 组件：antd-mobile `<ProgressCircle>` ×4，2×2 网格排列
- 颜色规则：0=灰色(#999)，1-255=绿色(#52c41a)，1024=红色(#ff4d4f)
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
┌─ 请求日志 ─────────────── [清空] ─┐
│ ┌ REQ ┐ 14:30:02  ┌ 200 ┐       │
│ /watering/api/get-state?...       │
│                                   │
│ ┌ RES ┐ 14:30:02  ┌ 200 ┐       │
│ { "code": 0, ... }                │
└───────────────────────────────────┘
```

- 组件：antd-mobile `<Card>` + header extra `<Button size="mini">`
- 日志条目：自定义 CSS（当前已无重度 antd 依赖），将 `<Tag>` 替换为自绘标签
- 新增：对请求 URL 自动省略过长部分，点击可展开完整 URL

## 6. 错误处理与边界情况

| 场景 | 处理 |
|------|------|
| 按钮定时器 | 组件卸载时 `clearTimeout`，防止内存泄漏 |
| 按钮手动恢复 | 2 秒内用户再次切回 1，取消定时器 |
| Slider/Input 双向绑定 | 防止循环更新：Slider onChange 更新 Input，Input onBlur 更新 Slider |
| 模拟传感器越界 | Input 输入超出 0-1023 时自动 clamp |
| 请求中 loading | 所有操作按钮共享 loading 状态，请求中 disabled + 显示 spinner |
| 日志溢出 | 保持当前 max-h-[400px] + overflow-y-auto，无分页 |

## 7. 测试

- 现有 hook 逻辑不变，无需新增 hook 测试
- 按钮自动复位逻辑需新增单元测试：`__tests__/watering/debug/button-autoreset.test.ts`
  - 切换为 0 后 2 秒自动回 1
  - 2 秒内手动切回 1 则取消定时器
  - 组件卸载时清除定时器
- 模拟传感器 clamp 逻辑需测试
- antd-mobile 组件仅做渲染测试（快照或存在性断言）

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
