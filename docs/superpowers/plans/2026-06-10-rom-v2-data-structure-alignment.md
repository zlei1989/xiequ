# ROM-V2 数据结构对齐 API — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ESP32 固件与服务端 API 的数据结构完全对齐，修复关键 bug（`code` 检查、按钮分类、delay 冗余等），并新增 sleep、模拟量中断、按钮 trigger 启动功能。

**Architecture:** 先改 API 端（types → routes → services），再改固件端（Button → Process → NetworkExt → v2.0.ino）。API 端改动顺序：类型定义 → 环境配置 → push-state → get-state → db。固件端改动顺序：Button 扩展 → Process 重构 → NetworkExt 路径修正+缓存 → v2.0.ino 行为整合。

**Tech Stack:** Next.js 16 App Router + TypeScript / Arduino C++ (ESP32) + ArduinoJson

---

## API 端改动

### Task 1: 更新 TypeScript 类型定义

**Files:**
- Modify: `app/watering/types.ts`

- [ ] **Step 1: 为 DeviceState 添加 sleep 和 sleepDuration 字段**

在 `DeviceState` 类型末尾（`lastWriteTime` 之前）添加两个可选字段：

```typescript
// 设备状态
export type DeviceState = {
  chipId: string;
  stateId: string;
  switch: "on" | "off";
  buttons?: Record<string, number>;
  sensors?: Record<string, number>;
  loads?: Record<string, number>;
  index?: number;
  process?: Process;
  message?: string;
  sleep?: number;           // 固件轮询间隔（毫秒）
  sleepDuration?: number;   // 空闲深度睡眠时长（毫秒）
  lastWriteTime: string;
};
```

- [ ] **Step 2: 为 DeviceConfig 添加 processesVersion 字段**

在 `DeviceConfig` 类型末尾（`lastWriteTime` 之前）添加可选字段：

```typescript
export type DeviceConfig = {
  chipId: string;
  name: string;
  macAddress: string;
  processes: Process[];
  idleSleep: boolean;
  idleTimeout: number;
  bootExec: number;
  execDelay: number;
  schedules: Schedule[];
  voltage?: VoltageConfig;
  processesVersion?: string;  // 流程配置版本（变更时更新）
  createdTime: string;
  lastWriteTime: string;
};
```

- [ ] **Step 3: 验证类型无编译错误**

Run: `pnpm exec tsc --noEmit --pretty`
Expected: No type errors related to `types.ts`

- [ ] **Step 4: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat(types): add sleep/sleepDuration to DeviceState, processesVersion to DeviceConfig"
```

---

### Task 2: 添加环境变量配置

**Files:**
- Modify: `.env`（如存在）
- Create/Modify: `.env.example`

- [ ] **Step 1: 添加 .env 配置项**

在 `.env` 文件中追加：

```env
# 浇花 IoT 设备配置
WATERING_POLL_INTERVAL=15000       # 设备轮询间隔（毫秒），默认 15 秒
WATERING_SLEEP_DURATION=300000     # 空闲深度睡眠时长（毫秒），默认 5 分钟
```

如果 `.env` 不存在则创建。

- [ ] **Step 2: 添加 .env.example 配置项**

在 `.env.example` 中追加相同内容作为模板。

- [ ] **Step 3: Commit**

```bash
git add .env .env.example
git commit -m "feat(env): add WATERING_POLL_INTERVAL and WATERING_SLEEP_DURATION"
```

---

### Task 3: 重构 push-state 路由（按钮归 sensors + 去 data 层）

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

- [ ] **Step 1: 简化 GPIO 状态解析——去掉 button: 前缀匹配**

将原来的三分类匹配简化为二分类：

```typescript
// 旧（删除）
const gpioState: Record<string, Record<string, number>> = { buttons: {}, sensors: {}, loads: {} };
searchParams.forEach((value, key) => {
  const match = key.match(/^(button|sensor|load):(.+)$/);
  if (match) {
    const category = match[1] === "button" ? "buttons" : match[1] === "sensor" ? "sensors" : "loads";
    gpioState[category][match[2]] = parseInt(value) || 0;
  }
});
```

```typescript
// 新
const gpioState: Record<string, Record<string, number>> = { sensors: {}, loads: {} };
searchParams.forEach((value, key) => {
  const match = key.match(/^(sensor|load):(.+)$/);
  if (match) {
    const category = match[1] === "sensor" ? "sensors" : "loads";
    gpioState[category][match[2]] = parseInt(value) || 0;
  }
});
```

- [ ] **Step 2: 更新 bootstrap 分支——移除 buttons 引用**

bootstrap 分支中 `Object.assign(state, ...)` 处，原来包含 `buttons: gpioState.buttons`，改为所有 GPIO 状态都从 `sensors` 和 `loads` 取：

```typescript
// 旧（删除）
Object.assign(state, {
  buttons: gpioState.buttons,
  sensors: gpioState.sensors,
  loads: gpioState.loads,
  ...
});
```

```typescript
// 新
Object.assign(state, {
  sensors: gpioState.sensors,
  loads: gpioState.loads,
  stateId: newId(),
  lastWriteTime: new Date().toISOString(),
});
```

- [ ] **Step 3: 更新 default 分支日志——移除 buttons**

```typescript
// 旧
await writeDeviceLog(chipId, event || "heartbeat", {
  macAddress,
  buttons: gpioState.buttons,
  sensors: gpioState.sensors,
  loads: gpioState.loads,
});
```

```typescript
// 新
await writeDeviceLog(chipId, event || "heartbeat", {
  macAddress,
  sensors: gpioState.sensors,
  loads: gpioState.loads,
});
```

- [ ] **Step 4: 去掉响应的 data 包装层**

```typescript
// 旧
return NextResponse.json({ data: undefined });
```

```typescript
// 新
return NextResponse.json({ success: true });
```

- [ ] **Step 5: 验证路由无编译错误**

Run: `pnpm exec tsc --noEmit --pretty`
Expected: No type errors in `push-state/route.ts`

- [ ] **Step 6: Commit**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "refactor(push-state): unify buttons into sensors, remove data wrapper"
```

---

### Task 4: 重构 get-state 路由（去 data 层 + 新字段 + processes 版本下发 + 精简）

**Files:**
- Modify: `app/watering/api/get-state/route.ts`

- [ ] **Step 1: 导入新增的依赖**

在文件顶部添加：

```typescript
import { getDeviceConfig } from "@/app/watering/services/db";
```

- [ ] **Step 2: 新增辅助函数 buildResponse——构建精简响应对象**

在 `GET` 函数之前添加：

```typescript
/** 环境变量 */
const POLL_INTERVAL = parseInt(process.env.WATERING_POLL_INTERVAL || "15000");
const SLEEP_DURATION = parseInt(process.env.WATERING_SLEEP_DURATION || "300000");

/** 固件实际使用的字段白名单 */
const FIRMWARE_USED_FIELDS = new Set([
  "stateId", "changed", "switch", "process",
]);

/**
 * 构建精简的 get-state 响应（仅包含固件实际使用的字段）
 */
function buildResponse(
  state: DeviceState | null,
  changed: boolean,
  config: DeviceConfig | null,
  clientProcessesVersion?: string
) {
  const result: Record<string, unknown> = {};

  // 始终包含 stateId
  result.stateId = state?.stateId || "";

  // 变化标志
  result.changed = changed;

  // switch 状态
  result.switch = state?.switch || "off";

  // 轮询间隔
  result.sleep = POLL_INTERVAL;

  // 当前执行的流程
  if (changed && state?.process) {
    result.process = state.process;
  }

  // 深度睡眠时长（仅无计划任务且无流程执行时下发）
  if (
    config &&
    (!config.schedules || config.schedules.length === 0) &&
    state?.switch !== "on"
  ) {
    result.sleepDuration = SLEEP_DURATION;
  }

  // processes 版本控制下发
  if (config?.processesVersion) {
    result.processesVersion = config.processesVersion;
    // 仅在版本不匹配时下发完整 processes 数据
    if (clientProcessesVersion !== config.processesVersion) {
      result.processes = config.processes;
    }
  }

  return result;
}
```

- [ ] **Step 3: 更新 GET 函数——获取 config 并调用 buildResponse**

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const clientStateId = searchParams.get("stateId") || "";
  const clientProcessesVersion = searchParams.get("processesVersion") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  await updateTick(chipId);

  // 并行读取状态和配置
  const [state, config] = await Promise.all([
    getDeviceState(chipId),
    getDeviceConfig(chipId),
  ]);

  // 比较是否有变化
  const changed = !state || clientStateId !== state.stateId;

  // 构建精简响应
  const response = buildResponse(state, changed, config, clientProcessesVersion);

  return NextResponse.json(response);
}
```

- [ ] **Step 4: 验证路由无编译错误**

Run: `pnpm exec tsc --noEmit --pretty`
Expected: No type errors in `get-state/route.ts`

- [ ] **Step 5: Commit**

```bash
git add app/watering/api/get-state/route.ts
git commit -m "refactor(get-state): remove data wrapper, add sleep/sleepDuration, processes versioned delivery, strip unused fields"
```

---

### Task 5: 更新 db.ts——saveDeviceConfig 生成 processesVersion + 数据库迁移

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 导入 newId**

在文件顶部检查并添加（如果尚未导入）：

```typescript
import { newId } from "@/lib/utils";
```

- [ ] **Step 2: initDb() 添加 processes_version 列**

在 `initDb` 函数的 `watering_devices` CREATE TABLE 中添加新列：

```sql
    CREATE TABLE IF NOT EXISTS watering_devices (
      chip_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mac_address TEXT NOT NULL,
      processes JSON NOT NULL DEFAULT '[]',
      idle_sleep INTEGER NOT NULL DEFAULT 0,
      idle_timeout INTEGER NOT NULL DEFAULT 30000,
      boot_exec INTEGER NOT NULL DEFAULT -1,
      exec_delay INTEGER NOT NULL DEFAULT 0,
      schedules JSON NOT NULL DEFAULT '[]',
      voltage JSON,
      processes_version TEXT,
      created_time TEXT NOT NULL,
      last_write_time TEXT NOT NULL
    )
```

并在 ALTER TABLE 区域（`voltage` 列兼容迁移之后）添加 processes_version 兼容迁移：

```typescript
  // 为旧数据库添加 processes_version 列
  try {
    db.exec(`ALTER TABLE watering_devices ADD COLUMN processes_version TEXT`);
  } catch {
    // 列已存在，忽略
  }
```

- [ ] **Step 3: saveDeviceConfig()——添加 processesVersion 生成和存储**

在 `saveDeviceConfig` 函数体中，SQL 执行之前添加版本生成逻辑，并在 SQL 中包含新列：

```typescript
export async function saveDeviceConfig(config: DeviceConfig) {
  const db = await getDb();

  // processesVersion 生成：对比旧值，变更时生成新版本
  const oldConfig = await getDeviceConfig(config.chipId);
  if (!config.processesVersion || !oldConfig) {
    config.processesVersion = newId();
  } else {
    const oldProcessesJson = JSON.stringify(oldConfig.processes);
    const newProcessesJson = JSON.stringify(config.processes);
    if (oldProcessesJson !== newProcessesJson) {
      config.processesVersion = newId();
    }
  }

  db.prepare(`
    INSERT INTO watering_devices (chip_id, name, mac_address, processes, idle_sleep, idle_timeout, boot_exec, exec_delay, schedules, voltage, processes_version, created_time, last_write_time)
    VALUES (@chip_id, @name, @mac_address, @processes, @idle_sleep, @idle_timeout, @boot_exec, @exec_delay, @schedules, @voltage, @processes_version, @created_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      name=@name, mac_address=@mac_address, processes=@processes, idle_sleep=@idle_sleep,
      idle_timeout=@idle_timeout, boot_exec=@boot_exec, exec_delay=@exec_delay,
      schedules=@schedules, voltage=@voltage, processes_version=@processes_version,
      last_write_time=@last_write_time
  `).run({
    "@chip_id": config.chipId,
    "@name": config.name,
    "@mac_address": config.macAddress,
    "@processes": JSON.stringify(config.processes),
    "@idle_sleep": config.idleSleep ? 1 : 0,
    "@idle_timeout": config.idleTimeout,
    "@boot_exec": config.bootExec,
    "@exec_delay": config.execDelay,
    "@schedules": JSON.stringify(config.schedules),
    "@voltage": config.voltage ? JSON.stringify(config.voltage) : null,
    "@processes_version": config.processesVersion ?? null,
    "@created_time": config.createdTime,
    "@last_write_time": config.lastWriteTime,
  });
}
```

- [ ] **Step 4: getDeviceConfig()——返回 processesVersion**

在 `getDeviceConfig` 的返回对象中添加：

```typescript
  return {
    chipId: row.chip_id,
    name: row.name,
    macAddress: row.mac_address,
    processes: parseJSON(row.processes, [] as DeviceConfig["processes"]),
    idleSleep: !!row.idle_sleep,
    idleTimeout: row.idle_timeout,
    bootExec: row.boot_exec,
    execDelay: row.exec_delay,
    schedules: parseJSON(row.schedules, [] as DeviceConfig["schedules"]),
    voltage: parseJSON(row.voltage, undefined as DeviceConfig["voltage"]),
    processesVersion: row.processes_version ?? undefined,  // 新增
    createdTime: row.created_time,
    lastWriteTime: row.last_write_time,
  };
```

- [ ] **Step 5: getAllDevices()——也返回 processesVersion**

在 `getAllDevices` 的 SELECT 和映射中添加 `processes_version` 列和字段映射。

- [ ] **Step 6: 验证编译和数据库迁移**

Run: `pnpm exec tsc --noEmit --pretty`
Run: `pnpm dev`（触发 initDb 建表/迁移）
Expected: 无报错，数据库表正常

- [ ] **Step 7: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat(db): add processes_version column, auto-generate on config change"
```

---

## 固件端改动

### Task 6: Button 类添加 getKey/setKey（用于 trigger 匹配）

**Files:**
- Modify: `app/watering/rom-v2/Button.h`
- Modify: `app/watering/rom-v2/Button.cpp`

- [ ] **Step 1: Button.h——添加 key 成员变量和 getter/setter**

在 `Button` 类的 public 区域，`setChangeHandler` 之后添加：

```cpp
  /**
   * 设置按钮标识键名（如 "button_0"），用于 trigger 匹配
   * @param key 键名字符串
   */
  void setKey(String key);
  /**
   * 获得按钮标识键名
   * @return 键名字符串
   */
  String getKey();
```

在 `protected` 区域，`changeHandler` 之后添加：

```cpp
  /** 按钮标识键名（如 "button_0"），用于与流程 trigger 属性匹配 */
  String key = "";
```

- [ ] **Step 2: Button.cpp——实现 getKey/setKey**

在文件末尾（`typeMessage` 之后）添加实现：

```cpp
/**
 * 设置按钮标识键名
 * @param keyName 键名字符串
 */
void Button::setKey(String keyName) { key = keyName; }

/**
 * 获得按钮标识键名
 * @return 键名字符串
 */
String Button::getKey() { return key; }
```

- [ ] **Step 3: Commit**

```bash
git add app/watering/rom-v2/Button.h app/watering/rom-v2/Button.cpp
git commit -m "feat(rom-v2): add getKey/setKey to Button for trigger matching"
```

---

### Task 7: Process 类——删除 delay + 添加模拟量中断

**Files:**
- Modify: `app/watering/rom-v2/Process.h`
- Modify: `app/watering/rom-v2/Process.cpp`

- [ ] **Step 1: Process.h——Step 结构体删除 delay 字段**

在 `struct Step` 中删除这一行：

```cpp
    /** 步骤延迟启动时间（毫秒）：步骤准备就绪后等待此时间再开始执行 */
    unsigned long delay = 0;
```

- [ ] **Step 2: Process.h——Current 结构体删除 beginTime**

在 `struct Current` 中删除这一行：

```cpp
    /** 当前步骤计划启动时间（= executeTime + delay） */
    unsigned long beginTime = 0;
```

- [ ] **Step 3: Process.h——Interrupt 结构体添加模拟量字段**

在 `struct Interrupt` 的 `duration` 字段之后添加：

```cpp
    /** 信号类型："digital"（数字量）或 "analog"（模拟量） */
    String signalType = "digital";
    /** 逻辑比较符：">" | "<" | ">=" | "<=" | "==" */
    String logic = "==";
    /** 模拟量触发阈值（仅 signalType="analog" 时生效） */
    long threshold = 0;
```

- [ ] **Step 4: Process.cpp——initStep() 删除 delay 解析**

删除 `initStep` 函数中这几行：

```cpp
  // 设置延迟启动时间（毫秒）
  if (stepSchema["delay"].is<unsigned long>()) {
    step->delay = stepSchema["delay"].as<unsigned long>();
  }
```

- [ ] **Step 5: Process.cpp——initInterrupt() 添加模拟量字段解析**

在 `initInterrupt` 函数中，现有 `state` 字段解析之后添加：

```cpp
  // 解析信号类型（可选，默认 "digital"）
  if (interruptSchema["signalType"].is<const char*>()) {
    interrupt->signalType = interruptSchema["signalType"].as<String>();
  }
  // 解析逻辑比较符（可选，默认 "==")
  if (interruptSchema["logic"].is<const char*>()) {
    interrupt->logic = interruptSchema["logic"].as<String>();
  }
  // 解析模拟量触发阈值（可选，默认 0）
  if (interruptSchema["threshold"].is<long>()) {
    interrupt->threshold = interruptSchema["threshold"].as<long>();
  }
```

- [ ] **Step 6: Process.cpp——calculateStep() 删除 delay 相关计算**

修改 `calculateStep` 函数，删除对 `beginTime` 和 `delay` 的引用：

```cpp
void Process::calculateStep(Current *current, Step *step) {
  current->processing = false;
  current->executeTime = millis();
  // 删除 beginTime 计算（原为 executeTime + step->delay）
  // 删除 beginTime 计算
  if (step->timeout > 0) {
    current->expire = current->executeTime + step->timeout;  // 改为不加 delay
  } else {
    current->expire = 0;
  }
  // log 中不再包含 beginTime
  log("Process Step Ready "
      "{\"name\":\"%s\",\"executeTime\":%lu,\"expire\":%lu,"
      "\"process\":\"%s\",\"stateId\":\"%s\"}",
      step->name.c_str(), (unsigned long)current->executeTime,
      (unsigned long)current->expire,
      name.c_str(), stateId.c_str());
  // changeHandler 中不再引用 delay
  if (changeHandler) {
    char buffer[256];
    sprintf(buffer,
            "{processName:%s}流程的{stepName:%s}{stepId:%d}"
            "环节已经准备就绪，执行{expire:%lu}秒后超时。",
            name.c_str(), step->name.c_str(), current->index,
            (unsigned long)((current->expire - current->executeTime) / 1000));
    Change *change = new Change();
    change->stateId = stateId;
    change->type = "step_ready";
    change->message = String(buffer);
    changeHandler(change, this, context);
  }
}
```

- [ ] **Step 7: Process.cpp——next() 简化延迟等待分支**

`next()` 函数中，延迟等待分支（`} else {` 部分）原来依赖 `beginTime`，改为立即开始执行：

```cpp
  // ---- 步骤延迟等待中 ----
  } else {
    // delay 已删除，步骤就绪即立即开始
    // 不再检查 now < current.beginTime
    current->processing = true;
    log("Process Step Begin "
        "{\"index\":%d,\"name\":\"%s\",\"value\":\"%s\",\"process\":\"%s\","
        "\"stateId\":\"%s\"}",
        current.index, steps[current.index].name.c_str(),
        steps[current.index].value.begin.c_str(), name.c_str(),
        stateId.c_str());
    // 通知步骤开始事件（更新消息，去掉 delay 引用）
    if (changeHandler) {
      char buffer[256];
      sprintf(buffer,
              "{processName:%s}流程的{stepName:%s}{stepId:%d}环节立即执行。"
              "负载{componentKey:%s}{value:%s}已打开。",
              name.c_str(), steps[current.index].name.c_str(), current.index,
              steps[current.index].componentKey.c_str(),
              steps[current.index].value.begin.c_str());
      Change *change = new Change();
      change->stateId = stateId;
      change->type = "step_begin";
      change->message = String(buffer);
      changeHandler(change, this, context);
    }
    // 向负载写入启动参数
    if (steps[current.index].component != nullptr) {
      (*(IStepComponent *)steps[current.index].component)
          .setJsonValue(steps[current.index].value.begin);
    }
  } // end if (current.processing)
```

- [ ] **Step 8: Process.cpp——checkInterruptState() 添加模拟量比较逻辑**

在 `checkInterruptState` 函数中，替换现有的单一等值比较：

```cpp
  // 现有一行（删除）：
  // int state = (*(IInterruptComponent *)interrupt->component).getState();
  // return state == interrupt->state;

  // 替换为：
  long currentState = (*(IInterruptComponent *)interrupt->component).getState();

  // 模拟量模式：根据 logic 比较 currentState 与 threshold
  if (interrupt->signalType == "analog") {
    if (interrupt->logic == ">")  return currentState > interrupt->threshold;
    if (interrupt->logic == "<")  return currentState < interrupt->threshold;
    if (interrupt->logic == ">=") return currentState >= interrupt->threshold;
    if (interrupt->logic == "<=") return currentState <= interrupt->threshold;
    return currentState == interrupt->threshold;  // "==" fallback
  }

  // 数字量模式：原有等值比较
  return currentState == interrupt->state;
```

- [ ] **Step 9: 纯等待步骤处理——next() 中 component 为空的判断**

在 `next()` 函数的处理中，当步骤的 `component == nullptr` 且 `timeout > 0` 时，作为纯等待步骤：不做负载操作，仅等待 timeout 到期后自动进入下一步。检查现有 `next()` 逻辑：component 为空时 `begin` 操作会被跳过（因为 component 是 nullptr），步骤正常等待 timeout 或中断到期。此行为已经是天然的等待步骤，无需额外代码。

- [ ] **Step 10: Commit**

```bash
git add app/watering/rom-v2/Process.h app/watering/rom-v2/Process.cpp
git commit -m "refactor(rom-v2): remove delay from Step, add analog interrupt support"
```

---

### Task 8: NetworkExt——更新数据访问路径 + 去 code 检查 + processes 缓存

**Files:**
- Modify: `app/watering/rom-v2/NetworkExt.cpp`
- Modify: `app/watering/rom-v2/NetworkExt.h`

- [ ] **Step 1: NetworkExt.h——添加 processes 缓存成员变量**

在 `NetworkExt` 类的 `protected` 区域，`state` 成员之后添加：

```cpp
  /** 缓存的流程配置版本号 */
  String processesVersion = "";
  /** 缓存的流程配置 JSON 字符串（用于 trigger 匹配） */
  String processesCache = "[]";
```

在 `public` 区域添加 getter：

```cpp
  /**
   * 获得缓存的流程配置 JSON 字符串
   * @return processes JSON 字符串
   */
  String getProcessesCache();
```

- [ ] **Step 2: NetworkExt.cpp——添加 getProcessesCache() 实现**

在文件末尾添加：

```cpp
/**
 * 获得缓存的流程配置 JSON 字符串
 * @return processes JSON 字符串
 */
String NetworkExt::getProcessesCache() { return processesCache; }
```

- [ ] **Step 3: NetworkExt.cpp——setStateJSONString() 重写**

替换整个 `setStateJSONString` 函数体：

```cpp
void NetworkExt::setStateJSONString(String value) {
  // 反序列化 JSON
  DeserializationError error = deserializeJson(state, value);
  if (error) {
    log("Network HTTP Error {\"message\":\"parse JSON failed\"}");
    return;
  }

  // 1. 检查 processesVersion（每次响应都检查，不依赖 changed 标志）
  if (state["processesVersion"].is<const char*>()) {
    String newVersion = state["processesVersion"].as<String>();
    if (newVersion != processesVersion || processesVersion.length() == 0) {
      processesVersion = newVersion;
      if (state["processes"].is<JsonArray>()) {
        // 序列化 processes 为字符串存储
        String processesJson;
        serializeJson(state["processes"], processesJson);
        processesCache = processesJson;
        log("Processes Cache Updated {\"version\":\"%s\"}", processesVersion.c_str());
      }
    }
  }

  // 2. 调整轮询间隔
  if (state["sleep"].is<unsigned int>()) {
    nextTimestamp = millis() + state["sleep"].as<unsigned int>();
  }

  // 3. 状态变化时触发回调（去掉 code 检查）
  if (state["changed"] == true) {
    stateChangeHandler(&state, this, context);
  }
}
```

- [ ] **Step 4: NetworkExt.cpp——getStateId() 更新路径**

```cpp
// 旧
String NetworkExt::getStateId() { return state["data"]["stateId"]; }
```

```cpp
// 新
String NetworkExt::getStateId() { return state["stateId"]; }
```

- [ ] **Step 5: NetworkExt.cpp——getStateQuery() 精简**

`getStateQuery()` 中"3. 追加服务端下发的 data 字段"部分，路径从 `state["data"]` 改为 `state`，同时更新排除字段列表（去掉不再发送的字段，添加 processes 相关字段的排除）：

```cpp
  // 3. 追加服务端下发的 state 字段（排除内部字段和大型数据字段）
  if (state.is<JsonObject>()) {
    JsonObject stateFields = state.as<JsonObject>();
    if (stateFields.isNull() == false) {
      JsonObject submitFields = (fields != nullptr) ? fields->as<JsonObject>() : JsonObject();
      for (JsonPair kv : stateFields) {
        const char *keyPtr = kv.key().c_str();
        if (keyPtr == nullptr) continue;
        String keyStr = String(keyPtr);
        if (keyStr.length() == 0) continue;
        // 跳过内部保留字段和大型数据字段
        if (keyStr.equalsIgnoreCase("chipId") ||
            keyStr.equalsIgnoreCase("macAddress") ||
            keyStr.equalsIgnoreCase("sleep") ||
            keyStr.equalsIgnoreCase("changed") ||
            keyStr.equalsIgnoreCase("process") ||
            keyStr.equalsIgnoreCase("processes") ||
            keyStr.equalsIgnoreCase("processesVersion") ||
            keyStr.equalsIgnoreCase("sleepDuration")) {
          continue;
        }
        if (submitFields.isNull() == false && submitFields[keyStr].is<JsonVariant>()) {
          continue;
        }
        if (kv.value().is<const char *>() == false) continue;
        const char *valuePtr = kv.value().as<const char *>();
        if (valuePtr == nullptr) continue;
        String pair = urlEncode(keyStr) + "=" + urlEncode(valuePtr);
        query += "&" + pair;
      }
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add app/watering/rom-v2/NetworkExt.h app/watering/rom-v2/NetworkExt.cpp
git commit -m "refactor(rom-v2): remove data paths, code check, add processes caching"
```

---

### Task 9: v2.0.ino——重写 buttonChangeHandler（万能中断 + trigger 启动）

**Files:**
- Modify: `app/watering/rom-v2/v2.0.ino`

- [ ] **Step 1: 添加全局变量声明**

在现有全局变量区域（`_bootstrap` 之后）添加：

```cpp
/** 深度睡眠时长（毫秒），0 表示不启用 */
unsigned long _sleepDuration = 0;
/** 上次用户操作的时间戳（用于空闲睡眠倒计时） */
unsigned long _lastOperationTime = 0;
```

- [ ] **Step 2: 重写 buttonChangeHandler 函数体**

替换整个 `buttonChangeHandler` 函数：

```cpp
void buttonChangeHandler(int type, float value, Button *button, void *context)
{
  // 指示灯闪烁 1 次提示
  light.twinkle(1, Light::SPEED_FAST);

  // 仅处理短按事件
  if (type != Button::TYPE_PRESS) {
    return;
  }

  // 重置空闲倒计时（任何按钮操作都刷新）
  _lastOperationTime = millis();

  Process *processPtr = reinterpret_cast<Process *>(context);

  if (!_idled) {
    // ---- 运行中：万能中断，终止当前流程 ----
    log("Button Interrupt {\"key\":\"%s\",\"action\":\"terminate\"}",
        button->getKey().c_str());
    processPtr->terminate();
    _idled = true;
  } else {
    // ---- 空闲中：匹配 trigger 启动流程 ----
    String buttonKey = button->getKey();
    if (buttonKey.length() == 0) {
      return;
    }

    // 解析缓存的 processes JSON
    String processesJson = network.getProcessesCache();
    JsonDocument processesDoc;
    DeserializationError error = deserializeJson(processesDoc, processesJson);
    if (error) {
      log("Processes Parse Error {\"message\":\"%s\"}", error.c_str());
      return;
    }

    // 遍历 processes 数组，匹配 trigger
    JsonArray processes = processesDoc.as<JsonArray>();
    for (JsonObject proc : processes) {
      if (!proc["trigger"].is<const char*>()) continue;
      String trigger = proc["trigger"].as<String>();
      if (trigger == buttonKey) {
        log("Button Trigger {\"key\":\"%s\",\"process\":\"%s\"}",
            buttonKey.c_str(), proc["name"].as<const char*>());
        // 构造 setSchema 所需的 JSON（需要 stateId + process 字段）
        JsonDocument schema;
        schema["stateId"] = network.getStateId();
        schema["process"] = proc;
        processPtr->setSchema(schema);
        processPtr->execute();
        _idled = false;
        _lastOperationTime = millis();
        return;
      }
    }
    // 未匹配到 trigger，仅闪烁灯（已在函数开头执行）
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/watering/rom-v2/v2.0.ino
git commit -m "feat(rom-v2): add button universal interrupt and trigger-based process start"
```

---

### Task 10: v2.0.ino——更新 networkStateChangeHandler 和 sleepDuration 倒计时

**Files:**
- Modify: `app/watering/rom-v2/v2.0.ino`

- [ ] **Step 1: 重写 networkStateChangeHandler——更新 data 路径**

将所有 `(*state)["data"]["xxx"]` 改为 `(*state)["xxx"]`：

```cpp
void networkStateChangeHandler(JsonDocument *state, NetworkExt *network,
                               void *context)
{
  // 指示灯闪烁提示收到状态更新
  light.twinkle(2, Light::SPEED_FAST);

  // 如果设备开关关闭或需要执行新流程，先终止当前流程
  if ((*state)["switch"] != "on" ||
      (*state)["process"].is<JsonObject>())
  {
    process.terminate();
    _idled = true;
    yield();
  }

  // 设备开关关闭：检查是否需要进入深度睡眠
  if ((*state)["switch"] != "on")
  {
    // 记录 sleepDuration（倒计时逻辑在 loop 中处理，不立即睡眠）
    if ((*state)["sleepDuration"].is<unsigned long>())
    {
      _sleepDuration = (*state)["sleepDuration"].as<unsigned long>();
      log("Sleep Duration Set {\"duration\":%lu}", _sleepDuration);
    }
    yield();
    return;
  }

  // 设备开关打开但无有效流程配置：仅更新状态，不执行操作
  if (!(*state)["process"].is<JsonObject>() ||
      !(*state)["process"]["steps"].is<JsonArray>())
  {
    _idled = true;
    yield();
    return;
  }

  // 启动新流程
  _idled = false;
  _lastOperationTime = millis();  // 刷新操作时间
  process.setSchema((*state).as<JsonObject>());
  process.execute();
}
```

- [ ] **Step 2: 在 setup() 末尾添加 _lastOperationTime 初始化**

在 `setup()` 函数的最后（`network.setWatchStateHandler(...)` 之后）添加：

```cpp
  // 初始化空闲计时器
  _lastOperationTime = millis();
```

- [ ] **Step 3: 在 loop() 中添加睡眠倒计时检查**

在 `loop()` 函数开头（`network.next()` 之前）添加：

```cpp
  // 空闲睡眠倒计时检查
  if (_sleepDuration > 0 && _idled) {
    unsigned long now = millis();
    if (now - _lastOperationTime >= _sleepDuration) {
      log("Sleep {\"duration\":%lu,\"idle\":%lu}",
          _sleepDuration, (unsigned long)(now - _lastOperationTime));
      Serial.flush();
      esp_deep_sleep_start();
    }
  }
```

- [ ] **Step 4: 更新 processChangeHandler 和 processFinishHandler——data 路径**

`processChangeHandler` 和 `processFinishHandler` 中通过 `network->pushState()` 上报，不直接访问 `state` 字段，无需修改路径。但需确保 `processFinishHandler` 中重置空闲计时器：

在 `processFinishHandler` 的 invoke lambda 中，`return network->pushState("finish", &fields);` 之前添加：

```cpp
        _idled = true;
        _lastOperationTime = millis();  // 记录流程完成时间，用于睡眠倒计时
```

- [ ] **Step 5: Commit**

```bash
git add app/watering/rom-v2/v2.0.ino
git commit -m "refactor(rom-v2): update data paths, add sleepDuration countdown logic"
```

---

### Task 11: v2.0.ino——setup() 中为 Button 设置 key

**Files:**
- Modify: `app/watering/rom-v2/v2.0.ino`

- [ ] **Step 1: 在 setup() 的按钮初始化部分添加 setKey 调用**

在每个 `buttonX.setChangeHandler(buttonChangeHandler)` 之后添加对应的 `setKey`：

```cpp
  button0.setPin(GPIO_BUTTON0);
  button0.setContext(&process);
  button0.setChangeHandler(buttonChangeHandler);
  button0.setKey("button_0");   // 新增

  button1.setPin(GPIO_BUTTON1);
  button1.setContext(&process);
  button1.setChangeHandler(buttonChangeHandler);
  button1.setKey("button_1");   // 新增

  button2.setPin(GPIO_BUTTON2);
  button2.setContext(&process);
  button2.setChangeHandler(buttonChangeHandler);
  button2.setKey("button_2");   // 新增

  button3.setPin(GPIO_BUTTON3);
  button3.setContext(&process);
  button3.setChangeHandler(buttonChangeHandler);
  button3.setKey("button_3");   // 新增

  button4.setPin(GPIO_BUTTON4);
  button4.setContext(&process);
  button4.setChangeHandler(buttonChangeHandler);
  button4.setKey("button_4");   // 新增
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/rom-v2/v2.0.ino
git commit -m "feat(rom-v2): wire Button setKey for trigger matching"
```

---

## 验证清单

- [ ] `pnpm exec tsc --noEmit` 无类型错误
- [ ] `pnpm dev` 启动，访问 `http://localhost:3000/watering/api/get-state?chipId=test&macAddress=aa:bb:cc:dd` 验证响应格式符合新结构
- [ ] `http://localhost:3000/watering/api/push-state?chipId=test&macAddress=aa:bb:cc:dd&event=bootstrap` 验证响应为 `{ success: true }`
- [ ] 固件编译通过（Arduino IDE 或 platformio）
- [ ] 固件上板测试：验证 get-state 响应解析正常
- [ ] 固件上板测试：验证按钮中断流程功能
- [ ] 固件上板测试：验证 trigger 启动流程功能
- [ ] 固件上板测试：验证 sleepDuration 空闲 5 分钟后深度睡眠
- [ ] 固件上板测试：验证模拟量中断（如温度 > 阈值触发）
