# ROM 休眠逻辑与数据库配置联动设计

**日期**：2026-06-14
**状态**：设计完成，待实施

## 概述

当前 ROM 端休眠逻辑与数据库配置完全脱节，且 ROM 承担了本应由服务端负责的判断逻辑。本设计重构为**服务端主导决策、ROM 纯粹执行**的架构。

## 问题诊断

### 三个脱节

1. **`sleepDuration` 语义混淆**：环境变量值被当作"空闲倒计时"下发，实际应是"深睡眠持续时长"
2. **`idleSleep`/`idleTimeout` 从未生效**：数据库配置被 `get-state` 完全忽略
3. **ROM 做了不该做的判断**：自己维护 `_lastOperationTime` 做空闲倒计时，无法感知计划任务时间约束

### 架构问题

```
当前：ROM 自己判断空闲 → 自己倒计时 → 盲目深睡（无定时唤醒）

目标：服务端判断空闲 → 服务端计算睡多久 → ROM 收到命令直接睡（定时唤醒）
```

## 设计原则

- **ROM 不问"我闲了多久"** — 服务端根据设备动作记录判断
- **ROM 只认一个数** — `sleepDuration`：要睡多少毫秒，收到就睡
- **ROM 不自己倒计时** — 移除 `_lastOperationTime`，简化 loop()

## 角色分工

| 职责 | 服务端 | ROM |
|------|--------|-----|
| 记录设备动作时间 | ✅ `pushState` 更新 `idle_since` | — |
| 判断是否空闲 | ✅ `now - idleSince >= idleTimeout` | — |
| 决定是否休眠 | ✅ `idleSleep && switch==off && 空闲` | — |
| 计算睡多久 | ✅ `min(下次计划任务时间, SLEEP_DURATION)` | — |
| 执行睡眠 | — | ✅ 收到 `sleepDuration > 0` 直接睡 |
| 定时唤醒 | — | ✅ `esp_sleep_enable_timer_wakeup` |

## 数据库变更

### `watering_device_state` 加列

```sql
ALTER TABLE watering_device_state ADD COLUMN idle_since INTEGER;
ALTER TABLE watering_device_state ADD COLUMN last_action_type TEXT;
```

| 列（DB） | 代码字段 | 类型 | 说明 |
|----------|----------|------|------|
| `idle_since` | `idleSince` | `number` | 设备最后一次动作的时间戳（`Date.now()`），pushState 时更新 |
| `last_action_type` | `lastActionType` | `string` | 动作类型：`bootstrap` / `button` / `change` / `finish` |

> **命名约定**：数据库用 `snake_case`，TypeScript 用 `camelCase`，与现有 `chip_id`→`chipId`、`last_write_time`→`lastWriteTime` 保持一致。

## 完整数据流

```
用户在 UI 配置:
  idleSleep = true
  idleTimeout = 60000 (1分钟)
  switch = 'off'
  schedules = [{ type: 'day', value: 28800000, interval: 1 }]  // 每天 8:00
         │
         ▼
  ┌───────────────────────────────────────┐
  │           push-state/route.ts          │
  │  每次收到 ROM 动作 (bootstrap/change/   │
  │  finish/heartbeat) → 更新 idle_since   │
  └───────────────────────────────────────┘
         │
         ▼  ROM 每 15 秒轮询 get-state
  ┌───────────────────────────────────────┐
  │          get-state/route.ts            │
  │                                       │
  │  ① idleSleep === true?               │→ yes
  │  ② switch === 'off'?                 │→ yes
  │  ③ now - idleSince >= idleTimeout?   │→ yes（已空闲超时）
  │  ④ calcSleepDuration():              │
  │     距下次计划任务 10 分钟              │
  │     min(300000, 600000) = 300000      │
  │                                       │
  │  → sleepDuration = 300000             │
  └───────────────────────────────────────┘
         │ JSON: { sleepDuration: 300000 }
         ▼
  ┌───────────────────────────────────────┐
  │            ESP32 ROM                  │
  │                                       │
  │  networkStateChangeHandler():         │
  │    收到 sleepDuration > 0 && _idled   │
  │    → 不倒数，直接进入深睡眠             │
  │                                       │
  │  esp_sleep_enable_timer_wakeup(       │
  │    sleepDuration * 1000)  // ms→μs    │
  │  esp_deep_sleep_start()               │
  │                                       │
  │  （5分钟后自动唤醒→重启→联网→拉状态）   │
  └───────────────────────────────────────┘
```

## 文件变更

### 1. `types.ts` — DeviceState 加字段

```ts
export type DeviceState = {
  // ... 现有字段不变 ...
  /** 设备最后一次动作的时间戳（毫秒），服务端 pushState 时更新 */
  idleSince?: number;
  /** 最后一次动作类型 */
  lastActionType?: string;
  lastWriteTime: string;
};
```

### 2. `services/db.ts` — 建表 + 读写 + 新增函数

**建表**：`initDb()` 中加 ALTER TABLE（兼容旧表）。

**新增函数**：

```ts
/**
 * 更新设备空闲计时起点
 * 每次 ROM 有动作（pushState）时调用，重置空闲倒计时
 */
export async function updateIdleSince(chipId: string, actionType: string) {
  const db = getDbSync();
  const now = Date.now();
  db.prepare(`
    UPDATE watering_device_state
    SET idle_since = ?, last_action_type = ?
    WHERE chip_id = ?
  `).run([now, actionType, chipId]);
}
```

**读写映射**：`getDeviceState()` 和 `saveDeviceState()` 中增加 `idleSince`/`lastActionType` ↔ `idle_since`/`last_action_type` 映射。

### 3. `api/push-state/route.ts` — 每次动作更新 idle_since

在每个事件分支末尾调用 `updateIdleSince(chipId, event)`。

### 4. `api/get-state/route.ts` — 核心逻辑重构

**新增辅助函数**：

```ts
/**
 * 计算深睡眠时长（毫秒）
 *
 * 1. 过滤出已启用的计划任务
 * 2. 计算每个任务的下次触发时间（距现在毫秒数）
 * 3. 取最小值与 SLEEP_DURATION 比较，取较小者
 * 4. 无计划任务时直接返回 SLEEP_DURATION
 */
function calcSleepDuration(
  schedules: ScheduleConfig[],
  now: Date,
): number {
  const enabled = schedules.filter((s) => !s.disabled);
  if (enabled.length === 0) return SLEEP_DURATION;

  let minDelay = Infinity;
  for (const s of enabled) {
    const delay = calcNextScheduleDelay(s, now);
    if (delay < minDelay) minDelay = delay;
  }

  return Math.min(SLEEP_DURATION, minDelay);
}

/**
 * 计算单个计划任务距现在还有多少毫秒
 */
function calcNextScheduleDelay(
  schedule: ScheduleConfig,
  now: Date,
): number {
  const nowMs = now.getTime();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  if (schedule.type === 'day') {
    // value 是距 00:00 的毫秒偏移
    const todayTrigger = todayStartMs + schedule.value;
    if (todayTrigger > nowMs) {
      return todayTrigger - nowMs;           // 今天还没到
    }
    // 已过 → 下一次是明天
    return todayTrigger + 24 * 3600_000 - nowMs;
  }

  // 其他类型暂简化：使用 SLEEP_DURATION
  return SLEEP_DURATION;
}
```

**修改 `buildResponse`**：

```ts
function buildResponse(
  state: DeviceState | null,
  changed: boolean,
  config: DeviceConfig | null,
  clientProcessesVersion?: string,
) {
  const result: Record<string, unknown> = {};

  // ... 现有字段不变 (stateId, changed, switch, sleep, process) ...

  // 休眠判断：服务端主导
  const now = Date.now();
  if (
    config &&
    config.idleSleep &&                          // 用户开启休眠
    state?.switch !== 'on' &&                    // 设备关机
    state?.idleSince != null &&                  // 有动作记录
    (now - state.idleSince) >= config.idleTimeout // 已空闲超时
  ) {
    result.sleepDuration = calcSleepDuration(config.schedules, new Date(now));
  }

  // ... processes 版本控制不变 ...

  return result;
}
```

### 5. `rom-v2.ino` — 简化睡眠逻辑

**移除**：
- `_lastOperationTime` 全局变量
- `loop()` 中空闲倒计时逻辑
- `buttonChangeHandler` 和 `processFinishHandler` 中刷新 `_lastOperationTime` 的代码

**新增**：
- `esp_sleep_enable_timer_wakeup()` 调用

改动后 `loop()` 中睡眠部分：

```cpp
// ===== 改前 =====
if (_sleepDuration > 0 && _idled) {
    unsigned long now = millis();
    if (now - _lastOperationTime >= _sleepDuration) {
      esp_deep_sleep_start();
    }
}

// ===== 改后 =====
if (_sleepDuration > 0 && _idled) {
    esp_sleep_enable_timer_wakeup(_sleepDuration * 1000ULL);
    esp_deep_sleep_start();
}
```

`networkStateChangeHandler` 不变（仍从 `sleepDuration` 字段读取）。

### 6. `NetworkExt.cpp` — 排除列表

`getStateQuery` 中 `sleepDuration` 已排除（不变），无需额外修改。

## 不变的部分

| 组件 | 状态 |
|------|------|
| `DeviceConfigForm` / `device-editor.tsx` | 不改（idleSleep/idleTimeout 字段已存在） |
| `DeviceConfig` 类型 | 不改 |
| `WATERING_SLEEP_DURATION` 环境变量 | 保留，作为最大睡眠时长上限 |
| `WATERING_POLL_INTERVAL` 环境变量 | 不改 |

## 与 DeviceConfigForm 计划的关系

[DeviceConfigForm 重构计划](../plans/2026-06-14-device-config-form-plan.md) Task 1 对 `types.ts` 中的 `DeviceState` 有完整重写。本设计新增的 `idleSince`/`lastActionType` 字段需要合并到该重写中。建议在 Task 1 的类型定义中直接包含这两个新字段。

其他无冲突。

## 验证清单

- [ ] `pushState` 在每次事件时更新 `idle_since` 和 `last_action_type`
- [ ] `get-state` 在 `idleSleep=true, switch='off', 已空闲超时` 时下发 `sleepDuration`
- [ ] `sleepDuration` 值为 `min(SLEEP_DURATION, 距下次计划任务时间)`
- [ ] `get-state` 在 `idleSleep=false` 时不包含 `sleepDuration`
- [ ] `get-state` 在 `switch='on'` 时不包含 `sleepDuration`
- [ ] `get-state` 在 `idleSince` 未超时时不包含 `sleepDuration`
- [ ] ROM 收到 `sleepDuration > 0` 直接深睡，不做倒数
- [ ] ROM 深睡带定时唤醒，到期自动重启联网
- [ ] ROM 移除 `_lastOperationTime` 相关代码
