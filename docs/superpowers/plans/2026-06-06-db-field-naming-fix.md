# 数据库字段命名规范修复 & JSON 类型迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `watering_devices`、`watering_device_state`、`watering_logs` 三张表的字段从 camelCase 改为 snake_case，并将存储 JSON 数据的 TEXT 字段改为 JSON 类型。

**Architecture:** 数据库列名使用 snake_case（SQL 惯例），TypeScript 类型保持 camelCase，在 db.ts 的读取/写入层做映射。同时将所有存储 JSON 数据的列从 `TEXT` 迁移为 `JSON`，SQLite 的 JSON 类型会对插入值做格式验证，并启用 `json_extract()` 等内置 JSON 函数。由于项目使用 better-sqlite3 + 本地文件数据库，迁移策略为：在 `initDb()` 中重建表结构（`DROP` + `CREATE`），项目中数据可丢失（开发阶段）。

**Tech Stack:** better-sqlite3, SQLite JSON type, TypeScript

---

## 字段映射表

### watering_devices

| 旧字段 (camelCase/TEXT) | 新字段 (snake_case/JSON) | 说明 |
|---|---|---|
| chipId | chip_id | 主键 |
| name | name | 无变化 |
| macAddress | mac_address | |
| processes TEXT | processes JSON | 存储 Process[] |
| idleSleep | idle_sleep | |
| idleTimeout | idle_timeout | |
| bootExec | boot_exec | |
| execDelay | exec_delay | |
| schedules TEXT | schedules JSON | 存储 Schedule[] |
| createdTime | created_time | |
| lastWriteTime | last_write_time | |

### watering_device_state

| 旧字段 (camelCase/TEXT) | 新字段 (snake_case/JSON) | 说明 |
|---|---|---|
| chipId | chip_id | 主键 + 外键 |
| stateId | state_id | |
| switch | switch | 保留（SQL 关键字但 SQLite 允许） |
| buttons TEXT | buttons JSON | 存储 Record<string, number> |
| sensors TEXT | sensors JSON | 存储 Record<string, number> |
| loads TEXT | loads JSON | 存储 Record<string, number> |
| currentIndex | current_index | |
| currentProcess TEXT | current_process JSON | 存储 Process 对象 |
| message | message | 无变化 |
| lastTickTime | last_tick_time | |
| lastWriteTime | last_write_time | |

### watering_logs

| 旧字段 (camelCase/TEXT) | 新字段 (snake_case/JSON) | 说明 |
|---|---|---|
| id | id | 无变化 |
| chipId | chip_id | |
| event | event | 无变化 |
| state TEXT | state JSON | 存储 Record<string, unknown> |
| createdTime | created_time | |

### 索引

| 旧名 | 新名 |
|---|---|
| idx_watering_logs_chipId | idx_watering_logs_chip_id |

---

## File Structure

| File | Responsibility |
|---|---|
| `app/watering/services/db.ts` | 表结构定义、SQL 映射层（snake_case ↔ camelCase）、所有 CRUD 函数 |
| `app/watering/types.ts` | TypeScript 类型定义（保持 camelCase 不变） |
| `app/watering/components/log-viewer.tsx` | 日志查看器（读取 `log.state` 字段） |
| `app/watering/hooks/use-device-logs.ts` | 日志 hook（透传，无映射逻辑） |
| `app/watering/actions/get-logs.ts` | Server action 透传 |
| `app/watering/actions/clear-logs.ts` | Server action 透传 |

---

### Task 1: 更新 initDb() 表结构 — snake_case 列名 + JSON 类型

**Files:**
- Modify: `app/watering/services/db.ts:10-57`

- [ ] **Step 1: 重写 initDb() 中的三张表和索引定义**

将 `app/watering/services/db.ts` 中 `initDb()` 函数体内（第10-57行）替换为：

```typescript
export function initDb() {
  const db = getDb();

  db.exec(`
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
      created_time TEXT NOT NULL,
      last_write_time TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_device_state (
      chip_id TEXT PRIMARY KEY,
      state_id TEXT NOT NULL,
      switch TEXT NOT NULL DEFAULT 'off',
      buttons JSON,
      sensors JSON,
      loads JSON,
      current_index INTEGER,
      current_process JSON,
      message TEXT,
      last_tick_time INTEGER DEFAULT 0,
      last_write_time TEXT NOT NULL,
      FOREIGN KEY (chip_id) REFERENCES watering_devices(chip_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chip_id TEXT NOT NULL,
      event TEXT NOT NULL,
      state JSON,
      created_time TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watering_logs_chip_id
    ON watering_logs(chip_id, created_time DESC)
  `);
}
```

- [ ] **Step 2: 验证语法正确**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无与 db.ts 相关的类型错误（可能有其他文件暂不通过，本次只关注 db.ts）

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update table schemas to snake_case columns and JSON types"
```

---

### Task 2: 重写 getAllDevices() — 添加列名映射

**Files:**
- Modify: `app/watering/services/db.ts:62-111`

- [ ] **Step 1: 替换 getAllDevices() 函数**

将 `getAllDevices()` 函数（第62-111行）替换为：

```typescript
export function getAllDevices(): DeviceItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.chip_id, d.name, d.mac_address, d.processes, d.idle_sleep, d.idle_timeout,
           d.boot_exec, d.exec_delay, d.schedules, d.created_time, d.last_write_time,
           s.state_id, s.switch, s.buttons, s.sensors, s.loads,
           s.current_index, s.current_process, s.message,
           s.last_tick_time as state_last_tick_time, s.last_write_time as state_last_write_time
    FROM watering_devices d
    LEFT JOIN watering_device_state s ON d.chip_id = s.chip_id
    ORDER BY d.name
  `).all() as any[];

  const now = Date.now();
  return rows.map((row) => {
    const config: DeviceConfig = {
      chipId: row.chip_id,
      name: row.name,
      macAddress: row.mac_address,
      processes: row.processes ?? [],
      idleSleep: !!row.idle_sleep,
      idleTimeout: row.idle_timeout,
      bootExec: row.boot_exec,
      execDelay: row.exec_delay,
      schedules: row.schedules ?? [],
      createdTime: row.created_time,
      lastWriteTime: row.last_write_time,
    };

    const item: DeviceItem = { ...config };

    if (row.state_id) {
      item.state = {
        chipId: row.chip_id,
        stateId: row.state_id,
        switch: row.switch,
        buttons: row.buttons ?? undefined,
        sensors: row.sensors ?? undefined,
        loads: row.loads ?? undefined,
        index: row.current_index ?? undefined,
        process: row.current_process ?? undefined,
        message: row.message ?? undefined,
        lastWriteTime: row.state_last_write_time,
      };
      item.lastTickTime = row.state_last_tick_time;
      // 60 秒内心跳视为在线
      item.isOnline = row.state_last_tick_time && (now - row.state_last_tick_time) <= 60 * 1000;
    }

    return item;
  });
}
```

> **说明：** SQLite 的 JSON 类型字段在 `better-sqlite3` 中读取时自动返回已解析的 JavaScript 对象（不再需要 `JSON.parse`）。同时，JSON 字段如果为 `null`，`??` 运算符会返回右侧默认值。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无与 db.ts 相关的错误

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update getAllDevices with snake_case column mapping"
```

---

### Task 3: 重写 getDeviceConfig() — 添加列名映射

**Files:**
- Modify: `app/watering/services/db.ts:116-133`

- [ ] **Step 1: 替换 getDeviceConfig() 函数**

将 `getDeviceConfig()` 函数（第116-133行）替换为：

```typescript
export function getDeviceConfig(chipId: string): DeviceConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_devices WHERE chip_id = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    name: row.name,
    macAddress: row.mac_address,
    processes: row.processes ?? [],
    idleSleep: !!row.idle_sleep,
    idleTimeout: row.idle_timeout,
    bootExec: row.boot_exec,
    execDelay: row.exec_delay,
    schedules: row.schedules ?? [],
    createdTime: row.created_time,
    lastWriteTime: row.last_write_time,
  };
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update getDeviceConfig with snake_case column mapping"
```

---

### Task 4: 重写 saveDeviceConfig() — 添加列名映射

**Files:**
- Modify: `app/watering/services/db.ts:138-153`

- [ ] **Step 1: 替换 saveDeviceConfig() 函数**

将 `saveDeviceConfig()` 函数（第138-153行）替换为：

```typescript
export function saveDeviceConfig(config: DeviceConfig) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_devices (chip_id, name, mac_address, processes, idle_sleep, idle_timeout, boot_exec, exec_delay, schedules, created_time, last_write_time)
    VALUES (@chip_id, @name, @mac_address, @processes, @idle_sleep, @idle_timeout, @boot_exec, @exec_delay, @schedules, @created_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      name=@name, mac_address=@mac_address, processes=@processes, idle_sleep=@idle_sleep,
      idle_timeout=@idle_timeout, boot_exec=@boot_exec, exec_delay=@exec_delay,
      schedules=@schedules, last_write_time=@last_write_time
  `).run({
    chip_id: config.chipId,
    name: config.name,
    mac_address: config.macAddress,
    processes: config.processes,
    idle_sleep: config.idleSleep ? 1 : 0,
    idle_timeout: config.idleTimeout,
    boot_exec: config.bootExec,
    exec_delay: config.execDelay,
    schedules: config.schedules,
    created_time: config.createdTime,
    last_write_time: config.lastWriteTime,
  });
}
```

> **说明：** SQLite 的 JSON 类型列直接接受 JavaScript 对象，`better-sqlite3` 会自动序列化为 JSON 字符串存储。无需再手动 `JSON.stringify`。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update saveDeviceConfig with snake_case mapping, remove manual JSON.stringify"
```

---

### Task 5: 重写 deleteDevice() — 更新列名

**Files:**
- Modify: `app/watering/services/db.ts:158-162`

- [ ] **Step 1: 替换 deleteDevice() 函数**

将 `deleteDevice()` 函数（第158-162行）替换为：

```typescript
export function deleteDevice(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_device_state WHERE chip_id = ?").run(chipId);
  db.prepare("DELETE FROM watering_devices WHERE chip_id = ?").run(chipId);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update deleteDevice SQL to snake_case column names"
```

---

### Task 6: 重写 getDeviceState() — 添加列名映射

**Files:**
- Modify: `app/watering/services/db.ts:167-183`

- [ ] **Step 1: 替换 getDeviceState() 函数**

将 `getDeviceState()` 函数（第167-183行）替换为：

```typescript
export function getDeviceState(chipId: string): DeviceState | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_device_state WHERE chip_id = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    stateId: row.state_id,
    switch: row.switch,
    buttons: row.buttons ?? undefined,
    sensors: row.sensors ?? undefined,
    loads: row.loads ?? undefined,
    index: row.current_index ?? undefined,
    process: row.current_process ?? undefined,
    message: row.message ?? undefined,
    lastWriteTime: row.last_write_time,
  };
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update getDeviceState with snake_case column mapping"
```

---

### Task 7: 重写 saveDeviceState() — 添加列名映射

**Files:**
- Modify: `app/watering/services/db.ts:188-210`

- [ ] **Step 1: 替换 saveDeviceState() 函数**

将 `saveDeviceState()` 函数（第188-210行）替换为：

```typescript
export function saveDeviceState(state: DeviceState) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_device_state (chip_id, state_id, switch, buttons, sensors, loads, current_index, current_process, message, last_tick_time, last_write_time)
    VALUES (@chip_id, @state_id, @switch, @buttons, @sensors, @loads, @current_index, @current_process, @message, @last_tick_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      state_id=@state_id, switch=@switch, buttons=@buttons, sensors=@sensors, loads=@loads,
      current_index=@current_index, current_process=@current_process, message=@message,
      last_tick_time=@last_tick_time, last_write_time=@last_write_time
  `).run({
    chip_id: state.chipId,
    state_id: state.stateId,
    switch: state.switch,
    buttons: state.buttons ?? null,
    sensors: state.sensors ?? null,
    loads: state.loads ?? null,
    current_index: state.index ?? null,
    current_process: state.process ?? null,
    message: state.message ?? null,
    last_tick_time: Date.now(),
    last_write_time: state.lastWriteTime,
  });
}
```

> **说明：** 同 Task 4，JSON 类型列无需 `JSON.stringify`，直接传 JS 对象即可。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update saveDeviceState with snake_case mapping, remove manual JSON.stringify"
```

---

### Task 8: 重写 updateTick() — 更新列名

**Files:**
- Modify: `app/watering/services/db.ts:215-222`

- [ ] **Step 1: 替换 updateTick() 函数**

将 `updateTick()` 函数（第215-222行）替换为：

```typescript
export function updateTick(chipId: string) {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT 1 FROM watering_device_state WHERE chip_id = ?").get(chipId);
  if (existing) {
    db.prepare("UPDATE watering_device_state SET last_tick_time = ? WHERE chip_id = ?").run(now, chipId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update updateTick SQL to snake_case column names"
```

---

### Task 9: 重写 getDeviceLogs() — 更新列名

**Files:**
- Modify: `app/watering/services/db.ts:227-232`

- [ ] **Step 1: 替换 getDeviceLogs() 函数**

将 `getDeviceLogs()` 函数（第227-232行）替换为：

```typescript
export function getDeviceLogs(chipId: string, limit = 100) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, chip_id, event, state, created_time FROM watering_logs WHERE chip_id = ? ORDER BY created_time DESC LIMIT ?"
  ).all(chipId, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    event: row.event,
    state: row.state ?? undefined,
    createdTime: row.created_time,
  }));
}
```

> **说明：** 返回 camelCase 键的对象，让前端组件无需修改。`state` 列是 JSON 类型，`better-sqlite3` 自动解析为 JS 对象。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update getDeviceLogs with snake_case column mapping"
```

---

### Task 10: 重写 writeDeviceLog() 和 clearDeviceLogs() — 更新列名

**Files:**
- Modify: `app/watering/services/db.ts:237-253`

- [ ] **Step 1: 替换 writeDeviceLog() 和 clearDeviceLogs()**

将这两个函数（第237-253行）替换为：

```typescript
export function writeDeviceLog(chipId: string, event: string, state?: Record<string, unknown>) {
  const db = getDb();
  db.prepare("INSERT INTO watering_logs (chip_id, event, state, created_time) VALUES (?, ?, ?, ?)").run(
    chipId,
    event,
    state ?? null,
    new Date().toISOString()
  );
}

export function clearDeviceLogs(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_logs WHERE chip_id = ?").run(chipId);
}
```

> **说明：** `writeDeviceLog` 中 `state` 参数直接传 JS 对象（或 null），JSON 类型列无需 `JSON.stringify`。

- [ ] **Step 2: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "refactor: update writeDeviceLog/clearDeviceLogs SQL to snake_case, remove JSON.stringify"
```

---

### Task 11: 更新 log-viewer.tsx — 移除多余的 JSON.parse

**Files:**
- Modify: `app/watering/components/log-viewer.tsx:28-31`

- [ ] **Step 1: 简化 log-viewer.tsx 中的 state 渲染逻辑**

将第28-31行的：
```tsx
{log.state && (
  <pre style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
    {JSON.stringify(typeof log.state === "string" ? JSON.parse(log.state) : log.state, null, 2)}
  </pre>
)}
```

替换为：
```tsx
{log.state && (
  <pre style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
    {JSON.stringify(log.state, null, 2)}
  </pre>
)}
```

> **说明：** 由于 `getDeviceLogs()` 现在返回已解析的 JS 对象（JSON 类型列自动解析 + 函数层映射），`log.state` 已经是对象，无需再做 `typeof === "string"` 判断和 `JSON.parse`。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/watering/components/log-viewer.tsx
git commit -m "refactor: simplify log-viewer state rendering, remove redundant JSON.parse"
```

---

### Task 12: 删除旧数据库文件并验证端到端功能

**Files:**
- N/A (operational)

- [ ] **Step 1: 删除旧数据库文件**

旧表结构的数据库文件需要删除，让 `initDb()` 重建新表：

```bash
rm -f data/app.db data/app.db-wal data/app.db-shm
```

- [ ] **Step 2: 启动开发服务器并验证**

```bash
npm run dev
```

验证点：
1. 打开 `/watering` 页面，确认设备列表可正常加载（无设备时应显示空列表）
2. 设备详情页可正常访问
3. 日志页面可正常访问

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: clean up old database file for schema migration"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ 所有 camelCase 列名 → snake_case（11 个列名变更，见映射表）
   - ✅ 所有 TEXT 存储 JSON 的列 → JSON 类型（7 个类型变更：processes, schedules, buttons, sensors, loads, current_process, state）
   - ✅ 移除所有手动的 `JSON.stringify` / `JSON.parse`（在 save 函数和 log-viewer 中）
   - ✅ 索引名更新为 snake_case

2. **Placeholder scan:** 无 TBD/TODO/placeholder，每个步骤包含完整代码。

3. **Type consistency:**
   - TypeScript 类型 `DeviceConfig`, `DeviceState`, `DeviceItem` 保持 camelCase 不变（正确——TS 层不应跟着 SQL 改）
   - 所有 db.ts 读取函数返回 camelCase 属性的对象，与 TS 类型一致
   - 所有 db.ts 写入函数将 camelCase 参数映射为 snake_case SQL 参数
   - `getDeviceLogs()` 返回 camelCase 键对象，log-viewer 无需修改字段名
