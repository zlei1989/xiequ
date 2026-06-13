# 日志卡片内容增强 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 LogCard 信息密度，独立列存储高频字段，前端中文化展示唤醒原因/变更类型/电压/休眠时长。

**Architecture:** 数据库新增 4 列（mac_address, state_id, message, voltage），服务端 push-state 路由补全 change 事件分支并计算电压，前端 LogCard 读取新字段渲染摘要行、中文映射和时间简化。

**Tech Stack:** Next.js App Router + SQLite WASM + antd-mobile + TypeScript

---

### Task 1: 数据库迁移与 writeDeviceLog / getDeviceLogs 更新

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 在 `initDb` 中添加新增列的迁移 SQL**

在 `initDb` 函数末尾（`CREATE INDEX` 之后）追加：

```ts
  // 新增独立列迁移（v2: 从 state JSON 提取高频字段）
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN mac_address TEXT');
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN state_id TEXT');
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN message TEXT');
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN voltage REAL NOT NULL DEFAULT 0');
  } catch { /* 列已存在 */ }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_watering_logs_state_id ON watering_logs(state_id)');
  } catch { /* 索引已存在 */ }
```

同步更新 `CREATE TABLE IF NOT EXISTS watering_logs` 语句，在 `state JSON` 后追加新列：

```sql
    CREATE TABLE IF NOT EXISTS watering_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chip_id TEXT NOT NULL,
      mac_address TEXT,
      event TEXT NOT NULL,
      state_id TEXT,
      message TEXT,
      state JSON,
      voltage REAL NOT NULL DEFAULT 0,
      created_time TEXT NOT NULL
    )
```

- [ ] **Step 2: 更新 `writeDeviceLog` 签名和实现**

变更前：

```ts
export async function writeDeviceLog(
  chipId: string,
  event: string,
  state?: Record<string, unknown>,
) {
  const db = getDb();
  db.prepare('INSERT INTO watering_logs (chip_id, event, state, created_time) VALUES (?, ?, ?, ?)').run([
    chipId,
    event,
    state ? JSON.stringify(state) : null,
    new Date().toISOString(),
  ]);
}
```

变更后：

```ts
/**
 * 写入设备日志
 *
 * SQLite WASM 驱动 API 为同步调用，但函数签名保持 async 以兼容上层契约。
 * voltage 从设备配置的电压分压公式计算，未配置时为 0。
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function writeDeviceLog(
  chipId: string,
  event: string,
  macAddress: string,
  state?: Record<string, unknown>,
  voltage?: number,
  stateId?: string,
  message?: string,
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_logs (chip_id, mac_address, event, state_id, message, state, voltage, created_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run([
    chipId,
    macAddress,
    event,
    stateId ?? null,
    message ?? null,
    state ? JSON.stringify(state) : null,
    voltage ?? 0,
    new Date().toISOString(),
  ]);
}
```

- [ ] **Step 3: 更新 `getDeviceLogs` 返回新增列**

变更前：

```ts
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    event: row.event,
    state: parseJSON(row.state, undefined as Record<string, unknown> | undefined),
    createdTime: row.created_time,
  }));
```

变更后：

```ts
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    macAddress: row.mac_address ?? undefined,
    event: row.event,
    stateId: row.state_id ?? undefined,
    message: row.message ?? undefined,
    state: parseJSON(row.state, undefined as Record<string, unknown> | undefined),
    voltage: typeof row.voltage === 'number' ? row.voltage : undefined,
    createdTime: row.created_time,
  }));
```

- [ ] **Step 4: 新增电压计算辅助函数**

在 `writeDeviceLog` 上方新增：

```ts
/**
 * 计算设备当前电压
 *
 * 从 GPIO 传感器数据中取对应引脚的读数，应用分压公式。
 * 公式：V_actual = V_sensor × (R1 + R2) / R2
 * 仅在 r1 > 0 && r2 > 0 时应用分压比，否则直接使用原始读数。
 * 传感器数据缺失或电压未配置时返回 0。
 */
export function calcVoltage(
  voltageConfig: { sensor: string; r1: number; r2: number } | undefined,
  sensors: Record<string, number> | undefined,
): number {
  if (!voltageConfig || !sensors) return 0;
  const raw = sensors[voltageConfig.sensor];
  if (typeof raw !== 'number') return 0;
  const r1 = voltageConfig.r1;
  const r2 = voltageConfig.r2;
  const value = r1 > 0 && r2 > 0 ? raw * ((r1 + r2) / r2) : raw;
  return Math.round(value * 100) / 100; // 保留 2 位小数
}
```

- [ ] **Step 5: 检查 `clearDeviceLogs` 无需改动**

`clearDeviceLogs` 只做 DELETE，不需要修改。确认无误。

- [ ] **Step 6: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat: watering_logs 新增 mac_address/state_id/message/voltage 独立列"
```

---

### Task 2: push-state 路由补全 + 电压计算

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

- [ ] **Step 1: 导入 calcVoltage**

在 import 行新增：

```ts
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick, calcVoltage } from '@/app/watering/services/db';
```

- [ ] **Step 2: 在 switch 前计算电压（共用逻辑）**

在 `updateTick(chipId)` 之后、`switch (event)` 之前，加入电压计算（bootstrap 需要 config 后才能算，所以 bootstrap 内单独处理）：

```ts
    // 解析 GPIO 状态...
    // （保持不变）

    // 计算电压：bootstrap 在获取 config 后单独调用，其余事件在此统一计算
    const config = await getDeviceConfig(chipId);
    const voltage = calcVoltage(config?.voltage, gpioState.sensors);
```

> **注意：** bootstrap 分支内 `config` 可能被新建，需在 `saveDeviceConfig` 后重新计算 `voltage`。见 Step 3。

- [ ] **Step 3: 改写 bootstrap 分支**

将 bootstrap 分支中的写日志调用改为新的 `writeDeviceLog` 签名，并在获取/创建 config 后计算电压：

```ts
      case 'bootstrap': {
        let config = await getDeviceConfig(chipId);
        if (!config) {
          console.info('[Watering] bootstrap 自动创建默认配置', { chipId });
          config = {
            chipId,
            name: `IOT-${chipId}`,
            macAddress,
            processes: [],
            idleSleep: false,
            idleTimeout: 30000,
            bootExec: -1,
            execDelay: 0,
            schedules: [],
            voltage: undefined,
            createdTime: new Date().toISOString(),
            lastWriteTime: new Date().toISOString(),
          };
          await saveDeviceConfig(config);
        }

        let state = await getDeviceState(chipId);
        if (!state) {
          state = {
            chipId,
            stateId: newId(),
            switch: 'off',
            lastWriteTime: new Date().toISOString(),
          };
        }
        Object.assign(state, {
          sensors: gpioState.sensors,
          loads: gpioState.loads,
          stateId: newId(),
          lastWriteTime: new Date().toISOString(),
        });
        await saveDeviceState(state);

        const bootstrapVoltage = calcVoltage(config.voltage, gpioState.sensors);
        await writeDeviceLog(chipId, 'bootstrap', macAddress, { cause: searchParams.get('cause') || '', sensors: gpioState.sensors, loads: gpioState.loads }, bootstrapVoltage, state.stateId);
        if (state.switch === 'on' && state.process) {
          await writeDeviceLog(chipId, 'execute', macAddress, { index: state.index }, bootstrapVoltage, state.stateId);
        }
        break;
      }
```

- [ ] **Step 4: 新增 `case 'change'` 分支**

在 `case 'finish'` 之前插入：

```ts
      case 'change': {
        const stateId = searchParams.get('stateId') || '';
        const type = searchParams.get('type') || '';
        const message = searchParams.get('message') || '';
        const changeVoltage = calcVoltage(config?.voltage, gpioState.sensors);
        await writeDeviceLog(chipId, 'change', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads, type }, changeVoltage, stateId, message);
        break;
      }
```

- [ ] **Step 5: 改写 finish 分支**

```ts
      case 'finish': {
        console.info('[Watering] finish 清除执行状态', { chipId });
        const state = await getDeviceState(chipId);
        if (state && state.switch !== 'off') {
          state.switch = 'off';
          state.index = undefined;
          state.process = undefined;
          state.message = undefined;
          state.stateId = newId();
          state.lastWriteTime = new Date().toISOString();
          await saveDeviceState(state);
        }
        const finishVoltage = calcVoltage(config?.voltage, gpioState.sensors);
        await writeDeviceLog(chipId, 'finish', macAddress, undefined, finishVoltage, state?.stateId);
        break;
      }
```

- [ ] **Step 6: 改写 default 分支**

```ts
      default: {
        await writeDeviceLog(chipId, event || 'heartbeat', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads }, voltage);
        break;
      }
```

- [ ] **Step 7: 检查 TypeScript 编译**

```bash
npm run check
```

修复所有类型错误。

- [ ] **Step 8: Commit**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat: push-state 补全 change 事件分支，所有事件写入独立列"
```

---

### Task 3: 时间格式化简化 + 新增工具函数

**Files:**
- Modify: `app/watering/components/log-card.tsx`

此 Task 只改工具函数，不改组件 JSX。

- [ ] **Step 1: 替换 `formatDuration` 为简化版**

变更前：

```ts
export function formatDuration(items: LogItem[]): string {
  if (items.length < 2) return '';
  const begin = new Date(items[0]?.createdTime ?? 0).getTime();
  const end = new Date(items[items.length - 1]?.createdTime ?? 0).getTime();
  const seconds = Math.round((end - begin) / 1000);
  if (seconds > 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h)}时${String(m)}分${String(s)}秒`;
  }
  if (seconds > 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m)}分${String(s)}秒`;
  }
  return `${String(seconds)}秒`;
}
```

变更后：

```ts
/**
 * 格式化时长为中文简化形式
 *
 * 规则：<1 分钟 → 刚刚，<1 小时 → X 分钟，<1 天 → X 小时，≥1 天 → X 天
 */
export function formatDuration(items: LogItem[]): string {
  if (items.length < 2) return '';
  const begin = new Date(items[0]?.createdTime ?? 0).getTime();
  const end = new Date(items[items.length - 1]?.createdTime ?? 0).getTime();
  const seconds = Math.round((end - begin) / 1000);
  return formatSimpleDuration(seconds);
}

/**
 * 格式化秒数为中文简化形式
 *
 * 用于流程用时和休眠时长。
 * 返回 '' 表示时长不足 1 分钟（休眠场景不显示）。
 */
export function formatSimpleDuration(seconds: number): string {
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}小时`;
  const days = Math.floor(hours / 24);
  return `${String(days)}天`;
}
```

- [ ] **Step 2: 新增唤醒原因映射函数**

在 `formatSimpleDuration` 之后添加：

```ts
/** 唤醒原因中文映射 */
const causeLabels: Record<string, string> = {
  '0': '正常上电',
  '2': '外部唤醒',
  '4': '定时唤醒',
};

/** 将 cause 数字映射为中文标签，未知值返回空字符串 */
export function formatCause(cause: string | undefined): string {
  if (!cause) return '';
  return causeLabels[cause] || '';
}
```

- [ ] **Step 3: 新增变更类型映射**

在现有 `eventColors` 下方新增：

```ts
/** 变更类型中文标签和颜色 */
const changeTypeLabels: Record<string, string> = {
  step_ready: '步骤就绪',
  step_begin: '步骤开始',
  step_end: '步骤结束',
  step_timeout: '步骤超时',
  step_interrupt: '步骤中断',
};

const changeTypeColors: Record<string, string> = {
  step_ready: 'default',
  step_begin: 'primary',
  step_end: 'success',
  step_timeout: 'warning',
  step_interrupt: 'danger',
};
```

- [ ] **Step 4: 新增提取流程名工具函数**

```ts
/**
 * 从一组日志中提取流程名列表
 *
 * 遍历所有 change 事件的 message，从中提取 processName，
 * 去重后按首次出现顺序排列。
 */
export function extractProcessNames(items: LogItem[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (item.event !== 'change') continue;
    const msg = item.message;
    if (!msg) continue;
    // message 格式: "{processName:浇花}流程的{stepName:浇水}..."
    const match = msg.match(/\{processName:([^}]+)\}/);
    if (match && match[1]) {
      const name = match[1];
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}
```

- [ ] **Step 5: 新增计算步骤数工具函数**

```ts
/** 统计 change 事件数（即步骤数） */
export function countSteps(items: LogItem[]): number {
  return items.filter((i) => i.event === 'change').length;
}
```

- [ ] **Step 6: 新增休眠时长计算函数**

```ts
/**
 * 计算休眠时长（秒）
 *
 * 返回当前 bootstrap 事件与上一条日志的时间差。
 * 无法计算时返回 0。
 */
export function calcSleepDuration(currentLog: LogItem, allLogs: LogItem[]): number {
  const currentTime = new Date(currentLog.createdTime).getTime();
  // 在所有日志中找到当前日志的前一条（按时间倒序的下一条）
  let prevTime = 0;
  for (const log of allLogs) {
    const t = new Date(log.createdTime).getTime();
    if (t < currentTime && t > prevTime) {
      prevTime = t;
    }
  }
  if (prevTime === 0) return 0;
  return Math.round((currentTime - prevTime) / 1000);
}
```

- [ ] **Step 7: 更新 `LogItem` 类型**

变更前：

```ts
export type LogItem = {
  event: string;
  createdTime: string;
  state?: unknown;
  stateId?: string;
  message?: string;
  process?: { name?: string };
  cause?: string;
};
```

变更后：

```ts
export type LogItem = {
  event: string;
  createdTime: string;
  /** 剩余结构化字段：cause, type, sensors, loads, process, index */
  state?: unknown;
  macAddress?: string;
  stateId?: string;
  /** 设备生成的中文描述（change 事件） */
  message?: string;
  /** 写日志时的设备电压，未配置时为 0 */
  voltage?: number;
  process?: { name?: string };
  cause?: string;
};
```

- [ ] **Step 8: 更新 `LogGroup` 不变，无需改动**

保持：

```ts
export type LogGroup = { stateId: string; items: LogItem[] };
```

- [ ] **Step 9: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: 新增时间简化/唤醒原因/变更类型/流程名/休眠时长工具函数"
```

---

### Task 4: LogCard 组件 JSX 增强

**Files:**
- Modify: `app/watering/components/log-card.tsx`

- [ ] **Step 1: 删除不再使用的 `offline` 映射项**

从 `eventLabels` 和 `eventColors` 中删除 `offline`：

```ts
const eventLabels: Record<string, string> = {
  bootstrap: '开机',
  execute: '执行',
  finish: '完成',
  terminate: '终止',
  change: '变更',
  heartbeat: '心跳',
};

const eventColors: Record<string, string> = {
  bootstrap: 'success',
  execute: 'warning',
  finish: 'success',
  terminate: 'danger',
  change: 'primary',
  heartbeat: 'default',
};
```

- [ ] **Step 2: 更新 `getStepStatus` —— 删除 `offline` case**

从 switch 中删除 `case 'offline':`。

- [ ] **Step 3: 更新 `getGroupStatus` —— 用异常事件替代 offline**

变更前：

```ts
  const hasAbnormal = items.some((i) => i.event === 'offline' || i.event === 'terminate');
```

变更后：

```ts
  const hasAbnormal = items.some((i) => i.event === 'terminate');
```

- [ ] **Step 4: 更新 `formatMessage` —— bootstrap 和 change 增强**

变更前：

```ts
export function formatMessage(item: LogItem): string {
  if (item.message) return item.message;
  switch (item.event) {
    case 'bootstrap':
      return `设备${item.cause ? `(原因:${item.cause})` : ''}开机`;
    case 'execute':
      return `执行流程${item.process?.name ? `: ${item.process.name}` : ''}`;
    case 'terminate':
      return '终止流程';
    case 'finish':
      return '完成流程';
    case 'offline':
      return '设备离线';
    default:
      return item.event;
  }
}
```

变更后：

```ts
export function formatMessage(item: LogItem): string {
  if (item.message) return item.message;
  switch (item.event) {
    case 'bootstrap':
      return item.cause ? `设备(${item.cause})开机` : '设备开机';
    case 'execute':
      return `执行流程${item.process?.name ? `: ${item.process.name}` : ''}`;
    case 'terminate':
      return '终止流程';
    case 'finish':
      return '完成流程';
    case 'change':
      return '流程状态变更';
    case 'heartbeat':
      return '心跳';
    default:
      return item.event;
  }
}
```

> **说明：** `offline` case 删除（实际不会产生离线日志）。bootstrap 保留 `item.cause` 回退，但实际应优先在步骤描述区域展示增强内容。

- [ ] **Step 5: 新增 bootstrap 步骤描述渲染函数**

在 `formatMessage` 之后添加：

```ts
/**
 * 渲染 bootstrap 步骤的增强描述
 *
 * 格式：{唤醒原因} · 休眠 {X小时} · {电压}V
 * 唤醒原因未知时不显示，休眠 < 1 分钟时不显示，电压为 0 时不显示。
 */
function renderBootstrapDescription(
  item: LogItem,
  allLogs: LogItem[],
): string {
  const parts: string[] = [];
  // 唤醒原因：从 state.cause 读取
  const stateObj = item.state as Record<string, unknown> | undefined;
  const causeLabel = formatCause(String(stateObj?.cause ?? ''));
  if (causeLabel) parts.push(causeLabel);
  // 休眠时长
  const sleepSec = calcSleepDuration(item, allLogs);
  if (sleepSec >= 60) {
    parts.push(`休眠 ${formatSimpleDuration(sleepSec)}`);
  }
  // 电压
  if (item.voltage && item.voltage > 0) {
    parts.push(`${String(item.voltage)}V`);
  }
  return parts.join(' · ');
}
```

- [ ] **Step 6: 新增摘要行渲染逻辑**

在 `LogCard` 组件函数内、`return` 之前：

```tsx
  // 摘要行数据
  const processNames = extractProcessNames(group.items);
  const stepCount = countSteps(group.items);
  const summaryVoltage = group.items.find((i) => i.voltage && i.voltage > 0)?.voltage;

  const summaryParts: string[] = [];
  if (processNames.length > 0) {
    summaryParts.push(processNames.join('、'));
  }
  if (stepCount > 0) {
    summaryParts.push(`共 ${String(stepCount)} 个步骤`);
  }
  if (duration) {
    summaryParts.push(duration);
  }
  if (summaryVoltage && summaryVoltage > 0) {
    summaryParts.push(`${String(summaryVoltage)}V`);
  }
  const summaryText = summaryParts.join(' · ');
```

- [ ] **Step 7: 更新 Card 标题**

变更前：

```tsx
      title={`State ID: ${group.stateId}`}
```

变更后：

```tsx
      title={`第 ${group.stateId} 批次运行`}
```

- [ ] **Step 8: 在 Card children 顶部插入摘要行**

在 `<Steps>` 之前插入：

```tsx
      {summaryText && (
        <div className="mb-2 text-xs text-gray-400">
          {summaryText}
        </div>
      )}
```

- [ ] **Step 9: 更新 bootstrap 步骤的 description**

将 Steps.Step 的 description 渲染逻辑改为条件分支：

变更前：

```tsx
            description={
              <span className="text-[13px] text-gray-700">
                {formatMessage(item)}
              </span>
            }
```

变更后：

```tsx
            description={
              <span className="text-[13px] text-gray-700">
                {item.event === 'bootstrap'
                  ? renderBootstrapDescription(item, group.items)
                  : formatMessage(item)}
              </span>
            }
```

- [ ] **Step 10: 新增 change 步骤的子标签**

在 change 步骤的 title 区域（`<Space>` 内）额外展示变更类型子标签。

在 title 的 `<Space>` 末尾、时间之前插入：

```tsx
                {item.event === 'change' && (() => {
                  const stateObj = item.state as Record<string, unknown> | undefined;
                  const changeType = String(stateObj?.type ?? '');
                  if (changeType && changeTypeLabels[changeType]) {
                    return (
                      <Tag color={changeTypeColors[changeType] || 'default'}>
                        {changeTypeLabels[changeType]}
                      </Tag>
                    );
                  }
                  return null;
                })()}
```

- [ ] **Step 11: 更新 getGroupStatus —— 无异常事件时统一显示「已完成」**

保持不变（当前逻辑已正确：有 finish 且无 terminate → 已完成，否则 → 异常）。

- [ ] **Step 12: 删除不再使用的 `hasExecute` 和 `formatDuration` 旧引用**

确认 `hasExecute` 仍用于判断是否显示用时，保留。`formatDuration` 已更新为简化版，无需额外修改。

- [ ] **Step 13: Commit**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: LogCard 增强 — 中文标题/摘要行/唤醒原因/变更类型/电压"
```

---

### Task 5: 更新测试

**Files:**
- Modify: `__tests__/watering/log-card-utils.test.ts`

- [ ] **Step 1: 更新 import —— 新增导出的函数**

```ts
import {
  groupByStateId,
  formatDuration,
  formatSimpleDuration,
  formatMessage,
  formatCause,
  extractProcessNames,
  countSteps,
  calcSleepDuration,
} from '@/app/watering/components/log-card';
import type { LogItem } from '@/app/watering/components/log-card';
```

- [ ] **Step 2: 更新 `makeLog` 工厂函数**

```ts
function makeLog(overrides: Partial<LogItem> = {}): LogItem {
  return {
    event: 'execute',
    createdTime: '2026-06-13T10:00:00.000Z',
    stateId: 'state_001',
    voltage: 3.7,
    ...overrides,
  };
}
```

- [ ] **Step 3: 替换 `formatDuration` 测试块**

删除旧的 formatDuration 测试（全部 5 个 test case），替换为：

```ts
// ================================================================
// formatDuration & formatSimpleDuration
// ================================================================

describe('formatDuration', () => {
  it('少于 2 条返回空字符串', () => {
    expect(formatDuration([])).toBe('');
    expect(formatDuration([makeLog()])).toBe('');
  });

  it('小于 60 秒返回"刚刚"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:00:45.000Z' }),
    ];
    expect(formatDuration(items)).toBe('刚刚');
  });

  it('60 秒 ~ 1 小时返回"X分钟"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:03:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('3分钟');
  });

  it('1 小时 ~ 1 天返回"X小时"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T15:30:00.000Z' }),
    ];
    // 5.5 小时 → 5小时（向下取整）
    expect(formatDuration(items)).toBe('5小时');
  });

  it('≥1 天返回"X天"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-15T10:00:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('2天');
  });
});
```

- [ ] **Step 4: 更新 `formatMessage` 测试块**

删除 `offline` 相关 test case 和 `change` 的旧 test，更新 bootstrap test：

```ts
describe('formatMessage', () => {
  it('有 message 字段时优先返回 message', () => {
    const item = makeLog({ message: '自定义消息内容' });
    expect(formatMessage(item)).toBe('自定义消息内容');
  });

  it('bootstrap 事件无 cause', () => {
    const item = makeLog({ event: 'bootstrap' });
    expect(formatMessage(item)).toBe('设备开机');
  });

  it('bootstrap 事件带 cause', () => {
    const item = makeLog({ event: 'bootstrap', cause: '定时重启' });
    expect(formatMessage(item)).toBe('设备(定时重启)开机');
  });

  it('execute 事件带 process.name', () => {
    const item = makeLog({ event: 'execute', process: { name: '浇花流程A' } });
    expect(formatMessage(item)).toBe('执行流程: 浇花流程A');
  });

  it('execute 事件无 process', () => {
    const item = makeLog({ event: 'execute' });
    expect(formatMessage(item)).toBe('执行流程');
  });

  it('terminate 事件', () => {
    const item = makeLog({ event: 'terminate' });
    expect(formatMessage(item)).toBe('终止流程');
  });

  it('finish 事件', () => {
    const item = makeLog({ event: 'finish' });
    expect(formatMessage(item)).toBe('完成流程');
  });

  it('change 事件（无 message）', () => {
    const item = makeLog({ event: 'change' });
    expect(formatMessage(item)).toBe('流程状态变更');
  });

  it('heartbeat 事件', () => {
    const item = makeLog({ event: 'heartbeat' });
    expect(formatMessage(item)).toBe('心跳');
  });

  it('未知事件返回原文', () => {
    const item = makeLog({ event: 'custom_event' });
    expect(formatMessage(item)).toBe('custom_event');
  });
});
```

- [ ] **Step 5: 新增 `formatCause` 测试**

```ts
// ================================================================
// formatCause
// ================================================================

describe('formatCause', () => {
  it('"0" 映射为正常上电', () => {
    expect(formatCause('0')).toBe('正常上电');
  });

  it('"2" 映射为外部唤醒', () => {
    expect(formatCause('2')).toBe('外部唤醒');
  });

  it('"4" 映射为定时唤醒', () => {
    expect(formatCause('4')).toBe('定时唤醒');
  });

  it('未知值返回空字符串', () => {
    expect(formatCause('99')).toBe('');
  });

  it('undefined 返回空字符串', () => {
    expect(formatCause(undefined)).toBe('');
  });
});
```

- [ ] **Step 6: 新增 `extractProcessNames` 测试**

```ts
// ================================================================
// extractProcessNames
// ================================================================

describe('extractProcessNames', () => {
  it('空数组返回空列表', () => {
    expect(extractProcessNames([])).toEqual([]);
  });

  it('从 change 事件 message 提取流程名', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}{stepId:0}环节开始执行。负载{componentKey:load_0}{value:200}已打开。' }),
    ];
    expect(extractProcessNames(items)).toEqual(['浇花']);
  });

  it('多个同名流程去重', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节开始执行。' }),
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节结束。' }),
    ];
    expect(extractProcessNames(items)).toEqual(['浇花']);
  });

  it('多个不同流程按首次出现顺序排列', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节开始执行。' }),
      makeLog({ event: 'change', message: '{processName:施肥}流程的{stepName:施肥}环节开始执行。' }),
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节结束。' }),
    ];
    expect(extractProcessNames(items)).toEqual(['浇花', '施肥']);
  });

  it('无 message 的 change 事件被跳过', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: undefined }),
    ];
    expect(extractProcessNames(items)).toEqual([]);
  });

  it('非 change 事件被忽略', () => {
    const items: LogItem[] = [
      makeLog({ event: 'bootstrap', message: '{processName:浇花}...' }),
    ];
    expect(extractProcessNames(items)).toEqual([]);
  });
});
```

- [ ] **Step 7: 新增 `countSteps` 测试**

```ts
// ================================================================
// countSteps
// ================================================================

describe('countSteps', () => {
  it('空数组返回 0', () => {
    expect(countSteps([])).toBe(0);
  });

  it('统计 change 事件数', () => {
    const items: LogItem[] = [
      makeLog({ event: 'bootstrap' }),
      makeLog({ event: 'change' }),
      makeLog({ event: 'change' }),
      makeLog({ event: 'finish' }),
    ];
    expect(countSteps(items)).toBe(2);
  });

  it('无 change 事件返回 0', () => {
    const items: LogItem[] = [
      makeLog({ event: 'bootstrap' }),
      makeLog({ event: 'finish' }),
    ];
    expect(countSteps(items)).toBe(0);
  });
});
```

- [ ] **Step 8: 新增 `calcSleepDuration` 测试**

```ts
// ================================================================
// calcSleepDuration
// ================================================================

describe('calcSleepDuration', () => {
  it('首条日志返回 0', () => {
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    expect(calcSleepDuration(current, [current])).toBe(0);
  });

  it('计算与前一条日志的时间差', () => {
    const prev = makeLog({ createdTime: '2026-06-13T08:00:00.000Z' });
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    const allLogs = [current, prev];
    expect(calcSleepDuration(current, allLogs)).toBe(7200); // 2 小时 = 7200 秒
  });

  it('多条日志只取时间最近的前一条', () => {
    const oldest = makeLog({ createdTime: '2026-06-13T06:00:00.000Z' });
    const prev = makeLog({ createdTime: '2026-06-13T08:00:00.000Z' });
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    const allLogs = [current, prev, oldest];
    expect(calcSleepDuration(current, allLogs)).toBe(7200);
  });

  it('后于当前时间的日志被忽略', () => {
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    const future = makeLog({ createdTime: '2026-06-13T12:00:00.000Z' });
    const allLogs = [future, current];
    expect(calcSleepDuration(current, allLogs)).toBe(0);
  });
});
```

- [ ] **Step 9: 运行测试验证**

```bash
npm run test
```

预期：全部通过。

- [ ] **Step 10: Commit**

```bash
git add __tests__/watering/log-card-utils.test.ts
git commit -m "test: 更新工具函数测试 — 简化时间/唤醒原因/流程名/休眠时长"
```

---

### Task 6: 格式化、类型检查与最终验证

- [ ] **Step 1: 格式化**

```bash
npm run format
```

- [ ] **Step 2: 类型检查 + Lint**

```bash
npm run check
```

修复所有错误。预期 0 错误。

- [ ] **Step 3: 运行全量测试**

```bash
npm run test
```

预期全部通过。

- [ ] **Step 4: 启动开发服务器验证**

```bash
npm run dev
```

访问 `http://localhost:3000/watering` → 点击设备日志按钮，验证：
- 卡片标题显示「第 xxx 批次运行」
- 摘要行显示流程名 · 步骤数 · 用时 · 电压
- 开机步骤显示唤醒原因 · 休眠时长 · 电压
- 变更步骤显示中文消息 + 变更类型子标签

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 格式化与类型检查通过"
```

---

### 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/watering/services/db.ts` | 修改 | 新增列 + writeDeviceLog 签名 + getDeviceLogs 返回 + calcVoltage |
| `app/watering/api/push-state/route.ts` | 修改 | 新增 change 分支 + 电压计算 + 所有分支传入独立列参数 |
| `app/watering/components/log-card.tsx` | 修改 | 类型更新 + 工具函数新增 + JSX 增强 |
| `__tests__/watering/log-card-utils.test.ts` | 修改 | 更新旧测试 + 新增工具函数测试 |
