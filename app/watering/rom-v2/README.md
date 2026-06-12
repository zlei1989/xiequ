# 自动浇花系统 Lite v2.0

基于 ESP32 的智能自动浇花系统控制器固件，通过 WiFi 连接服务端实现远程控制与状态同步，支持多步骤自动化浇花流程、中断检测及深度睡眠省电模式。

## 功能特性

- **4 路水泵控制** — PWM 调速 / 开关模式，支持渐变启动
- **远程流程执行** — 服务端下发多步骤浇花流程，设备按序执行
- **中断检测** — 流程执行中可基于传感器/按钮条件提前终止步骤
- **传感器监测** — 温度（模拟量）、水浸×2（数字量）、电压×2（模拟量）
- **5 路物理按钮** — 短按 / 长按检测，可作为中断源
- **LED 指示灯** — 状态反馈（连接成功闪烁、收到指令闪烁等）
- **深度睡眠** — 服务端控制休眠时长，定时器唤醒重启
- **异步状态轮询** — 异步 HTTP 拉取服务端状态，同步/异步互斥保护

## 系统架构

```
┌──────────────────────────────────────────────────┐
│                   服务端 (Cloud)                   │
│         getState / pushState API                  │
└──────────────┬───────────────────▲────────────────┘
               │ HTTP (异步轮询)    │ HTTP (同步推送)
               ▼                   │
┌──────────────────────────────────────────────────┐
│               NetworkExt (网络控制器)              │
│  WiFi 连接 · 状态轮询 · 事件推送 · invoke 回调队列  │
└──────────────┬───────────────────┬────────────────┘
               │                   │
               ▼                   ▼
┌──────────────────────────┐  ┌─────────────────────┐
│    Process (流程处理器)    │  │    传感器 / 按钮组件   │
│ 步骤执行 · 超时 · 中断检测 │  │ 温度 · 水浸 · 电压   │
└──────────────┬───────────┘  └─────────────────────┘
               ▼
┌──────────────────────────┐
│    Motor (水泵 ×4)       │
│ PWM 调速 · 渐变启动       │
└──────────────────────────┘
```

**工作流程：**

1. `setup()` — 初始化硬件、注册组件到 Process、配置网络
2. `loop()` — 轮询所有组件的 `next()` 方法驱动状态更新
3. 网络连接成功后上报开机信息（bootstrap）
4. 异步轮询服务端状态，状态变化时触发回调
5. 回调中解析指令：启动流程 / 终止流程 / 进入深度睡眠
6. 流程执行中实时推送状态变更到服务端

## 硬件引脚映射

| 引脚 | GPIO | 功能 | 类型 |
|------|------|------|------|
| LED 指示灯 | 13 | 状态反馈 | OUTPUT（低电平点亮） |
| 水泵 0 | 26 | PWM 控制 | OUTPUT |
| 水泵 1 | 33 | PWM 控制 | OUTPUT |
| 水泵 2 | 25 | PWM 控制 | OUTPUT |
| 水泵 3 | 32 | PWM 控制 | OUTPUT |
| 温度传感器 | 35 | 模拟输入 | INPUT |
| 水浸传感器 1 | 0 | 数字输入 | INPUT |
| 水浸传感器 2 | 4 | 数字输入 | INPUT |
| 负载电压 | 39 | 模拟输入 | INPUT |
| 电源电压 | 36 | 模拟输入 | INPUT |
| 按钮 0~4 | 18, 19, 21, 22, 23 | 数字输入 | INPUT |

## 项目结构

```
v2.0/
├── v2.0.ino          # 主程序入口（setup/loop/回调实现）
├── config.h          # 全局配置（WiFi、服务端地址、调试模式）
├── Process.h/.cpp    # 流程处理器（多步骤执行、超时、中断检测）
├── NetworkExt.h/.cpp # 网络控制器（WiFi、HTTP 状态同步）
├── Motor.h/.cpp      # 水泵控制（PWM 调速、渐变启动）
├── Button.h/.cpp     # 按钮检测（短按/长按，实现 IInterruptComponent）
├── Sensor.h/.cpp     # 数字传感器（水浸检测，实现 IInterruptComponent）
├── AnalogSensor.h/.cpp # 模拟传感器（温度/电压，实现 IInterruptComponent）
├── Light.h/.cpp      # LED 指示灯（点亮/熄灭/闪烁）
├── utils.h/.cpp      # 工具函数（电压计算、设备名称、日志输出）
└── .gitignore
```

## 核心类说明

### Process — 流程处理器

管理和执行服务端下发的自动化浇花流程：

- **组件注册** — 将负载（`Motor`）和传感器（`Sensor`/`Button`/`AnalogSensor`）注册为流程可用组件
- **步骤执行** — 按 JSON 配置顺序驱动负载，每步可设延迟启动和超时
- **中断检测** — 步骤执行期间检测传感器/按钮状态，满足条件提前结束
- **回调通知** — 步骤就绪/开始/结束/超时/中断时触发 `ChangeHandler`，流程完成触发 `FinishHandler`

### 接口体系

```
IStepComponent          ← Motor 实现（流程步骤可控制）
  ├── setJsonValue()    设置运行参数（PWM 占空比）
  └── getValue()        获得当前值

IInterruptComponent     ← Sensor / AnalogSensor / Button 实现（流程中断可检测）
  ├── getState()        获得当前状态
  └── getLastTimestamp() 获得最后变化时间戳
```

### Motor — 水泵控制

- **PWM 调速模式**：占空比 0~255，启动时从目标值 1/3 渐变加速
- **开关模式**：目标值 1024 时直接输出高电平
- **低功耗**：关闭时切换引脚为 INPUT 模式

### NetworkExt — 网络控制器

- WiFi STA 模式连接及自动重连
- 异步 GET 轮询服务端状态（`getState`）
- 同步 GET 推送事件（`pushState`：bootstrap / change / finish）
- `invoke()` 延迟回调队列，网络空闲时执行，失败自动重试
- `_busy` 标志实现同步/异步 HTTP 互斥保护

## 配置说明

编辑 [config.h](config.h) 修改以下配置：

```c
// 调试模式（启用后串口输出日志，波特率 115200）
#define DEBUG_MODE true

// WiFi 凭据
#define WIFI_SSID "your-ssid"
#define WIFI_PASSWORD "your-password"

// 服务端地址
#define URL_PREFIX "http://xiequ.7qbjs.com/api/iot-wfm/"

// 版本号
#define IOT_VERSION "2.0"
```

## 编译与烧录

1. 安装 [Arduino IDE](https://www.arduino.cc/en/software) 或 PlatformIO
2. 安装 ESP32 开发板支持（Board Manager 搜索 `esp32`）
3. 安装依赖库：
   - [ArduinoJson](https://github.com/bblanchon/ArduinoJson)
   - [AsyncHTTPRequest_Generic](https://github.com/khoih-prog/AsyncHTTPRequest_Generic)
4. 选择开发板：`ESP32 Dev Module`
5. 打开 `v2.0.ino`，编译并烧录

## 服务端通信协议

设备通过 HTTP GET 与服务端交互，API 基于腾讯云函数。所有请求均通过 URL 查询参数传递数据，参数自动经过 URL 编码。

| 接口 | 方法 | 说明 |
|------|------|------|
| `getState` | GET | 轮询获取设备状态（含流程配置） |
| `pushState` | GET | 推送事件（bootstrap / change / finish） |

### 公共参数

所有请求均包含以下基础参数和组件状态参数：

| 参数 | 示例值 | 说明 |
|------|--------|------|
| `macAddress` | `20:E7:C8:59:9B:28` | 设备 WiFi MAC 地址，用于服务端唯一标识设备 |
| `chipId` | `5872424` | 芯片 ID，基于 MAC 地址生成的 32 位整数标识，作为设备备选标识 |
| `sensor:{key}` | `sensor:sensor_0=1024` | 传感器组件当前状态，前缀 `sensor:` + 组件注册键名，值由 `IInterruptComponent.getState()` 返回 |
| `load:{key}` | `load:load_0=0` | 负载组件当前值，前缀 `load:` + 组件注册键名，值由 `IStepComponent.getValue()` 返回 |

**组件状态参数详解：**

| 参数 | 示例值 | 说明 |
|------|--------|------|
| `sensor:button_0` ~ `sensor:button_4` | `1` | 按钮状态（1=按下/高电平，0=释放/低电平） |
| `sensor:sensor_0` | `1024` | 温度传感器模拟值（0~1024，需通过分压器公式换算为实际温度） |
| `sensor:sensor_1` | `1` | 水浸传感器 1 状态（1=检测到水，0=干燥） |
| `sensor:sensor_2` | `1` | 水浸传感器 2 状态（1=检测到水，0=干燥） |
| `sensor:sensor_3` | `0` | 负载电压模拟值（0~1024，需通过分压器公式换算为实际电压） |
| `sensor:sensor_4` | `355` | 电源电压模拟值（0~1024，需通过分压器公式换算为实际电压） |
| `load:load_0` ~ `load:load_3` | `0` | 水泵当前值（0=停止，1~255=PWM 占空比，1024=全速开关模式） |

> **注意：** 传感器和负载的键名（如 `sensor_0`、`load_0`）由 `Process.registerComponent()` 注册时指定，与服务端流程配置中的 `componentKey` 对应。

### getState — 获取设备状态

设备每隔 15 秒（默认）通过异步 HTTP GET 请求轮询服务端，获取最新的设备状态和流程配置。

**请求示例（URL 解码后）：**

```
http://xiequ.7qbjs.com/api/iot-wfm/getState?macAddress=20:E7:C8:59:9B:28&chipId=5872424&stateId=EEvvj2qX&sensor:button_0=1&sensor:button_1=1&sensor:button_2=1&sensor:button_3=1&sensor:button_4=1&sensor:sensor_0=1024&sensor:sensor_1=1&sensor:sensor_2=1&sensor:sensor_3=0&sensor:sensor_4=355&load:load_0=0&load:load_1=0&load:load_2=0&load:load_3=0
```

**请求示例（URL 编码后）：**

```
http://xiequ.7qbjs.com/api/iot-wfm/getState?macAddress=20%3AE7%3AC8%3A59%3A9B%3A28&chipId=5872424&stateId=EEvvj2qX&sensor%3Abutton_0=1&sensor%3Abutton_1=1&sensor%3Abutton_2=1&sensor%3Abutton_3=1&sensor%3Abutton_4=1&sensor%3Asensor_0=1024&sensor%3Asensor_1=1&sensor%3Asensor_2=1&sensor%3Asensor_3=0&sensor%3Asensor_4=355&load%3Aload_0=0&load%3Aload_1=0&load%3Aload_2=0&load%3Aload_3=0
```

**特有参数：**

| 参数 | 示例值 | 说明 |
|------|--------|------|
| `stateId` | `EEvvj2qX` | 上次服务端下发的会话标识，用于服务端判断客户端是否已处理过该状态（避免重复下发相同指令） |

**响应格式：**

```json
{
  "code": 0,
  "data": {
    "changed": true,
    "stateId": "EEvvj2qX",
    "switch": "on",
    "sleep": 15000,
    "process": { ... },
    "sleepDuration": 60000
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | int | 状态码，`0` 表示成功 |
| `data.changed` | bool | 状态是否变更，`true` 时设备才会处理响应 |
| `data.stateId` | string | 服务端分配的会话标识，下次请求原样回传 |
| `data.switch` | string | 设备开关，`"on"` 表示开启，其他值表示关闭 |
| `data.sleep` | uint | 下次轮询间隔（毫秒），设备据此调整 `nextTimestamp` |
| `data.sleepDuration` | ulong | 深度睡眠时长（毫秒），仅当 `switch ≠ "on"` 时有效 |
| `data.process` | object | 流程配置，仅当需要执行新流程时存在 |
| `data.created` | string | 内部字段，设备回传时自动跳过 |
| `data.lastWriteTime` | string | 内部字段，设备回传时自动跳过 |

### pushState — 推送设备事件

设备在关键事件发生时，通过同步 HTTP GET 请求向服务端推送通知。异步请求进行中（`_busy=true`）时拒绝推送，由 invoke 队列稍后重试。

**请求示例 — 开机上报（URL 解码后）：**

```
http://xiequ.7qbjs.com/api/iot-wfm/pushState?macAddress=20:E7:C8:59:9B:28&chipId=5872424&event=bootstrap&sensor:button_0=1&sensor:button_1=1&sensor:button_2=1&sensor:button_3=1&sensor:button_4=1&sensor:sensor_0=1024&sensor:sensor_1=1&sensor:sensor_2=1&sensor:sensor_3=0&sensor:sensor_4=348&load:load_0=0&load:load_1=0&load:load_2=0&load:load_3=0
```

**请求示例 — 开机上报（URL 编码后）：**

```
http://xiequ.7qbjs.com/api/iot-wfm/pushState?macAddress=20%3AE7%3AC8%3A59%3A9B%3A28&chipId=5872424&event=bootstrap&sensor%3Abutton_0=1&sensor%3Abutton_1=1&sensor%3Abutton_2=1&sensor%3Abutton_3=1&sensor%3Abutton_4=1&sensor%3Asensor_0=1024&sensor%3Asensor_1=1&sensor%3Asensor_2=1&sensor%3Asensor_3=0&sensor%3Asensor_4=348&load%3Aload_0=0&load%3Aload_1=0&load%3Aload_2=0&load%3Aload_3=0
```

**特有参数：**

| 参数 | 示例值 | 说明 |
|------|--------|------|
| `event` | `bootstrap` | 事件类型（见下表） |

**事件类型：**

| 事件 | 触发时机 | 附加参数 |
|------|----------|----------|
| `bootstrap` | WiFi 首次连接成功 | `cause`：唤醒原因（0=正常上电，2=外部唤醒，4=定时器唤醒） |
| `change` | 流程步骤状态变化 | `stateId`：会话标识，`type`：变化类型，`message`：变化描述 |
| `finish` | 流程全部步骤完成 | `stateId`：会话标识 |

**change 事件的 type 值：**

| type | 说明 |
|------|------|
| `step_ready` | 步骤就绪（等待延迟启动） |
| `step_begin` | 步骤开始执行 |
| `step_end` | 步骤正常结束 |
| `step_timeout` | 步骤超时强制结束 |
| `step_interrupt` | 步骤被中断条件提前结束 |

### 状态变更指令

服务端通过 `getState` 响应下发的状态变更指令格式：

```json
{
  "data": {
    "switch": "on",
    "sleepDuration": 60000,
    "process": {
      "steps": [
        {
          "name": "浇水",
          "componentKey": "load_0",
          "value": { "begin": "200", "end": "0" },
          "delay": 0,
          "timeout": 30000,
          "interrupts": [
            {
              "name": "水满",
              "componentKey": "sensor_1",
              "state": 1,
              "delay": 1000,
              "intercept": 500,
              "duration": 0
            }
          ]
        }
      ]
    }
  }
}
```

**指令行为：**

- `switch` ≠ `"on"` 且有 `sleepDuration` → 进入深度睡眠（毫秒）
- `switch` ≠ `"on"` → 终止当前流程
- `switch` = `"on"` 且有 `process.steps` → 启动新流程
- `switch` = `"on"` 但无流程配置 → 仅更新状态

### 参数回传机制

请求参数由 `NetworkExt.getStateQuery()` 按以下顺序构建：

1. **基础字段** — `macAddress`（WiFi MAC 地址）、`chipId`（芯片 ID）
2. **自定义参数** — `pushState` 事件的扩展字段（如 `event`、`stateId`、`cause` 等）
3. **服务端回传字段** — 上次服务端响应 `data` 中的字段（排除内部保留字段 `chipId`、`macAddress`、`sleep`、`created`、`changed`、`lastWriteTime`，以及与自定义参数重复的字段）
4. **组件状态** — 传感器当前状态（`sensor:{key}`）和负载当前值（`load:{key}`）

这种回传机制确保服务端始终能获取设备最新的完整状态，同时避免重复参数和内部字段泄露。

## 依赖

| 库 | 用途 |
|----|------|
| [ArduinoJson](https://github.com/bblanchon/ArduinoJson) | JSON 解析与序列化 |
| [AsyncHTTPRequest_Generic](https://github.com/khoih-prog/AsyncHTTPRequest_Generic) | 异步 HTTP 请求 |
| WiFi (ESP32 内置) | WiFi STA 连接 |
| HTTPClient (ESP32 内置) | 同步 HTTP 请求 |

## 待办事项

- [ ] 确认引脚工作状态
- [ ] 服务端识别设备引脚信息
- [ ] 服务端支持按钮配置
- [ ] 服务端支持延迟关机

## License

MIT
