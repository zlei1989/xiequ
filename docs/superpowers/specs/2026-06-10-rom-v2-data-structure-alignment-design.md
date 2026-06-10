# ROM-V2 数据结构对齐 API — 设计文档

> 日期：2026-06-10 | 状态：定稿

## 背景

ESP32 固件 (`app/watering/rom-v2/`) 与服务端 API (`app/watering/api/`) 之间存在多处数据结构和协议约定不一致，导致部分功能无法正常工作。本设计系统性地对齐两者。

## 改动总览

| # | 改动项 | 影响范围 |
|---|--------|----------|
| 1 | 去掉 get-state 响应的 `data` 包装层 | API + 固件 |
| 2 | push-state 按钮统一归入 sensors 分类 | API |
| 3 | Step 删除 `delay`，无 component 步骤 = 纯等待 | 固件 + 类型 |
| 4 | 新增 `sleep` / `sleepDuration` 字段 | API + 类型 + 固件 + .env |
| 5 | 固件实现模拟量中断（signalType/logic/threshold） | 固件 |
| 6 | 按钮万能中断 + trigger 流程启动 + processes 缓存下发 | API + 固件 |
| 7 | get-state 响应精简：去掉固件未使用的 7 个字段 | API + 固件 |

---

## 1. 去掉 `data` 包装层

### 问题

API `get-state` 响应结构为 `{ data: { stateId, changed, switch, ... } }`，固件通过 `state["data"]["xxx"]` 访问，逻辑分散且多一层嵌套。

### 方案

所有字段直接放在响应根级。

**get-state 响应新格式（仅保留固件实际使用的字段）：**

```json
{
  "stateId": "abc123",
  "changed": true,
  "switch": "on",
  "sleep": 15000,
  "processesVersion": "Xk9mP2qL",
  "processes": [
    { "name": "浇花流程A", "trigger": "button_0", "steps": [...] }
  ],
  "process": { "name": "...", "steps": [...] },
  "sleepDuration": 300000
}
```

**去掉的字段（固件未使用）：** `chipId`、`buttons`、`sensors`、`loads`、`index`、`message`、`lastWriteTime`。

**注意：** `getStateQuery()` 中原有"遍历 state 字段回传服务端"的逻辑需要调整——去掉对已删除字段的依赖，改为仅回传固件已知的自身字段（macAddress、chipId、stateId 等）。

**固件侧对应修改：**

| 位置 | 旧访问路径 | 新访问路径 |
|------|-----------|-----------|
| `NetworkExt::setStateJSONString()` | `state["code"]` + `state["data"]["changed"]` | 仅 `state["changed"]`（同时去掉 code 检查） |
| `NetworkExt::getStateQuery()` | 遍历 `state["data"]` 字段 | 遍历 `state` 根级字段 |
| `NetworkExt::getStateId()` | `state["data"]["stateId"]` | `state["stateId"]` |
| `v2.0.ino:networkStateChangeHandler()` | `(*state)["data"]["switch"]` | `(*state)["switch"]` |
| `v2.0.ino:networkStateChangeHandler()` | `(*state)["data"]["process"]` | `(*state)["process"]` |
| `v2.0.ino:networkStateChangeHandler()` | `(*state)["data"]["sleepDuration"]` | `(*state)["sleepDuration"]` |
| `NetworkExt::setStateJSONString()` | `state["data"]["sleep"]` | `state["sleep"]` |

**push-state 响应也去 data 层：** `{ data: undefined }` → `{ success: true }`

---

## 2. 按钮统一归入 sensors

### 问题

固件所有组件（按钮/传感器）注册类型为 `TYPE_SENSOR`，上报时统一用 `sensor:` 前缀。API 按 `button:` 前缀期望分类，导致按钮状态分类错误。

### 方案

API `push-state/route.ts` 解析逻辑调整：`sensor:button_*` 归入 `sensors` 分类。固件不变。

```typescript
// push-state/route.ts — 简化后的解析逻辑
const match = key.match(/^(sensor|load):(.+)$/);
if (match) {
  const category = match[1] === "sensor" ? "sensors" : "loads";
  gpioState[category][match[2]] = parseInt(value) || 0;
}
```

去掉 `button:` 前缀匹配。buttons、常规 sensors 统一走 `sensor:` 前缀，归入 `sensors`。

---

## 3. Step 删除 `delay`，纯等待步骤

### 问题

`delay` 字段语义与 `timeout` 有重叠。完全可通过"无 component 步骤 + timeout"实现纯等待。

### 方案

**固件 `Process.h`：**
- `Step` 结构体删除 `delay` 字段
- `Current` 结构体删除 `beginTime`（不再需要延迟启动时间戳的计算）

**固件 `Process.cpp`：**
- `initStep()` 删除 `delay` 解析
- `calculateStep()` 删除 `beginTime` 计算，步骤就绪即立即开始
- `next()` 中延迟等待分支简化或移除

**类型 `types.ts`：**
- `Step` 类型不添加 `delay`（本就无）

**新语义 — 纯等待步骤：**
- `component` 为空 → 不操作任何负载
- `timeout` 控制等待时长，到期自动进入下一步
- 不需要 `interrupts`（等待步骤无负载可中断）

---

## 4. `sleep` / `sleepDuration` 字段

### 方案

**`.env` 新增配置：**

```env
WATERING_POLL_INTERVAL=15000       # 设备轮询间隔（毫秒），默认 15000
WATERING_SLEEP_DURATION=300000     # 空闲深度睡眠时长（毫秒），默认 5 分钟
```

**API `get-state/route.ts`：**
- 每次响应都带上 `sleep`（从 `WATERING_POLL_INTERVAL` 读取）
- `sleepDuration` 下发条件（仅当以下全部满足）：
  1. 查询该设备配置，`schedules` 为空数组（无定时任务）
  2. 当前 `switch` 不为 `"on"`（无流程执行中）
  3. 此时在响应中带上 `sleepDuration = WATERING_SLEEP_DURATION`

**`DeviceState` 类型新增：**

```typescript
export type DeviceState = {
  // ... 原有字段
  sleep?: number;           // 轮询间隔（毫秒）
  sleepDuration?: number;   // 空闲深度睡眠时长（毫秒）
};
```

**固件 `NetworkExt::setStateJSONString()`：** 已有读取逻辑，只需将路径从 `state["data"]["sleep"]` 改为 `state["sleep"]`。

**固件 `v2.0.ino` — sleepDuration 处理逻辑（重写）：**

现有代码在 `networkStateChangeHandler` 中读到 `sleepDuration` 后**立即**调用 `esp_deep_sleep_start()`，这不合理。需要重构为"收到后启动倒计时，到期无操作再休眠"。

```
流程：
1. 每次 get-state 响应都可能携带 sleepDuration（API 根据 schedules 是否为空决定）
2. 固件收到 sleepDuration → 记录到全局变量 _sleepDuration
3. 固件在 loop() 中检查：如果 _idled == true（空闲），且距上次操作 > _sleepDuration，则进入深度睡眠
4. 任何用户操作（按钮按下、流程启动）→ 重置操作时间戳，取消休眠倒计时
5. switch="on" 时 → 不进入休眠
```

---

## 5. 固件实现模拟量中断

### 方案

**`Process.h` — `Interrupt` 结构体新增字段：**

```cpp
struct Interrupt {
  // ... 原有字段
  String signalType = "digital";  // "digital" | "analog"
  String logic = "==";            // "==" | ">" | "<" | ">=" | "<="
  long threshold = 0;             // 模拟量触发阈值
};
```

**`Process.cpp` — `initInterrupt()` 新增解析：**

```cpp
if (interruptSchema["signalType"].is<const char*>()) {
  interrupt->signalType = interruptSchema["signalType"].as<String>();
}
if (interruptSchema["logic"].is<const char*>()) {
  interrupt->logic = interruptSchema["logic"].as<String>();
}
if (interruptSchema["threshold"].is<long>()) {
  interrupt->threshold = interruptSchema["threshold"].as<long>();
}
```

**`Process.cpp` — `checkInterruptState()` 比较逻辑：**

```cpp
long currentState = (*(IInterruptComponent *)interrupt->component).getState();

if (interrupt->signalType == "analog") {
  long threshold = interrupt->threshold;
  if (interrupt->logic == ">")  return currentState > threshold;
  if (interrupt->logic == "<")  return currentState < threshold;
  if (interrupt->logic == ">=") return currentState >= threshold;
  if (interrupt->logic == "<=") return currentState <= threshold;
  return currentState == threshold;  // "==" fallback
}
// digital: 原有等值比较
return currentState == interrupt->state;
```

**TypeScript 类型已齐备：** `Interrupt` 类型中 `signalType`、`logic`、`threshold` 字段已存在，无需修改。

---

## 6. 按钮万能中断 + trigger 流程启动 + processes 缓存下发

### 6a. 按钮万能中断

**需求：** 设备正在运行流程时，按下任意按钮立即终止当前流程。

**实现位置：** `v2.0.ino:buttonChangeHandler()`

```cpp
void buttonChangeHandler(int type, float value, Button *button, void *context) {
  light.twinkle(1, Light::SPEED_FAST);
  
  Process *process = reinterpret_cast<Process *>(context);
  // 仅在按钮按下时（TYPE_PRESS）且流程正在运行时终止
  if (type == Button::TYPE_PRESS && !_idled) {
    process->terminate();
    _idled = true;
  }
}
```

### 6b. 空闲时按钮 trigger 启动流程

**需求：** 设备空闲时，按钮按下匹配 `processes` 列表中某流程的 `trigger` 属性，匹配到则本地启动流程。

**get-state 响应携带 `processes`：**

```json
{
  "processesVersion": "Xk9mP2qL",
  "processes": [
    {
      "name": "浇花流程A",
      "trigger": "button_0",
      "steps": [...]
    },
    {
      "name": "浇花流程B",
      "trigger": "button_1",
      "steps": [...]
    }
  ]
}
```

**固件 `v2.0.ino` 新增全局/持久化数据：**

```cpp
// 流程配置缓存（用于 trigger 匹配和本地启动）
JsonDocument _processesDoc;
String _processesVersion = "";
```

**`buttonChangeHandler` 空闲时 trigger 匹配逻辑：**

```
buttonChangeHandler(Button *button) {
  if (TYPE_PRESS) {
    if (!_idled) {
      // 运行中 → 终止流程
      process->terminate(); _idled = true;
    } else {
      // 空闲 → 遍历 _processesDoc["processes"]，找 trigger == buttonKey 的流程
      // buttonKey 通过 Button 的 pin 或存储的注册 key 反查得到
      // 匹配到 → process->setSchema(processJson) + process->execute() + _idled = false
      // 未匹配 → 忽略（仅闪烁指示灯）
    }
  }
}
```

`buttonKey` 的获取方式：Button 类在 `setup()` 中注册到 Process 时，额外存储自己的 key（如 `"button_0"`），回调中通过 `button->getKey()` 获取。

### 6c. processes 版本控制下发

**流程配置变更 → 触发 processesVersion 更新：**

- API 层：`saveDeviceConfig()` 时检查 `processes` 是否变化，变化则生成新的 `processesVersion = newId()`
- `DeviceConfig` 类型新增 `processesVersion?: string`

**API `get-state/route.ts` 下发策略：**

| 场景 | processesVersion | processes 数据 |
|------|:----------------:|:-------------:|
| 首次开机 / 唤醒 (bootstrap) | ✅ 下发 | ✅ 下发 |
| 心跳轮询，版本无变化 | ✅ 下发 | ❌ 不下发（节约流量） |
| 流程配置被编辑，版本变化 | ✅ 下发（新版本） | ✅ 下发（新数据） |

**固件存储策略：**

`processesVersion` 检查必须在**每次** get-state 响应处理时执行（不依赖 `changed` 标志），因为流程配置可能变更但运行状态未变。

```cpp
// 在 NetworkExt::setStateJSONString() 中，changed 检查之前执行
if (state["processesVersion"].is<const char*>()) {
  String newVersion = state["processesVersion"].as<String>();
  if (newVersion != _processesVersion || _processesVersion.length() == 0) {
    _processesVersion = newVersion;
    if (state["processes"].is<JsonArray>()) {
      // 深拷贝 processes 到 _processesDoc 用于 trigger 匹配
    }
  }
}
```

---

## 7. get-state 响应精简

### 问题

当前响应携带大量固件不使用字段（`chipId`、`buttons`、`sensors`、`loads`、`index`、`message`、`lastWriteTime`），浪费 ESP32 内存和网络带宽。

### 方案

API `get-state/route.ts` 只返回固件实际读取的字段（见第 1 节响应格式）。

固件 `NetworkExt::getStateQuery()` 中"遍历 state 根级字段回传服务端"的逻辑需要对应调整，确保不依赖已删除字段。

---

## 文件改动清单

### API 层（服务端）

| 文件 | 改动 |
|------|------|
| `app/watering/api/get-state/route.ts` | 去 data 层；精简响应字段；新增 sleep/sleepDuration；processes 按版本下发 |
| `app/watering/api/push-state/route.ts` | button: 前缀去除，统一 sensor:；去 data 层 |
| `app/watering/types.ts` | DeviceState 加 sleep/sleepDuration；DeviceConfig 加 processesVersion |
| `app/watering/services/db.ts` | saveDeviceConfig 时生成 processesVersion |
| `.env` / `.env.example` | 新增 WATERING_POLL_INTERVAL、WATERING_SLEEP_DURATION |

### 固件层（ESP32）

| 文件 | 改动 |
|------|------|
| `app/watering/rom-v2/NetworkExt.cpp` | 去 data 层路径；去 code 检查；processesVersion 比较与存储；getStateQuery 精简 |
| `app/watering/rom-v2/NetworkExt.h` | 可能新增 processes 缓存成员变量 |
| `app/watering/rom-v2/Process.h` | Step 删 delay；Interrupt 加 signalType/logic/threshold |
| `app/watering/rom-v2/Process.cpp` | 删 delay 解析/计算；加模拟量比较逻辑；纯等待步骤处理 |
| `app/watering/rom-v2/v2.0.ino` | buttonChangeHandler 加万能中断 + trigger 启动；sleepDuration 倒计时；全局 processes 缓存 |
| `app/watering/rom-v2/Button.h` | 新增 `getKey()` / `setKey()` 方法（用于 trigger 匹配） |

### 无需改动的文件

- `AnalogSensor.h/cpp` — 已实现 IInterruptComponent，无需修改
- `Sensor.h/cpp` — 无需修改
- `Motor.h/cpp` — 无需修改
- `Button.h/cpp` — 无需修改
- `config.h` — 无需修改
- `utils.h/cpp` — 无需修改

---

## 未涉及项

以下问题在本设计范围之外，留待后续处理：

- push-state `change` 事件在 API 端仅记录日志，不更新 DeviceState 运行态数据
- 电压采集值如何上报到服务端
- `idleSleep` / `idleTimeout` 字段的固件实现
- `bootExec` / `execDelay` 的固件实现
