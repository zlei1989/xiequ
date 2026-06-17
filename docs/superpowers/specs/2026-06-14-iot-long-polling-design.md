# IoT 设备 HTTP 长轮询回调机制 — 设计文档

> 2026-06-14 | 对齐 7qb-server `GetState` / `SetState` / `PushState` 的长轮询模式

## 目标

将 7qb-server（Express）中的 HTTP 长轮询 + Promise 阻塞 + execCallback 唤醒模式移植到 xiequ/service（Next.js）的浇花模块，同时补充计划任务检查和开机执行功能。

**原则**：现有功能不变，现有逻辑不受影响，在现有基础上增加新能力。

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/watering/services/callback-map.ts` | **新增** | 全局回调 Map + setCallback/execCallback/deleteCallback |
| `app/watering/services/db.ts` | **修改** | 新增 `watering_schedule_log` 表，防止计划任务重复执行 |
| `app/watering/api/get-state/route.ts` | **修改** | 增加 Promise 阻塞长轮询 + 计划任务自动检查 + 省电计算 |
| `app/watering/actions/set-state.ts` | **修改** | 写入状态后调用 `execCallback(chipId)` 唤醒设备 |
| `app/watering/api/push-state/route.ts` | **修改** | bootstrap 增加开机执行检查（bootExec + cause 过滤）+ execCallback；finish 后加 execCallback |

## 架构

### 数据流

```
ESP32 ──GET /get-state──▶ 有变化？──是──▶ 立即返回新状态
                              │
                             否
                              ▼
                    new Promise((resolve) => {
                      setTimeout(() => resolve(unchanged), TIMEOUT)
                      callbackMap.set(chipId, resolve)
                    })
                              ▲
                              │ execCallback(chipId)
                              │
         set-state action ────┤
         push-state route ────┘
```

### 全局回调 Map

```ts
// app/watering/services/callback-map.ts
const callbackMap = new Map<string, () => void>();

/** 注册回调：设备重连时先执行旧回调释放上一次等待，再注册新回调 */
export function setCallback(chipId: string, callback: () => void): void;

/** 执行回调并删除：通知等待中的 get-state 立即返回最新状态 */
export function execCallback(chipId: string): void;

/** 静默删除：超时后 finally 清理，不执行回调 */
export function deleteCallback(chipId: string): void;
```

### 行为矩阵

| 场景 | setCallback | execCallback | deleteCallback |
|------|-------------|-------------|----------------|
| Map 中已有回调 | 先执行旧回调，再设置新回调 | — | — |
| Map 中无回调 | 直接设置 | 空操作（不报错） | 空操作（不报错） |
| 执行后 | — | 删除 | 不执行，直接删除 |

## 各模块详细设计

### 1. get-state route

#### 处理流程

```
GET /api/watering/get-state
  │
  ├─ 1. 参数验证（保持现有）
  ├─ 2. 刷新心跳（保持现有）
  ├─ 3. 并发读取状态 + 配置（保持现有）
  │
  ├─ 4. ★ 计划任务检查（新增）
  │     条件：state.switch === 'off'
  │     动作：遍历 config.schedules，找到应执行的任务
  │     触发条件：triggerTime ≤ now 且 |now - triggerTime| ≤ 45 分钟
  │     去重：检查 watering_schedule_log 表，按 interval 判断前 N 天是否已执行
  │     结果：更新 state.switch='on', state.process, state.stateId
  │
  ├─ 5. 比较 stateId → changed
  ├─ 6. 省电计算（保持现有）
  │
  └─ 7. ★ 返回策略
        changed==true → 立即返回
        changed==false → new Promise (setTimeout + setCallback)
```

#### Promise 阻塞实现

```ts
try {
  return await new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ stateId: state?.stateId, changed: false, sleep: POLL_INTERVAL }),
      timeout,
    );
    const callback = async () => {
      clearTimeout(timer);
      const state = await getDeviceState(chipId);
      resolve({ ...(state || {}), changed: true, sleep: POLL_INTERVAL });
    };
    setCallback(chipId, callback);
  });
} finally {
  deleteCallback(chipId);
}
```

#### 超时配置

通过环境变量 `WATERING_LONG_POLL_TIMEOUT` 控制（默认 7000ms），与现有 `WATERING_POLL_INTERVAL` 分离。

### 2. 计划任务检查

#### 触发条件

- `state.switch === 'off'`（设备空闲）
- 存在启用的 schedule（`schedule.disabled !== true`）
- `now >= triggerTime`（已到达触发时间）
- `|now - triggerTime| <= 45 * 60 * 1000`（45 分钟误差容忍）
- 未在 schedule_log 中标记为已执行（按 interval 去重）

#### schedule 类型支持

| type | 周期 | 说明 |
|------|------|------|
| `day` | 每天 | `value` = 距 00:00 的毫秒偏移，按 `interval` 天间隔去重 |

其他类型（minute/week/month）暂不支持，后续扩展。

#### schedule_log 表

```sql
CREATE TABLE IF NOT EXISTS watering_schedule_log (
  chip_id TEXT NOT NULL,
  trigger_time INTEGER NOT NULL,
  process_index INTEGER NOT NULL,
  created_time INTEGER NOT NULL,
  PRIMARY KEY (chip_id, trigger_time, process_index)
)
```

#### 去重逻辑

```
interval = 2（每 2 天执行一次），triggerTime = 2026-06-14 10:00
检查：今天（06-14）已执行？→ 跳过
检查：昨天（06-13）已执行？→ 跳过（因为 interval=2）
前天（06-12）及更早？→ 不检查，触发执行
```

### 3. push-state bootstrap 开机执行

#### 处理流程

```
case 'bootstrap':
  1. 获取/创建 config、state（保持现有）
  2. 解析 GPIO 状态（保持现有）
  3. ★ 开机执行检查：
     if (
       state.switch === 'off' &&
       config.bootExec > -1 &&
       config.bootExec < config.processes.length &&
       ['External System', 'Power On'].includes(event.cause)
     ) {
       state.switch = 'on'
       state.index = config.bootExec
       state.process = deepClone(config.processes[config.bootExec])
       if (config.execDelay > 0) {
         state.process.steps[0].delay += config.execDelay
       }
     }
  4. saveDeviceState(state)
  5. execCallback(chipId)  // ★ 唤醒等待中的 get-state
  6. 写日志（保持现有）
```

#### 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `bootExec` | `number` | `-1` | 开机自动执行的流程索引，-1 表示不执行 |
| `execDelay` | `number` | `0` | 开机后延迟时间（毫秒），追加到第一步 delay |
| `cause` | `string` | — | 开机原因，仅 `External System` / `Power On` 触发开机执行 |

### 4. set-state action

```
await saveDeviceState(state);   // 保持现有
execCallback(chipId);            // ★ 新增：唤醒等待中的 get-state
return { success: true };        // 保持现有
```

### 5. push-state route — finish

```
case 'finish':
  state.switch = 'off';               // 保持现有
  state.index = undefined;            // 保持现有
  state.process = undefined;          // 保持现有
  await saveDeviceState(state);       // 保持现有
  execCallback(chipId);               // ★ 新增：通知设备状态已变更
  // ... 写日志（保持现有）
```

## 边界情况处理

### 设备重连覆盖旧回调

设备可能在上一次等待未结束时就发起新的 get-state。`setCallback` 检测到旧回调存在时先执行它（让上一次请求正常返回 unchanged），再注册新回调。

### 并发 setState + pushState 同时唤醒

两个请求先后调用 `execCallback`，第二次调用时 Map 中已无回调（第一次已执行并删除），静默跳过，不报错。

### SCF 冷启动

新实例 Map 为空，设备第一次 get-state 走"有变化立即返回"分支。与 7qb-server 重启行为一致，设备重连后自动恢复。

### 计划任务边界

- 设备因深睡眠错过精确触发时间，45 分钟误差容忍确保醒来后仍会执行
- schedule_log 按 `(chipId, triggerTime, processIndex)` 联合主键防止重复执行
- switch=on 时跳过计划任务检查，不打断正在执行的流程

## 测试

### 单元测试

**callback-map**（`__tests__/watering/callback-map.test.ts`）：

| 用例 | 场景 | 预期 |
|------|------|------|
| setCallback 注册 | 首次注册 | Map 中有回调 |
| setCallback 覆盖 | 设备重连 | 旧回调被执行，新回调替换 |
| execCallback 通知 | Map 中有回调 | 回调执行，Map 中删除 |
| execCallback 空操作 | Map 中无回调 | 不报错 |
| deleteCallback 清理 | Map 中有回调 | 删除，不执行回调 |
| deleteCallback 空操作 | Map 中无回调 | 不报错 |

**计划任务检查**（`__tests__/watering/schedule-check.test.ts`）：

| 用例 | 场景 | 预期 |
|------|------|------|
| 到达触发时间 | 10:05, schedule 10:00 | 触发 |
| 未到触发时间 | 9:55, schedule 10:00 | 不触发 |
| 过期超 45 分钟 | 10:50, schedule 10:00 | 不触发 |
| 今天已执行 | schedule_log 有记录 | 不重复触发 |
| interval=3 | 前天执行过 | 不触发 |
| disabled 跳过 | schedule.disabled=true | 不触发 |
| switch=on 时 | 设备正在执行 | 跳过检查 |

**get-state 响应**（`__tests__/watering/get-state.test.ts`）：

| 用例 | 场景 | 预期 |
|------|------|------|
| stateId 不同 | 有变化 | 立即返回 new state |
| stateId 相同 | 无变化 | Promise 阻塞等待 |
| 超时 | N 秒无通知 | 返回 changed: false |
| execCallback 唤醒 | setState 通知 | 返回最新状态 |
| 省电睡眠 | idleSleep 开启 + 空闲 | sleepDuration 正确计算 |

### 集成验证清单

| 步骤 | 验证点 |
|------|--------|
| 1. ESP32 bootstrap | 自动创建配置，如 bootExec + cause 满足则下发 process |
| 2. Web UI 点"开启" | get-state 立即返回 process，不等到超时 |
| 3. ESP32 执行完成 | finish 后 get-state 返回 switch: off |
| 4. 无操作等待 | get-state 超时后 ESP32 发起下一轮 |
| 5. 计划任务到达 | 设备唤醒后 get-state 自动返回 process |
| 6. 快速开关切换 | 每次 execCallback 都能正确唤醒 |
| 7. 设备重连 | 旧 callback 被释放，新 callback 正常注册 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WATERING_POLL_INTERVAL` | `15000` | 设备轮询间隔（毫秒），告知设备多久后再次请求 |
| `WATERING_LONG_POLL_TIMEOUT` | `7000` | 长轮询超时（毫秒），服务端保持连接的最长时间 |
| `WATERING_SLEEP_DURATION` | `300000` | 深睡眠最大时长（毫秒），省电模式下告知设备最长睡眠时间 |
