# 设备卡片最后执行信息 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在浇花模块首页设备卡片底部显示最后一次进程执行完成的信息（如 "3小时前 · 浇水 · 用1小时"），超过 3 天或无记录时不显示。

**Architecture:** 在 `watering_device_state` 表新增 4 列持久化最后执行信息，进程启动时写 `last_action_started_at`，finish 时写 `last_action_name/duration/finished_at`；时间格式化函数从 log-card.tsx 抽取到 `utils/format-time.ts`；DeviceCard 新增一行渲染。

**Tech Stack:** TypeScript, SQLite (WASM), React Server Actions

## Global Constraints

- 无历史 finish → 不显示
- 距今超过 3 天（259200 秒）→ 不显示
- `last_action_started_at` 持久保留不删除
- `lib/utils.ts` 不修改（`formatDate` 与本次需求无关）
- 已有测试保持通过

---

### Task 1: 抽取时间工具函数到 `utils/format-time.ts`

**Files:**
- Create: `app/watering/utils/format-time.ts`
- Modify: `app/watering/components/log-card.tsx`

**Interfaces:**
- Produces: `formatSimpleDuration(seconds: number): string`, `formatRelativeTime(msAgo: number): string`, `formatActionDuration(ms: number): string`

- [ ] **Step 1: 创建 `app/watering/utils/format-time.ts`**

```typescript
/**
 * 时间格式化工具
 *
 * 提供相对时间、时长等中文格式化函数，供日志卡片和设备卡片共用。
 * formatSimpleDuration 从 log-card.tsx 抽取至此。
 */

/**
 * 格式化秒数为中文简化形式
 *
 * 规则：<1 分钟 → 刚刚，<1 小时 → X分钟，<1 天 → X小时，≥1 天 → X天。
 * 用于流程用时和休眠时长。
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

/**
 * 格式化距今毫秒为相对时间
 *
 * 规则：<60 秒 → 刚刚，<60 分钟 → X分钟前，
 * <24 小时 → X小时前，≥1 天 → X天前。
 */
export function formatRelativeTime(msAgo: number): string {
  const seconds = Math.floor(msAgo / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}小时前`;
  const days = Math.floor(hours / 24);
  return `${String(days)}天前`;
}

/**
 * 格式化毫秒耗时为动作耗时文本
 *
 * 规则：<1 秒 → ""，否则 → "用" + formatSimpleDuration。
 * 传入 0 或负数返回空字符串。
 */
export function formatActionDuration(ms: number): string {
  if (ms <= 0) return '';
  const seconds = Math.floor(ms / 1000);
  const d = formatSimpleDuration(seconds);
  return `用${d}`;
}
```

- [ ] **Step 2: 更新 `log-card.tsx` — 从新文件导入并在原位置重导出**

找到 log-card.tsx 中的 `formatSimpleDuration` 函数定义（约第 259-267 行），替换为从新文件导入并重导出：

```typescript
// 在 log-card.tsx 顶部 import 区域新增：
import { formatSimpleDuration } from '../utils/format-time';

// 删除原有的 formatSimpleDuration 函数定义（约第 254-267 行），
// 替换为重导出：
export { formatSimpleDuration } from '../utils/format-time';
```

`formatDuration` 函数（第 245-252 行）保持不变，它内部调用 `formatSimpleDuration`，现在会自动使用导入的版本。

- [ ] **Step 3: 运行现有测试确认无回归**

```bash
npx vitest run __tests__/watering/log-card-utils.test.ts
```

Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add app/watering/utils/format-time.ts app/watering/components/log-card.tsx
git commit -m "refactor: 抽取 formatSimpleDuration 到 utils/format-time.ts，新增 formatRelativeTime 和 formatActionDuration"
```

---

### Task 2: 扩展数据库表结构

**Files:**
- Modify: `app/watering/services/db.ts`

**Interfaces:**
- Consumes: (无)
- Produces: `initDb()` 新增 4 列，`saveDeviceState()` 支持新字段，`getAllDevices()` 返回新字段映射到 `DeviceItem.lastFinish`

- [ ] **Step 1: 在 `initDb()` 中添加 4 列**

在 `initDb()` 函数末尾（`idx_sensor_log_unique` 索引之后、函数结束 `}` 之前）添加：

```typescript
  // 新增列——使用 PRAGMA table_info 检查避免重复添加（SQLite 不支持 ADD COLUMN IF NOT EXISTS）
  const addColumn = (table: string, column: string, definition: string) => {
    const rows = db.all(`PRAGMA table_info(${table})`) as unknown as { name: string }[];
    if (!rows.some((r) => r.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  addColumn('watering_device_state', 'last_action_name', 'TEXT');
  addColumn('watering_device_state', 'last_action_duration', 'INTEGER');
  addColumn('watering_device_state', 'last_action_started_at', 'INTEGER');
  addColumn('watering_device_state', 'last_action_finished_at', 'INTEGER');
```

- [ ] **Step 2: 更新 `StateRow` 接口**

在 `StateRow` 接口（约第 29-44 行）末尾添加：

```typescript
  last_action_name: string | null;
  last_action_duration: number | null;
  last_action_started_at: number | null;
  last_action_finished_at: number | null;
```

- [ ] **Step 3: 更新 `JoinRow` 接口**

在 `JoinRow` 接口（约第 47-64 行）末尾添加：

```typescript
  last_action_name: string | null;
  last_action_duration: number | null;
  last_action_started_at: number | null;
  last_action_finished_at: number | null;
```

- [ ] **Step 4: 更新 `saveDeviceState()` — upsert 包含新字段**

将 `saveDeviceState()` 的 INSERT 列列表和 VALUES 占位符更新：

```typescript
// INSERT 列列表追加 4 列：
INSERT INTO watering_device_state (..., last_action_name, last_action_duration, last_action_started_at, last_action_finished_at)
VALUES (..., @last_action_name, @last_action_duration, @last_action_started_at, @last_action_finished_at)

// ON CONFLICT DO UPDATE SET 追加：
last_action_name=@last_action_name, last_action_duration=@last_action_duration,
last_action_started_at=@last_action_started_at, last_action_finished_at=@last_action_finished_at
```

参数对象追加：

```typescript
'@last_action_name': state.lastActionName ?? null,
'@last_action_duration': state.lastActionDuration ?? null,
'@last_action_started_at': state.lastActionStartedAt ?? null,
'@last_action_finished_at': state.lastActionFinishedAt ?? null,
```

- [ ] **Step 5: 更新 `getAllDevices()` — JOIN 查询和映射**

在 SELECT 列表中追加 4 列别名：

```sql
s.last_action_name, s.last_action_duration, s.last_action_started_at, s.last_action_finished_at
```

在 `state_id` 判断块内（`item.state = {...}` 之后），追加 `lastFinish` 映射：

```typescript
      // 最后执行信息（仅在有完成的进程时构造）
      if (row.last_action_name && row.last_action_finished_at != null) {
        item.lastFinish = {
          actionName: row.last_action_name,
          duration: row.last_action_duration ?? 0,
          finishedAt: row.last_action_finished_at,
        };
      }
```

- [ ] **Step 6: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat: watering_device_state 新增 4 列持久化最后执行信息"
```

---

### Task 3: 扩展类型定义

**Files:**
- Modify: `app/watering/types.ts`

**Interfaces:**
- Consumes: DB 层返回的字段名
- Produces: `DeviceState.lastActionName/Duration/StartedAt/FinishedAt`, `DeviceItem.lastFinish`

- [ ] **Step 1: `DeviceState` 添加 4 个可选字段**

在 `DeviceState` 类型（约第 136-165 行）的 `stepIndex` 之后、`lastWriteTime` 之前添加：

```typescript
  /** 最后完成的进程名 */
  lastActionName?: string;
  /** 最后完成的进程耗时（毫秒） */
  lastActionDuration?: number;
  /** 最后进程开始时间戳（毫秒），持久保留 */
  lastActionStartedAt?: number;
  /** 最后进程完成时间戳（毫秒） */
  lastActionFinishedAt?: number;
```

- [ ] **Step 2: `DeviceItem` 添加 `lastFinish` 可选字段**

在 `DeviceItem` 类型（约第 168-174 行）的 `isOnline` 之后添加：

```typescript
  /** 最后一次完成的进程执行信息 */
  lastFinish?: {
    /** 进程名 */
    actionName: string;
    /** 进程耗时（毫秒） */
    duration: number;
    /** 完成时间戳（毫秒） */
    finishedAt: number;
  };
```

- [ ] **Step 3: Commit**

```bash
git add app/watering/types.ts
git commit -m "feat: DeviceState 和 DeviceItem 新增最后执行信息字段"
```

---

### Task 4: 进程启动时写入 `last_action_started_at`

**Files:**
- Modify: `app/watering/api/push-state/route.ts`
- Modify: `app/watering/actions/set-state.ts`
- Modify: `app/watering/api/get-state/route.ts`

需要覆盖 4 个进程启动路径，每个都写入 `last_action_started_at = Date.now()`。

- [ ] **Step 1: `push-state/route.ts` — `bootstrap` 触发 bootExec 时**

在 `bootstrap` case（约第 82-107 行），`state.process = JSON.parse(...)` 之后、`state.stateId = newId()` 之前添加：

```typescript
        state.lastActionStartedAt = Date.now();
```

- [ ] **Step 2: `push-state/route.ts` — `execute` 事件**

在 `execute` case（约第 166-193 行），`state.process = JSON.parse(...)` 之后、`state.lastWriteTime = ...` 之前添加：

```typescript
        state.lastActionStartedAt = Date.now();
```

- [ ] **Step 3: `set-state.ts` — Server Action 启动进程**

在 `switchState === 'on'` 分支（约第 47-62 行），`state.process = filterProcess(process)` 之后、`state.stepIndex = ...` 之前添加：

```typescript
      state.lastActionStartedAt = Date.now();
```

- [ ] **Step 4: `get-state/route.ts` — schedule 触发进程**

在 `checkAndExecuteSchedule` 函数（约第 277-306 行），`state.process = filterProcess(...)` 之后、`await insertScheduleLog(...)` 之前添加：

```typescript
      state.lastActionStartedAt = Date.now();
```

- [ ] **Step 5: Commit**

```bash
git add app/watering/api/push-state/route.ts app/watering/actions/set-state.ts app/watering/api/get-state/route.ts
git commit -m "feat: 进程启动时写入 last_action_started_at"
```

---

### Task 5: finish 时写入最后执行信息

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

- [ ] **Step 1: `finish` case 中写入 3 个字段**

在 `push-state/route.ts` 的 `finish` case（约第 146-164 行），**获取到 `state` 之后、清除执行上下文之前**，写入：

找到：
```typescript
      const state = await getDeviceState(chipId);
      if (state && state.switch !== 'off') {
```

在 `if` 块内、`state.switch = 'off'` **之前**添加：

```typescript
        // 持久化最后执行信息：进程名、耗时、完成时间
        state.lastActionName = state.process?.name;
        state.lastActionDuration = state.lastActionStartedAt != null
          ? Date.now() - state.lastActionStartedAt
          : 0;
        state.lastActionFinishedAt = Date.now();
```

注意：`lastActionStartedAt` 不在此清除。

- [ ] **Step 2: Commit**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat: finish 事件写入 last_action_name/duration/finished_at"
```

---

### Task 6: 设备卡片渲染最后执行信息

**Files:**
- Modify: `app/watering/components/device-card.tsx`

- [ ] **Step 1: 添加 import**

在现有 import 区域添加：

```typescript
import { formatRelativeTime, formatActionDuration } from '../utils/format-time';
```

- [ ] **Step 2: 在卡片底部添加渲染逻辑**

在流程按钮区域（`{processes.length > 0 && (...)}` 的 `</div>` 闭合标签）之后、步骤进度（`{device.state?.switch === 'on' && ...}`）之前，添加：

```typescript
        {/* 最后执行信息 — 仅在有记录且不超过 3 天时显示 */}
        {device.lastFinish &&
          Date.now() - device.lastFinish.finishedAt < 3 * 24 * 60 * 60 * 1000 && (
            <div className="mt-2 text-xs text-gray-400">
              {formatRelativeTime(Date.now() - device.lastFinish.finishedAt)}
              {' · '}
              {device.lastFinish.actionName}
              {' · '}
              {formatActionDuration(device.lastFinish.duration)}
            </div>
          )}
```

- [ ] **Step 3: Commit**

```bash
git add app/watering/components/device-card.tsx
git commit -m "feat: 设备卡片显示最后执行信息"
```

---

### Task 7: 格式化、类型检查与测试

- [ ] **Step 1: 格式化**

```bash
npm run format
```

- [ ] **Step 2: 类型检查**

```bash
npm run check
```

修复所有类型错误。

- [ ] **Step 3: 运行全部测试**

```bash
npm run test
```

确认全部通过。

- [ ] **Step 4: Commit（如有 format/check 修复）**

```bash
git add -A
git commit -m "chore: format & check 修复"
```
