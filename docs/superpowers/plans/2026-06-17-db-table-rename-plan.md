# 数据库表名优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `watering_devices` 重命名为 `watering_device`，`watering_logs` 重命名为 `watering_state_log`，统一单数命名并在 initDb() 中做好旧数据库迁移。

**Architecture:** 单一文件修改。在 `initDb()` 开头添加 `ALTER TABLE RENAME TO` 迁移逻辑，然后将文件中所有 SQL 字符串和 JSDoc 注释中的旧表名替换为新表名。SQLite 索引自动跟随表重命名。

**Tech Stack:** SQLite (WASM)、TypeScript

---

### Task 1: 表名重命名与迁移

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 在 initDb() 开头添加旧表迁移逻辑**

在 `initDb()` 函数体第一条语句（`const db = getDb();`）之后、第一个 `CREATE TABLE` 之前插入迁移代码：

```typescript
  // ---- 表名迁移：单数统一 + 语义化 ----
  // watering_devices → watering_device
  try {
    db.exec('ALTER TABLE watering_devices RENAME TO watering_device');
  } catch {
    // 表已迁移或不存在，忽略
  }
  // watering_logs → watering_state_log
  try {
    db.exec('ALTER TABLE watering_logs RENAME TO watering_state_log');
  } catch {
    // 表已迁移或不存在，忽略
  }
```

- [ ] **Step 2: 替换 CREATE TABLE 语句中的表名**

`watering_devices` → `watering_device`：

```sql
    CREATE TABLE IF NOT EXISTS watering_device (
      chip_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mac_address TEXT NOT NULL,
      processes JSON NOT NULL DEFAULT '[]',
      idle_sleep INTEGER NOT NULL DEFAULT 0,
      idle_timeout INTEGER NOT NULL DEFAULT 30000,
      boot_exec INTEGER NOT NULL DEFAULT -1,
      exec_delay INTEGER NOT NULL DEFAULT 0,
      schedules JSON NOT NULL DEFAULT '[]',
      sensors JSON NOT NULL DEFAULT '[]',
      processes_version TEXT,
      created_time TEXT NOT NULL,
      last_write_time TEXT NOT NULL
    )
```

`watering_logs` → `watering_state_log`：

```sql
    CREATE TABLE IF NOT EXISTS watering_state_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chip_id TEXT NOT NULL,
      mac_address TEXT,
      event TEXT NOT NULL,
      state_id TEXT,
      message TEXT,
      state JSON,
      readings JSON,
      created_time TEXT NOT NULL
    )
```

- [ ] **Step 3: 替换索引语句中的表名和索引名**

```sql
    CREATE INDEX IF NOT EXISTS idx_watering_state_log_chip_id
    ON watering_state_log(chip_id, created_time DESC)
```

```sql
    CREATE INDEX IF NOT EXISTS idx_watering_state_log_state_id ON watering_state_log(state_id)
```

- [ ] **Step 4: 替换 ALTER TABLE 语句中的表名**

所有 `ALTER TABLE watering_devices ...` → `ALTER TABLE watering_device ...`（共 3 处：processes_version、sensors、DROP COLUMN voltage）

所有 `ALTER TABLE watering_logs ...` → `ALTER TABLE watering_state_log ...`（共 4 处：mac_address、state_id、message、readings、DROP COLUMN voltage）

- [ ] **Step 5: 替换 FOREIGN KEY 引用中的表名**

```sql
      FOREIGN KEY (chip_id) REFERENCES watering_device(chip_id)
```
（共 2 处：watering_device_state 和 watering_sensor_log 的外键引用）

- [ ] **Step 6: 替换业务函数中 SQL 的表名**

| 函数 | 旧表名 | 新表名 |
|------|--------|--------|
| `getAllDevices` | `FROM watering_devices d` | `FROM watering_device d` |
| `getDeviceConfig` | `FROM watering_devices` | `FROM watering_device` |
| `saveDeviceConfig` | `INTO watering_devices` | `INTO watering_device` |
| `deleteDevice` | `DELETE FROM watering_devices` | `DELETE FROM watering_device` |
| `getDeviceLogs` | `FROM watering_logs` | `FROM watering_state_log` |
| `writeDeviceLog` | `INTO watering_logs` | `INTO watering_state_log` |
| `clearDeviceLogs` | `DELETE FROM watering_logs` | `DELETE FROM watering_state_log` |

- [ ] **Step 7: 替换 JSDoc 注释中的表名**

| 行 | 旧注释 | 新注释 |
|----|--------|--------|
| 11 | `/** watering_devices 表 SQLite 原始行 */` | `/** watering_device 表 SQLite 原始行 */` |
| 46 | `/** watering_devices LEFT JOIN watering_device_state 原始行 */` | `/** watering_device LEFT JOIN watering_device_state 原始行 */` |
| 66 | `/** watering_logs 表 SQLite 原始行 */` | `/** watering_state_log 表 SQLite 原始行 */` |

- [ ] **Step 8: 运行格式化与检查**

```bash
npm run format
npm run check
```

修复所有报错。

- [ ] **Step 9: 提交**

```bash
git add app/watering/services/db.ts docs/superpowers/plans/2026-06-17-db-table-rename-plan.md
git commit -m "refactor: rename tables for consistent naming

- watering_devices → watering_device (singular)
- watering_logs → watering_state_log (semantic + singular)
- Add ALTER TABLE RENAME TO migration in initDb()"
```
