# ROM 休眠逻辑与数据库配置联动设计

**日期**：2026-06-14
**状态**：设计完成，待实施

## 概述

ROM 端休眠逻辑当前与数据库配置脱节：`DeviceConfig.idleSleep`（休眠总开关）和 `idleTimeout`（空闲超时时长）未被服务端 `get-state` 接口下发，导致用户配置无法控制 ROM 的休眠行为。本设计建立配置→服务端→ROM 的完整数据通路。

## 问题诊断

### 当前行为

```
DeviceConfig.idleSleep   ──→  get-state 忽略
DeviceConfig.idleTimeout ──→  get-state 忽略
WATERING_SLEEP_DURATION  ──→  get-state 硬编码下发 sleepDuration ──→ ROM 当空闲倒计时用
```

三个脱节：

1. **`sleepDuration` 语义混淆**：环境变量 `WATERING_SLEEP_DURATION`（意"深睡眠持续多久"）被下发为 `sleepDuration`，ROM 将其当作"空闲多久后进入睡眠"的倒计时，两个不同概念混为一个字段
2. **`idleSleep` 总开关被忽略**：`buildResponse` 不检查 `config.idleSleep`，用户关闭休眠后 ROM 仍可能收到 `sleepDuration`
3. **`idleTimeout` 从未下发**：用户配置的空闲超时值对 ROM 不可见

### 概念澄清

| 字段 | 含义 | 来源 | 使用者 |
|------|------|------|--------|
| `idleSleep` | 是否启用空闲休眠 | DB `DeviceConfig` | 服务端判断是否下发休眠指令 |
| `idleTimeout` | 无操作多久后进入睡眠 | DB `DeviceConfig` | 服务端下发 → ROM 做倒计时 |
| `WATERING_SLEEP_DURATION` | 深睡眠持续多久（唤醒间隔） | 环境变量 | 未来 ROM 支持定时唤醒时使用 |

## 设计

### 服务端职责

**决策**：是否应该休眠、用多大倒计时。在 `get-state` 响应的 `sleepDuration` 字段中体现。

ROM 不需要知道 `idleSleep`、`idleTimeout` 等概念——它只认 `sleepDuration` 一个字段，含义恒为"空闲多久后睡眠"。

### ROM 职责

**执行**（不变）：收到 `sleepDuration` 后做空闲倒计时，超时进入 `esp_deep_sleep_start()`。代码无需改动。

### 休眠下发条件

仅当满足以下**全部**条件时，服务端才下发 `sleepDuration`：

1. `config.idleSleep === true` — 用户开启了空闲睡眠
2. `state?.switch !== 'on'` — 设备处于关机状态（休眠 = 关机 + 省电）

满足条件时，`sleepDuration` 的值取 `config.idleTimeout`。

### 移除的限制

- ~~`schedules.length === 0`~~ — 有定时任务也可以休眠。当前 ROM 不支持定时唤醒，进入深睡眠后需外部唤醒；未来 ROM 升级后，服务端可计算 `sleepDuration = min(idleTimeout, 距下次定时任务时间, WATERING_SLEEP_DURATION)` 实现精确调度

## 完整数据流

```
用户 UI 设置:
  idleSleep = true
  idleTimeout = 60000 (1分钟)
  switch = 'off'
         │
         ▼
  ┌──────────────────────────┐
  │       SQLite 数据库       │
  │  idle_sleep = 1          │
  │  idle_timeout = 60000    │
  │  switch = 'off'          │
  └──────────────────────────┘
         │
         ▼  ROM 轮询 GET /api/watering/get-state
  ┌──────────────────────────┐
  │   get-state/route.ts    │
  │                          │
  │  idleSleep === true?    │→ yes
  │  switch === 'off'?      │→ yes
  │  ↓                       │
  │  sleepDuration = 60000  │← config.idleTimeout
  └──────────────────────────┘
         │ JSON
         ▼
  ┌──────────────────────────┐
  │      ESP32 ROM           │
  │                          │
  │  _sleepDuration = 60000  │
  │  loop() 中倒计时:        │
  │    空闲 > 60000ms →      │
  │    esp_deep_sleep_start()│
  └──────────────────────────┘
```

## 改动范围

| 文件 | 改动 | 量级 |
|------|------|------|
| `app/watering/api/get-state/route.ts` — `buildResponse` 函数 | 修改 `sleepDuration` 下发条件 | ~5 行 |
| ROM `rom-v2.ino` | **不改** | 0 |
| 数据库表结构 | **不改** | 0 |
| `types.ts` | **不改** | 0 |
| `DeviceConfigForm` / `device-editor.tsx` | **不改**（idleSleep/idleTimeout 字段已存在） | 0 |

### 与服务端当前重构计划的关系

本改动与 `DeviceConfigForm` 重构计划（`docs/superpowers/plans/2026-06-14-device-config-form-plan.md`）无冲突：重构计划改的是 UI 组件命名和结构，不涉及 `idleSleep`/`idleTimeout` 字段的定义、保存逻辑或 API 下发逻辑。

## 具体代码改动

文件：[app/watering/api/get-state/route.ts](app/watering/api/get-state/route.ts)

### 当前 `buildResponse` 中的休眠逻辑（第 48-55 行）

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

### 修改后

```ts
// 深度睡眠：仅当用户启用空闲休眠且设备关机时下发
// sleepDuration 使用用户配置的空闲超时时长，ROM 在空闲超过该时长后进入深睡眠
if (
  config &&
  config.idleSleep &&
  state?.switch !== 'on'
) {
  result.sleepDuration = config.idleTimeout;
}
```

### 环境变量

`SLEEP_DURATION` 环境变量和常量定义保留，注释更新为：

```ts
/** 深睡眠最大时长（毫秒），未来 ROM 支持定时唤醒时计算实际睡眠时长的上限约束 */
const SLEEP_DURATION = parseInt(process.env.WATERING_SLEEP_DURATION || '300000');
```

## 验证清单

- [ ] `get-state` 在 `idleSleep=true, switch='off'` 时下发 `sleepDuration=idleTimeout`
- [ ] `get-state` 在 `idleSleep=false` 时不包含 `sleepDuration` 字段
- [ ] `get-state` 在 `switch='on'` 时不包含 `sleepDuration` 字段
- [ ] 有定时任务时仍可下发 `sleepDuration`（`schedules.length === 0` 限制已移除）
- [ ] Environment variable `WATERING_SLEEP_DURATION` still works
