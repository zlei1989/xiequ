# ROM 休眠逻辑与数据库配置联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ROM 休眠逻辑从"ROM 自行判断空闲+倒计时"重构为"服务端主导决策，ROM 纯粹执行"，使 `idleSleep`/`idleTimeout` 数据库配置真正生效。

**Architecture:** 服务端在 `watering_device_state` 新增 `idle_since`/`last_action_type` 列记录设备动作时间，`pushState` 每次更新，`getState` 据此判断空闲并计算 `sleepDuration`；ROM 移除倒数计时，收到命令直接深睡并定时唤醒。

**Tech Stack:** TypeScript, Next.js App Router, SQLite (better-sqlite3), C++ (Arduino/ESP32)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/watering/types.ts` | 修改 | DeviceState 加 `idleSince`/`lastActionType` |
| `app/watering/services/db.ts` | 修改 | DB 加列 + `updateIdleSince()` + 读写映射 |
| `app/watering/api/push-state/route.ts` | 修改 | 每个事件分支调用 `updateIdleSince()` |
| `app/watering/api/get-state/route.ts` | 修改 | 空闲判断 + 动态计算 sleepDuration |
| `app/watering/rom-v2/rom-v2.ino` | 修改 | 简化 sleep 逻辑 + 定时唤醒 + 移除 `_lastOperationTime` |

---

### Task 1: types.ts — DeviceState 加空闲追踪字段

**Files:**
- Modify: `app/watering/types.ts`

- [ ] **Step 1: 在 DeviceState 中增加 `idleSince` 和 `lastActionType`**

在 `sleepDuration?: number;` 之后、`lastWriteTime` 之前插入：

```ts
  /** 固件轮询间隔（毫秒） */
  sleep?: number;
  /** 空闲深度睡眠时长（毫秒） */
  sleepDuration?: number;
  /** 设备最后一次动作的时间戳（毫秒），pushState 时更新，getState 用于空闲判断 */
  idleSince?: number;
  /** 最后一次动作类型：bootstrap / button / change / finish */
  lastActionType?: string;
  lastWriteTime: string;
```

完整 DeviceState 变为：

```ts
/** 设备状态 — 存储在 SQLite device_state 表中 */
export type DeviceState = {
  chipId: string;
  /** 状态版本 ID（变更时刷新） */
  stateId: string;
  /** 开关状态 */
  switch: 'on' | 'off';
  /** 按钮状态（键为引脚名，值为按下次数） */
  buttons?: Record<string, number>;
  /** 传感器读数（键为引脚名，值为 ADC 原始值） */
  sensors?: Record<string, number>;
  /** 负载状态（键为负载名，值为 0/1） */
  loads?: Record<string, number>;
  /** 当前执行的流程步骤索引 */
  index?: number;
  /** 当前执行的流程副本 */
  process?: ProcessConfig;
  /** 状态消息 */
  message?: string;
  /** 固件轮询间隔（毫秒） */
  sleep?: number;
  /** 空闲深度睡眠时长（毫秒） */
  sleepDuration?: number;
  /** 设备最后一次动作的时间戳（毫秒），pushState 时更新 */
  idleSince?: number;
  /** 最后一次动作类型：bootstrap / button / change / finish */
  lastActionType?: string;
  lastWriteTime: string;
};
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/types.ts
git commit -m "feat: add idleSince and lastActionType to DeviceState"
```

---

### Task 2: db.ts — 数据库加列 + updateIdleSince + 读写映射

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: initDb() 中为旧表添加新列**

在 `initDb()` 函数末尾（现有 ALTER TABLE 块之后）添加：

```ts
  // 为旧数据库添加 idle_since 列（设备空闲计时起点）
  try {
    db.exec('ALTER TABLE watering_device_state ADD COLUMN idle_since INTEGER');
  } catch {
    // 列已存在，忽略
  }

  // 为旧数据库添加 last_action_type 列（设备最后一次动作类型）
  try {
    db.exec('ALTER TABLE watering_device_state ADD COLUMN last_action_type TEXT');
  } catch {
    // 列已存在，忽略
  }
```

- [ ] **Step 2: getDeviceState() 增加字段映射**

当前 `getDeviceState()` 返回对象中，在 `sleepDuration` 之后插入：

```ts
    sleep: row.sleep ?? undefined,
    sleepDuration: row.sleep_duration ?? undefined,
    idleSince: row.idle_since ?? undefined,
    lastActionType: row.last_action_type ?? undefined,
    lastWriteTime: row.last_write_time,
```

- [ ] **Step 3: saveDeviceState() 增加字段映射（INSERT 和 UPDATE）**

`saveDeviceState` 的 INSERT 列列表和 UPDATE SET 列表都需要加上 `idle_since` 和 `last_action_type`。

INSERT 部分，在 `last_tick_time` 之后加：

```sql
INSERT INTO watering_device_state (chip_id, state_id, switch, buttons, sensors, loads, current_index, current_process, message, idle_since, last_action_type, last_tick_time, last_write_time)
VALUES (@chip_id, @state_id, @switch, @buttons, @sensors, @loads, @current_index, @current_process, @message, @idle_since, @last_action_type, @last_tick_time, @last_write_time)
ON CONFLICT(chip_id) DO UPDATE SET
  state_id=@state_id, switch=@switch, buttons=@buttons, sensors=@sensors, loads=@loads,
  current_index=@current_index, current_process=@current_process, message=@message,
  idle_since=@idle_since, last_action_type=@last_action_type,
  last_tick_time=@last_tick_time, last_write_time=@last_write_time
```

run 参数中添加：

```ts
    '@idle_since': state.idleSince ?? null,
    '@last_action_type': state.lastActionType ?? null,
```

- [ ] **Step 4: 新增 updateIdleSince() 函数**

在 `updateTick()` 函数之后添加：

```ts
/**
 * 更新设备空闲计时起点
 *
 * 每次 ROM 有动作（pushState）时调用，重置空闲倒计时。
 * 使用 getDbSync() 保持与 writeDeviceLog 一致的调用模式。
 * SQLite 为同步驱动，函数签名保持 async 以兼容上层契约。
 */
export async function updateIdleSince(chipId: string, actionType: string) {
  const db = getDbSync();
  const now = Date.now();
  const existing = db.prepare('SELECT 1 FROM watering_device_state WHERE chip_id = ?').get(chipId);
  if (existing) {
    db.prepare('UPDATE watering_device_state SET idle_since = ?, last_action_type = ? WHERE chip_id = ?')
      .run([now, actionType, chipId]);
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add app/watering/services/db.ts
git commit -m "feat: add idle_since/last_action_type columns and updateIdleSince to db"
```

---

### Task 3: push-state/route.ts — 每次动作更新空闲计时

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

- [ ] **Step 1: 引入 updateIdleSince**

在 import 中添加 `updateIdleSince`：

```ts
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick, updateIdleSince, calcVoltage } from '@/app/watering/services/db';
```

- [ ] **Step 2: 在每个事件分支末尾调用 updateIdleSince**

**bootstrap 分支**：在 `break;` 之前添加：

```ts
      // 更新空闲计时起点
      await updateIdleSince(chipId, 'bootstrap');
      break;
```

**change 分支**：在 `break;` 之前添加：

```ts
      await updateIdleSince(chipId, 'change');
      break;
```

**finish 分支**：在 `break;` 之前添加：

```ts
      await updateIdleSince(chipId, 'finish');
      break;
```

**default 分支**：在 `break;` 之前添加：

```ts
      await updateIdleSince(chipId, event || 'heartbeat');
      break;
```

- [ ] **Step 3: 提交**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat: update idle_since on every pushState event"
```

---

### Task 4: get-state/route.ts — 空闲判断 + 动态 sleepDuration

**Files:**
- Modify: `app/watering/api/get-state/route.ts`

- [ ] **Step 1: 引入 ScheduleConfig 类型**

在 import 中添加：

```ts
import type { DeviceState, DeviceConfig, ScheduleConfig } from '@/app/watering/types';
```

- [ ] **Step 2: 添加 calcNextScheduleDelay() 辅助函数**

在 `SLEEP_DURATION` 常量定义之后添加：

```ts
/**
 * 计算单个定时任务距现在还有多少毫秒
 *
 * 目前完整支持 day 类型（value = 距 00:00 的毫秒偏移）。
 * 其他类型（minute/week/month）暂简化处理，返回 SLEEP_DURATION。
 *
 * @param schedule 定时任务配置
 * @param now 当前时间
 * @returns 距下次触发的毫秒数
 */
function calcNextScheduleDelay(schedule: ScheduleConfig, now: Date): number {
  if (schedule.disabled) return SLEEP_DURATION;

  if (schedule.type === 'day') {
    const nowMs = now.getTime();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    // value 是距 00:00 的毫秒偏移（如 8:00 = 28800000）
    const todayTrigger = todayStartMs + schedule.value;

    // 今天还没到触发时间 → 返回距离
    if (todayTrigger > nowMs) {
      return todayTrigger - nowMs;
    }

    // 今天已过触发时间 → 下一次是明天（或按 interval 天后）
    const intervalMs = (schedule.interval || 1) * 24 * 3600_000;
    return todayTrigger + intervalMs - nowMs;
  }

  // minute/week/month 暂简化：使用最大睡眠时长
  return SLEEP_DURATION;
}
```

- [ ] **Step 3: 添加 calcSleepDuration() 辅助函数**

紧跟 `calcNextScheduleDelay` 之后：

```ts
/**
 * 计算深睡眠时长（毫秒）
 *
 * 1. 过滤出已启用的定时任务
 * 2. 找到最近的下次触发时间
 * 3. 取最小值与 SLEEP_DURATION 比较，取较小者
 *
 * @param schedules 定时任务列表
 * @param now 当前时间
 * @returns 实际深睡眠时长（毫秒）
 */
function calcSleepDuration(schedules: ScheduleConfig[], now: Date): number {
  const enabled = schedules.filter((s) => !s.disabled);
  if (enabled.length === 0) return SLEEP_DURATION;

  let minDelay = SLEEP_DURATION;
  for (const s of enabled) {
    const delay = calcNextScheduleDelay(s, now);
    if (delay < minDelay) {
      minDelay = delay;
    }
  }

  return Math.min(SLEEP_DURATION, minDelay);
}
```

- [ ] **Step 4: 修改 buildResponse() 中的 sleepDuration 逻辑**

替换当前第 48-55 行：

```ts
  // 深度睡眠时长（仅无定时任务且无流程执行时下发）
  if (
    config &&
    (config.schedules.length === 0) &&
    state?.switch !== 'on'
  ) {
    result.sleepDuration = SLEEP_DURATION;
  }
```

改为：

```ts
  // 深度睡眠：服务端主导判断
  // 条件：① 用户开启空闲睡眠 ② 设备关机 ③ 有动作记录 ④ 已空闲超时
  if (
    config &&
    config.idleSleep &&
    state?.switch !== 'on' &&
    state?.idleSince != null &&
    (Date.now() - state.idleSince) >= config.idleTimeout
  ) {
    result.sleepDuration = calcSleepDuration(config.schedules, new Date());
  }
```

- [ ] **Step 5: 更新 SLEEP_DURATION 注释**

```ts
/** 深睡眠最大时长（毫秒），由 WATERING_SLEEP_DURATION 环境变量控制，默认 5 分钟 */
const SLEEP_DURATION = parseInt(process.env.WATERING_SLEEP_DURATION || '300000');
```

- [ ] **Step 6: 提交**

```bash
git add app/watering/api/get-state/route.ts
git commit -m "feat: implement service-dominant sleep decision with dynamic sleepDuration"
```

---

### Task 5: rom-v2.ino — 简化睡眠逻辑 + 定时唤醒

**Files:**
- Modify: `app/watering/rom-v2/rom-v2.ino`

ROM 端三处改动：移除 `_lastOperationTime`、简化 loop() 睡眠逻辑、添加定时唤醒。

- [ ] **Step 1: 移除 `_lastOperationTime` 全局变量声明**

删除第 124 行：

```cpp
/** 上次用户操作的时间戳（用于空闲睡眠倒计时） */
unsigned long _lastOperationTime = 0;
```

- [ ] **Step 2: 移除 setup() 中 `_lastOperationTime` 初始化**

删除第 262 行：

```cpp
  // 初始化空闲计时器
  _lastOperationTime = millis();
```

- [ ] **Step 3: 简化 loop() 中的睡眠逻辑**

替换第 274-282 行。改前：

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

改后：

```cpp
  // 收到睡眠指令后立即进入深睡眠（带定时唤醒）
  if (_sleepDuration > 0 && _idled) {
    log("Sleep {\"duration\":%lu}", _sleepDuration);
    Serial.flush();
    // 配置定时唤醒（参数单位：微秒）
    esp_sleep_enable_timer_wakeup(_sleepDuration * 1000ULL);
    esp_deep_sleep_start();
  }
```

- [ ] **Step 4: 移除 networkStateChangeHandler 中刷新 `_lastOperationTime` 的代码**

删除第 490 行（在 `process.execute();` 之前）：

```cpp
  _lastOperationTime = millis();  // 刷新操作时间
```

- [ ] **Step 5: 移除 processFinishHandler 中刷新 `_lastOperationTime` 的代码**

删除第 543 行（在 `_idled = true;` 之后）：

```cpp
        _lastOperationTime = millis();
```

- [ ] **Step 6: 移除 buttonChangeHandler 中两处刷新 `_lastOperationTime` 的代码**

删除第 569 行：

```cpp
  // 重置空闲倒计时（任何按钮操作都刷新）
  _lastOperationTime = millis();
```

删除第 610 行（在 `_idled = false;` 之后）：

```cpp
        _lastOperationTime = millis();
```

- [ ] **Step 7: 提交**

```bash
git add app/watering/rom-v2/rom-v2.ino
git commit -m "feat: simplify ROM sleep logic — remove countdown, add timer wakeup"
```

---

### Task 6: 格式化与检查

- [ ] **Step 1: 格式化**

```bash
npm run format
```

- [ ] **Step 2: 类型检查**

```bash
npm run check
```

- [ ] **Step 3: 修复所有错误后提交**

```bash
git add -A
git commit -m "chore: format and fix lint after ROM sleep config sync"
```

---

## 验证清单

全部任务完成后，确认：

- [ ] `npm run format` 无错误
- [ ] `npm run check` 无错误
- [ ] `types.ts` 中 DeviceState 包含 `idleSince?: number` 和 `lastActionType?: string`
- [ ] `db.ts` 中 `initDb()` 包含 `idle_since` 和 `last_action_type` 的 ALTER TABLE
- [ ] `db.ts` 中 `updateIdleSince()` 函数存在且签名正确
- [ ] `push-state/route.ts` 中每个事件分支末尾调用 `updateIdleSince()`
- [ ] `get-state/route.ts` 中 `buildResponse` 使用 `config.idleSleep && idleSince` 判断
- [ ] `get-state/route.ts` 中 `sleepDuration` 值由 `calcSleepDuration()` 动态计算
- [ ] `rom-v2.ino` 中移除了 `_lastOperationTime` 全部引用
- [ ] `rom-v2.ino` 中 `esp_deep_sleep_start()` 前有 `esp_sleep_enable_timer_wakeup()` 调用
