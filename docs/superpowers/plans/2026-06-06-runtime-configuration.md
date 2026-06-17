# 运行配置 (Runtime Configuration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立应用的运行时配置基础设施——环境变量管理、数据库连接初始化、OSS 客户端初始化、服务启动钩子——使所有模块在服务器启动时正确初始化。

**Architecture:** 使用 `instrumentation.ts` 的 `register()` 函数作为服务器启动入口，依次执行环境变量校验、数据库建表、OSS 客户端初始化。环境变量通过 `lib/env.ts` 集中管理并校验，数据库连接通过 `lib/db.ts` 提供单例，各模块在各自的 `services/db.ts` 中定义建表语句并导出 `initDb()`。OSS 凭证从环境变量注入到 `lib/oss.ts` 的客户端实例。

**Tech Stack:** Next.js 16 App Router, better-sqlite3, ali-oss, vitest, TypeScript

---

## File Structure

```
instrumentation.ts                  # NEW — 服务器启动钩子，调用各模块 initDb()
lib/
├── env.ts                          # NEW — 环境变量集中定义 + 校验
├── db.ts                           # NEW — better-sqlite3 连接单例 + getDb()
├── oss.ts                          # NEW — OSS 客户端初始化
└── utils.ts                        # (暂不创建，后续按需)
app/
└── watering/
    └── services/
        └── db.ts                   # NEW — 浇花模块建表 + initDb() + CRUD
.env.example                        # NEW — 环境变量模板
vitest.config.ts                    # NEW — 测试框架配置
__tests__/
├── lib/
│   ├── env.test.ts                 # 环境变量校验测试
│   ├── db.test.ts                  # 数据库连接测试
│   └── oss.test.ts                 # OSS 客户端测试
└── app/
    └── watering/
        └── services/
            └── db.test.ts          # 浇花模块 DB 测试
```

---

### Task 1: Vitest 测试框架搭建

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (添加 devDependencies 和 test script)

- [ ] **Step 1: 安装 vitest 依赖**

Run:
```bash
pnpm add -D vitest
```

- [ ] **Step 2: 创建 vitest 配置文件**

```ts filename="vitest.config.ts"
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: 在 package.json 添加 test script**

在 `package.json` 的 `scripts` 中添加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 验证 vitest 能运行**

创建一个最小测试文件验证框架工作：

```ts filename="__tests__/setup.test.ts"
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test`
Expected: PASS (1 test)

- [ ] **Step 5: 删除临时测试文件**

Run: `rm __tests__/setup.test.ts`

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest test framework"
```

---

### Task 2: 环境变量管理 (`lib/env.ts`)

**Files:**
- Create: `lib/env.ts`
- Create: `__tests__/lib/env.test.ts`

- [ ] **Step 1: 写环境变量校验的失败测试**

```ts filename="__tests__/lib/env.test.ts"
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, validateEnv } from "@/lib/env";

describe("lib/env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getEnv", () => {
    it("returns DB_PATH with default value", () => {
      delete process.env.DB_PATH;
      const env = getEnv();
      expect(env.DB_PATH).toBe("./data/app.db");
    });

    it("returns DB_PATH from environment when set", () => {
      process.env.DB_PATH = "/custom/path.db";
      const env = getEnv();
      expect(env.DB_PATH).toBe("/custom/path.db");
    });

    it("returns AMAP_KEY from environment", () => {
      process.env.AMAP_KEY = "test-key";
      const env = getEnv();
      expect(env.AMAP_KEY).toBe("test-key");
    });

    it("returns AMAP_SECRET from environment", () => {
      process.env.AMAP_SECRET = "test-secret";
      const env = getEnv();
      expect(env.AMAP_SECRET).toBe("test-secret");
    });

    it("returns OSS_* from environment", () => {
      process.env.OSS_REGION = "oss-cn-hangzhou";
      process.env.OSS_ACCESS_KEY_ID = "key-id";
      process.env.OSS_ACCESS_KEY_SECRET = "key-secret";
      process.env.OSS_BUCKET = "my-bucket";
      const env = getEnv();
      expect(env.OSS_REGION).toBe("oss-cn-hangzhou");
      expect(env.OSS_ACCESS_KEY_ID).toBe("key-id");
      expect(env.OSS_ACCESS_KEY_SECRET).toBe("key-secret");
      expect(env.OSS_BUCKET).toBe("my-bucket");
    });
  });

  describe("validateEnv", () => {
    it("does not throw when all required vars are present", () => {
      process.env.DB_PATH = "/tmp/test.db";
      expect(() => validateEnv()).not.toThrow();
    });

    it("does not throw with default DB_PATH", () => {
      delete process.env.DB_PATH;
      expect(() => validateEnv()).not.toThrow();
    });

    it("throws when OSS_ACCESS_KEY_ID is set but other OSS vars are missing", () => {
      process.env.OSS_ACCESS_KEY_ID = "key-id";
      delete process.env.OSS_ACCESS_KEY_SECRET;
      delete process.env.OSS_REGION;
      delete process.env.OSS_BUCKET;
      expect(() => validateEnv()).toThrow(/OSS_ACCESS_KEY_SECRET/);
    });

    it("does not throw when no OSS vars are set (OSS is optional)", () => {
      delete process.env.OSS_REGION;
      delete process.env.OSS_ACCESS_KEY_ID;
      delete process.env.OSS_ACCESS_KEY_SECRET;
      delete process.env.OSS_BUCKET;
      expect(() => validateEnv()).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test __tests__/lib/env.test.ts`
Expected: FAIL — `Cannot find module '@/lib/env'`

- [ ] **Step 3: 实现 `lib/env.ts`**

```ts filename="lib/env.ts"
/**
 * 环境变量集中管理
 *
 * - 必须变量：缺失时 validateEnv() 抛错
 * - 可选变量：缺失时使用默认值或空字符串
 * - 组变量：OSS 四个变量要么全不设，要么全设
 */

export interface EnvConfig {
  /** SQLite 数据库文件路径，默认 ./data/app.db */
  DB_PATH: string;
  /** 高德地图 API Key（旅行模块） */
  AMAP_KEY: string;
  /** 高德地图 API Secret（旅行模块） */
  AMAP_SECRET: string;
  /** OSS 区域，如 oss-cn-hangzhou */
  OSS_REGION: string;
  /** OSS AccessKey ID */
  OSS_ACCESS_KEY_ID: string;
  /** OSS AccessKey Secret */
  OSS_ACCESS_KEY_SECRET: string;
  /** OSS Bucket 名称 */
  OSS_BUCKET: string;
}

/** 读取环境变量，应用默认值 */
export function getEnv(): EnvConfig {
  return {
    DB_PATH: process.env.DB_PATH || "./data/app.db",
    AMAP_KEY: process.env.AMAP_KEY || "",
    AMAP_SECRET: process.env.AMAP_SECRET || "",
    OSS_REGION: process.env.OSS_REGION || "",
    OSS_ACCESS_KEY_ID: process.env.OSS_ACCESS_KEY_ID || "",
    OSS_ACCESS_KEY_SECRET: process.env.OSS_ACCESS_KEY_SECRET || "",
    OSS_BUCKET: process.env.OSS_BUCKET || "",
  };
}

/** 校验环境变量，缺失必须变量时抛错 */
export function validateEnv(): void {
  const env = getEnv();

  // OSS 组校验：要么全设，要么全不设
  const ossVars = [
    env.OSS_REGION,
    env.OSS_ACCESS_KEY_ID,
    env.OSS_ACCESS_KEY_SECRET,
    env.OSS_BUCKET,
  ];
  const setCount = ossVars.filter((v) => v !== "").length;
  if (setCount > 0 && setCount < 4) {
    const missing = [
      ["OSS_REGION", env.OSS_REGION],
      ["OSS_ACCESS_KEY_ID", env.OSS_ACCESS_KEY_ID],
      ["OSS_ACCESS_KEY_SECRET", env.OSS_ACCESS_KEY_SECRET],
      ["OSS_BUCKET", env.OSS_BUCKET],
    ]
      .filter(([, v]) => v === "")
      .map(([k]) => k);
    throw new Error(
      `OSS 配置不完整，缺少: ${missing.join(", ")}。OSS 变量必须全部设置或全部留空。`
    );
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test __tests__/lib/env.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts __tests__/lib/env.test.ts
git commit -m "feat: add environment variable management (lib/env.ts)"
```

---

### Task 3: 数据库连接 (`lib/db.ts`)

**Files:**
- Create: `lib/db.ts`
- Create: `__tests__/lib/db.test.ts`

- [ ] **Step 1: 写数据库连接的失败测试**

```ts filename="__tests__/lib/db.test.ts"
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { getDb, closeDb } from "@/lib/db";
import path from "path";
import fs from "fs";

describe("lib/db", () => {
  const testDbPath = path.join(__dirname, "__test_db__.db");

  beforeEach(() => {
    process.env.DB_PATH = testDbPath;
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("getDb", () => {
    it("returns a Database instance", () => {
      const db = getDb();
      expect(db).toBeInstanceOf(Database);
    });

    it("returns the same instance on repeated calls (singleton)", () => {
      const db1 = getDb();
      const db2 = getDb();
      expect(db1).toBe(db2);
    });

    it("can execute a simple query", () => {
      const db = getDb();
      const result = db.prepare("SELECT 1 AS value").get() as { value: number };
      expect(result.value).toBe(1);
    });
  });

  describe("closeDb", () => {
    it("closes the database and allows reopening", () => {
      const db1 = getDb();
      closeDb();
      const db2 = getDb();
      expect(db1).not.toBe(db2);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test __tests__/lib/db.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db'`

- [ ] **Step 3: 实现 `lib/db.ts`**

```ts filename="lib/db.ts"
import Database from "better-sqlite3";
import { getEnv } from "./env";

let dbInstance: Database.Database | null = null;

/**
 * 获取 SQLite 数据库单例连接
 *
 * 首次调用时根据 DB_PATH 环境变量创建连接，
 * 后续调用返回同一实例。
 */
export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }
  const { DB_PATH } = getEnv();
  dbInstance = new Database(DB_PATH);
  // 启用 WAL 模式提升并发性能
  dbInstance.pragma("journal_mode = WAL");
  // 启用外键约束
  dbInstance.pragma("foreign_keys = ON");
  return dbInstance;
}

/**
 * 关闭数据库连接
 *
 * 主要用于测试清理。生产环境通常不需要手动关闭。
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test __tests__/lib/db.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts __tests__/lib/db.test.ts
git commit -m "feat: add database connection singleton (lib/db.ts)"
```

---

### Task 4: 浇花模块数据库初始化 (`app/watering/services/db.ts`)

**Files:**
- Create: `app/watering/services/db.ts`
- Create: `app/watering/types.ts`
- Create: `__tests__/app/watering/services/db.test.ts`

- [ ] **Step 1: 写浇花模块类型的失败测试**

```ts filename="__tests__/app/watering/services/db.test.ts"
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import { getDb, closeDb } from "@/lib/db";
import {
  initDb,
  getAllDevices,
  getDevice,
  upsertDevice,
  deleteDevice,
  getDeviceState,
  upsertDeviceState,
  getLogs,
  insertLog,
  clearLogs,
} from "@/app/watering/services/db";
import type { DeviceConfig, DeviceState } from "@/app/watering/types";

describe("app/watering/services/db", () => {
  const testDbPath = path.join(__dirname, "__test_watering_db__.db");

  beforeEach(() => {
    process.env.DB_PATH = testDbPath;
    initDb();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("initDb", () => {
    it("creates devices, device_states, and logs tables", () => {
      const db = getDb();
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("devices");
      expect(tableNames).toContain("device_states");
      expect(tableNames).toContain("logs");
    });

    it("is idempotent (calling twice does not error)", () => {
      expect(() => initDb()).not.toThrow();
    });
  });

  const sampleDevice: DeviceConfig = {
    chipId: "ESP32-001",
    name: "客厅浇花器",
    macAddress: "AA:BB:CC:DD:EE:FF",
    processes: [
      {
        name: "浇花",
        steps: [
          {
            name: "开泵",
            component: "pump1",
            value: { begin: 1, end: 0 },
            delay: 5,
          },
        ],
      },
    ],
    idleSleep: true,
    idleTimeout: 300,
    bootExec: 0,
    execDelay: 10,
    schedules: [
      {
        type: "day",
        value: 8,
        interval: 1,
        process: 0,
      },
    ],
    createdTime: "2026-01-01T00:00:00Z",
    lastWriteTime: "2026-01-01T00:00:00Z",
  };

  describe("device CRUD", () => {
    it("upserts and retrieves a device", () => {
      upsertDevice(sampleDevice);
      const device = getDevice("ESP32-001");
      expect(device).not.toBeNull();
      expect(device!.chipId).toBe("ESP32-001");
      expect(device!.name).toBe("客厅浇花器");
      expect(device!.processes).toEqual(sampleDevice.processes);
      expect(device!.schedules).toEqual(sampleDevice.schedules);
      expect(device!.idleSleep).toBe(true);
    });

    it("updates existing device by chipId", () => {
      upsertDevice(sampleDevice);
      const updated = { ...sampleDevice, name: "卧室浇花器" };
      upsertDevice(updated);
      const device = getDevice("ESP32-001");
      expect(device!.name).toBe("卧室浇花器");
    });

    it("returns all devices", () => {
      upsertDevice(sampleDevice);
      upsertDevice({ ...sampleDevice, chipId: "ESP32-002", name: "卧室浇花器" });
      const devices = getAllDevices();
      expect(devices).toHaveLength(2);
    });

    it("deletes a device", () => {
      upsertDevice(sampleDevice);
      deleteDevice("ESP32-001");
      const device = getDevice("ESP32-001");
      expect(device).toBeNull();
    });
  });

  describe("device state", () => {
    const sampleState: DeviceState = {
      chipId: "ESP32-001",
      stateId: "state-001",
      switch: "off",
      sensors: { soil: 512 },
      loads: { pump1: 0 },
      process: sampleDevice.processes[0],
      lastWriteTime: "2026-01-01T00:00:00Z",
    };

    it("upserts and retrieves device state", () => {
      upsertDevice(sampleDevice); // 需要 device 存在（外键）
      upsertDeviceState(sampleState);
      const state = getDeviceState("ESP32-001");
      expect(state).not.toBeNull();
      expect(state!.switch).toBe("off");
      expect(state!.sensors).toEqual({ soil: 512 });
    });

    it("updates existing state by chipId", () => {
      upsertDevice(sampleDevice);
      upsertDeviceState(sampleState);
      const updated = { ...sampleState, switch: "on" as const };
      upsertDeviceState(updated);
      const state = getDeviceState("ESP32-001");
      expect(state!.switch).toBe("on");
    });
  });

  describe("logs", () => {
    beforeEach(() => {
      upsertDevice(sampleDevice);
    });

    it("inserts and retrieves logs", () => {
      insertLog({ chipId: "ESP32-001", type: "bootstrap", message: "设备启动" });
      insertLog({ chipId: "ESP32-001", type: "execute", message: "执行流程" });
      const logs = getLogs("ESP32-001");
      expect(logs).toHaveLength(2);
      expect(logs[0].type).toBe("execute"); // 默认最新在前
      expect(logs[1].type).toBe("bootstrap");
    });

    it("returns empty array when no logs exist", () => {
      const logs = getLogs("ESP32-999");
      expect(logs).toEqual([]);
    });

    it("clears logs for a specific device", () => {
      insertLog({ chipId: "ESP32-001", type: "bootstrap", message: "设备启动" });
      clearLogs("ESP32-001");
      const logs = getLogs("ESP32-001");
      expect(logs).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test __tests__/app/watering/services/db.test.ts`
Expected: FAIL — `Cannot find module '@/app/watering/services/db'`

- [ ] **Step 3: 创建浇花模块类型定义**

```ts filename="app/watering/types.ts"
/** 流程中的步骤 */
export type Step = {
  name: string;
  /** 触发负载组件 */
  component: string;
  /** 负载值范围 */
  value: { begin: unknown; end: unknown };
  delay?: number;
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};

/** 中断条件 */
export type Interrupt = {
  name: string;
  /** 监视传感器组件 */
  component: string;
  state: number | boolean;
  /** 过滤抖动间隔 */
  intercept?: number;
  delay?: number;
  duration?: number;
  disabled?: boolean;
};

/** 流程 */
export type Process = {
  name: string;
  steps: Step[];
};

/** 计划任务 */
export type Schedule = {
  type: "minute" | "day" | "week" | "month";
  day?: number;
  week?: number;
  month?: number;
  value: number;
  interval: number;
  /** 执行流程索引 */
  process: number;
  disabled?: boolean;
};

/** 设备配置 */
export type DeviceConfig = {
  chipId: string;
  name: string;
  macAddress: string;
  processes: Process[];
  idleSleep: boolean;
  idleTimeout: number;
  /** 开机执行（-1 不执行） */
  bootExec: number;
  execDelay: number;
  schedules: Schedule[];
  createdTime: string;
  lastWriteTime: string;
};

/** 设备状态 */
export type DeviceState = {
  chipId: string;
  stateId: string;
  switch: "on" | "off";
  buttons?: Record<string, number>;
  sensors?: Record<string, number>;
  loads?: Record<string, number>;
  /** 当前任务标识 */
  index?: number;
  /** 当前执行流程 */
  process?: Process;
  message?: string;
  lastWriteTime: string;
};

/** 日志条目 */
export type LogEntry = {
  id: number;
  chipId: string;
  type: string;
  message: string | null;
  createdTime: string;
};
```

- [ ] **Step 4: 实现浇花模块数据库服务**

```ts filename="app/watering/services/db.ts"
import { getDb } from "@/lib/db";
import type { DeviceConfig, DeviceState, LogEntry } from "../types";

/**
 * 初始化浇花模块的数据库表
 *
 * 使用 CREATE TABLE IF NOT EXISTS 保证幂等性。
 * 在 instrumentation.ts 的 register() 中调用。
 */
export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      chipId         TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      macAddress     TEXT NOT NULL DEFAULT '',
      processes      TEXT NOT NULL DEFAULT '[]',
      idleSleep      INTEGER NOT NULL DEFAULT 0,
      idleTimeout    INTEGER NOT NULL DEFAULT 0,
      bootExec       INTEGER NOT NULL DEFAULT -1,
      execDelay      INTEGER NOT NULL DEFAULT 0,
      schedules      TEXT NOT NULL DEFAULT '[]',
      createdTime    TEXT NOT NULL,
      lastWriteTime  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_states (
      chipId         TEXT PRIMARY KEY,
      stateId        TEXT NOT NULL DEFAULT '',
      switch         TEXT NOT NULL DEFAULT 'off',
      buttons        TEXT,
      sensors        TEXT,
      loads          TEXT,
      processIndex   INTEGER,
      process        TEXT,
      message        TEXT,
      lastWriteTime  TEXT NOT NULL,
      FOREIGN KEY (chipId) REFERENCES devices(chipId) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      chipId         TEXT NOT NULL,
      type           TEXT NOT NULL,
      message        TEXT,
      createdTime    TEXT NOT NULL,
      FOREIGN KEY (chipId) REFERENCES devices(chipId) ON DELETE CASCADE
    );
  `);
}

// ─── Device CRUD ──────────────────────────────────────────────────────

/** 获取所有设备配置 */
export function getAllDevices(): DeviceConfig[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM devices").all() as Record<string, unknown>[];
  return rows.map(rowToDevice);
}

/** 获取单个设备配置，不存在返回 null */
export function getDevice(chipId: string): DeviceConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM devices WHERE chipId = ?").get(chipId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToDevice(row) : null;
}

/** 插入或更新设备配置 */
export function upsertDevice(device: DeviceConfig): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO devices (chipId, name, macAddress, processes, idleSleep, idleTimeout, bootExec, execDelay, schedules, createdTime, lastWriteTime)
    VALUES (@chipId, @name, @macAddress, @processes, @idleSleep, @idleTimeout, @bootExec, @execDelay, @schedules, @createdTime, @lastWriteTime)
    ON CONFLICT(chipId) DO UPDATE SET
      name = @name,
      macAddress = @macAddress,
      processes = @processes,
      idleSleep = @idleSleep,
      idleTimeout = @idleTimeout,
      bootExec = @bootExec,
      execDelay = @execDelay,
      schedules = @schedules,
      lastWriteTime = @lastWriteTime
  `).run({
    chipId: device.chipId,
    name: device.name,
    macAddress: device.macAddress,
    processes: JSON.stringify(device.processes),
    idleSleep: device.idleSleep ? 1 : 0,
    idleTimeout: device.idleTimeout,
    bootExec: device.bootExec,
    execDelay: device.execDelay,
    schedules: JSON.stringify(device.schedules),
    createdTime: device.createdTime,
    lastWriteTime: device.lastWriteTime,
  });
}

/** 删除设备配置 */
export function deleteDevice(chipId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM devices WHERE chipId = ?").run(chipId);
}

// ─── Device State ─────────────────────────────────────────────────────

/** 获取设备状态，不存在返回 null */
export function getDeviceState(chipId: string): DeviceState | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM device_states WHERE chipId = ?")
    .get(chipId) as Record<string, unknown> | undefined;
  return row ? rowToDeviceState(row) : null;
}

/** 插入或更新设备状态 */
export function upsertDeviceState(state: DeviceState): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO device_states (chipId, stateId, switch, buttons, sensors, loads, processIndex, process, message, lastWriteTime)
    VALUES (@chipId, @stateId, @switch, @buttons, @sensors, @loads, @processIndex, @process, @message, @lastWriteTime)
    ON CONFLICT(chipId) DO UPDATE SET
      stateId = @stateId,
      switch = @switch,
      buttons = @buttons,
      sensors = @sensors,
      loads = @loads,
      processIndex = @processIndex,
      process = @process,
      message = @message,
      lastWriteTime = @lastWriteTime
  `).run({
    chipId: state.chipId,
    stateId: state.stateId,
    switch: state.switch,
    buttons: state.buttons ? JSON.stringify(state.buttons) : null,
    sensors: state.sensors ? JSON.stringify(state.sensors) : null,
    loads: state.loads ? JSON.stringify(state.loads) : null,
    processIndex: state.index ?? null,
    process: state.process ? JSON.stringify(state.process) : null,
    message: state.message ?? null,
    lastWriteTime: state.lastWriteTime,
  });
}

// ─── Logs ─────────────────────────────────────────────────────────────

/** 获取设备日志，最新在前 */
export function getLogs(chipId: string): LogEntry[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM logs WHERE chipId = ? ORDER BY createdTime DESC")
    .all(chipId) as LogEntry[];
}

/** 插入一条日志 */
export function insertLog(entry: {
  chipId: string;
  type: string;
  message?: string;
}): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO logs (chipId, type, message, createdTime) VALUES (?, ?, ?, ?)"
  ).run(
    entry.chipId,
    entry.type,
    entry.message ?? null,
    new Date().toISOString()
  );
}

/** 清空指定设备的所有日志 */
export function clearLogs(chipId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM logs WHERE chipId = ?").run(chipId);
}

// ─── 行转对象工具 ────────────────────────────────────────────────────

function rowToDevice(row: Record<string, unknown>): DeviceConfig {
  return {
    chipId: row.chipId as string,
    name: row.name as string,
    macAddress: row.macAddress as string,
    processes: JSON.parse(row.processes as string),
    idleSleep: (row.idleSleep as number) === 1,
    idleTimeout: row.idleTimeout as number,
    bootExec: row.bootExec as number,
    execDelay: row.execDelay as number,
    schedules: JSON.parse(row.schedules as string),
    createdTime: row.createdTime as string,
    lastWriteTime: row.lastWriteTime as string,
  };
}

function rowToDeviceState(row: Record<string, unknown>): DeviceState {
  return {
    chipId: row.chipId as string,
    stateId: row.stateId as string,
    switch: row.switch as "on" | "off",
    buttons: row.buttons ? JSON.parse(row.buttons as string) : undefined,
    sensors: row.sensors ? JSON.parse(row.sensors as string) : undefined,
    loads: row.loads ? JSON.parse(row.loads as string) : undefined,
    index: (row.processIndex as number | null) ?? undefined,
    process: row.process
      ? JSON.parse(row.process as string)
      : undefined,
    message: (row.message as string | null) ?? undefined,
    lastWriteTime: row.lastWriteTime as string,
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test __tests__/app/watering/services/db.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add app/watering/types.ts app/watering/services/db.ts __tests__/app/watering/services/db.test.ts
git commit -m "feat: add watering module DB schema and CRUD (app/watering/services/db.ts)"
```

---

### Task 5: OSS 客户端初始化 (`lib/oss.ts`)

**Files:**
- Create: `lib/oss.ts`
- Create: `__tests__/lib/oss.test.ts`

- [ ] **Step 1: 安装 ali-oss 依赖**

Run:
```bash
pnpm add ali-oss
```

- [ ] **Step 2: 写 OSS 客户端的失败测试**

```ts filename="__tests__/lib/oss.test.ts"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getOssClient, isOssConfigured } from "@/lib/oss";

describe("lib/oss", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("isOssConfigured", () => {
    it("returns false when no OSS vars are set", () => {
      delete process.env.OSS_REGION;
      delete process.env.OSS_ACCESS_KEY_ID;
      delete process.env.OSS_ACCESS_KEY_SECRET;
      delete process.env.OSS_BUCKET;
      expect(isOssConfigured()).toBe(false);
    });

    it("returns true when all OSS vars are set", () => {
      process.env.OSS_REGION = "oss-cn-hangzhou";
      process.env.OSS_ACCESS_KEY_ID = "key-id";
      process.env.OSS_ACCESS_KEY_SECRET = "key-secret";
      process.env.OSS_BUCKET = "my-bucket";
      expect(isOssConfigured()).toBe(true);
    });
  });

  describe("getOssClient", () => {
    it("throws when OSS is not configured", () => {
      delete process.env.OSS_REGION;
      delete process.env.OSS_ACCESS_KEY_ID;
      delete process.env.OSS_ACCESS_KEY_SECRET;
      delete process.env.OSS_BUCKET;
      expect(() => getOssClient()).toThrow(/OSS 未配置/);
    });

    it("returns an OSS client instance when configured", () => {
      process.env.OSS_REGION = "oss-cn-hangzhou";
      process.env.OSS_ACCESS_KEY_ID = "key-id";
      process.env.OSS_ACCESS_KEY_SECRET = "key-secret";
      process.env.OSS_BUCKET = "my-bucket";
      const client = getOssClient();
      expect(client).toBeDefined();
      expect(client.options.region).toBe("oss-cn-hangzhou");
      expect(client.options.bucket).toBe("my-bucket");
    });

    it("returns the same instance on repeated calls (singleton)", () => {
      process.env.OSS_REGION = "oss-cn-hangzhou";
      process.env.OSS_ACCESS_KEY_ID = "key-id";
      process.env.OSS_ACCESS_KEY_SECRET = "key-secret";
      process.env.OSS_BUCKET = "my-bucket";
      const client1 = getOssClient();
      const client2 = getOssClient();
      expect(client1).toBe(client2);
    });
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test __tests__/lib/oss.test.ts`
Expected: FAIL — `Cannot find module '@/lib/oss'`

- [ ] **Step 4: 实现 `lib/oss.ts`**

```ts filename="lib/oss.ts"
import OSS from "ali-oss";
import { getEnv } from "./env";

let ossClient: OSS | null = null;

/**
 * 检查 OSS 是否已配置
 *
 * 四个 OSS 变量全部非空时视为已配置。
 */
export function isOssConfigured(): boolean {
  const env = getEnv();
  return (
    env.OSS_REGION !== "" &&
    env.OSS_ACCESS_KEY_ID !== "" &&
    env.OSS_ACCESS_KEY_SECRET !== "" &&
    env.OSS_BUCKET !== ""
  );
}

/**
 * 获取 OSS 客户端单例
 *
 * 首次调用时根据环境变量创建客户端，后续调用返回同一实例。
 * 如果 OSS 未配置，抛出错误。
 */
export function getOssClient(): OSS {
  if (ossClient) {
    return ossClient;
  }

  if (!isOssConfigured()) {
    throw new Error(
      "OSS 未配置。请设置 OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET 环境变量。"
    );
  }

  const env = getEnv();
  ossClient = new OSS({
    region: env.OSS_REGION,
    accessKeyId: env.OSS_ACCESS_KEY_ID,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
    bucket: env.OSS_BUCKET,
  });

  return ossClient;
}

/**
 * 重置 OSS 客户端（主要用于测试）
 */
export function resetOssClient(): void {
  ossClient = null;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test __tests__/lib/oss.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/oss.ts __tests__/lib/oss.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add OSS client initialization (lib/oss.ts)"
```

---

### Task 6: 服务器启动钩子 (`instrumentation.ts`)

**Files:**
- Create: `instrumentation.ts`
- Create: `__tests__/instrumentation.test.ts`

- [ ] **Step 1: 写启动钩子的失败测试**

```ts filename="__tests__/instrumentation.test.ts"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import fs from "fs";

// 在导入被测模块前，确保 DB_PATH 指向测试路径
const testDbPath = path.join(__dirname, "__test_instr_db__.db");

describe("instrumentation", () => {
  beforeEach(() => {
    process.env.DB_PATH = testDbPath;
    // 清除模块缓存以确保 register 重新执行
    vi.resetModules();
  });

  afterEach(async () => {
    // 关闭数据库连接
    const { closeDb } = await import("@/lib/db");
    closeDb();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it("register initializes DB tables without error", async () => {
    const { register } = await import("../../instrumentation");
    await expect(register()).resolves.toBeUndefined();
  });

  it("register creates watering module tables", async () => {
    const { register } = await import("../../instrumentation");
    await register();
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("devices");
    expect(tableNames).toContain("device_states");
    expect(tableNames).toContain("logs");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test __tests__/instrumentation.test.ts`
Expected: FAIL — `Cannot find module '../../instrumentation'`

- [ ] **Step 3: 实现 `instrumentation.ts`**

```ts filename="instrumentation.ts"
/**
 * Next.js 服务器启动钩子
 *
 * register() 在服务器实例启动时调用一次，且必须在服务器就绪前完成。
 * 用于执行一次性初始化：环境变量校验、数据库建表等。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register(): Promise<void> {
  // 仅在 Node.js 运行时执行（跳过 Edge）
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  // 1. 校验环境变量
  const { validateEnv } = await import("@/lib/env");
  validateEnv();

  // 2. 确保数据目录存在
  const { getEnv } = await import("@/lib/env");
  const fs = await import("fs");
  const path = await import("path");
  const { DB_PATH } = getEnv();
  const dbDir = path.dirname(DB_PATH);
  if (dbDir && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 3. 初始化各模块数据库表
  const { initDb: initWateringDb } = await import(
    "@/app/watering/services/db"
  );
  initWateringDb();

  // 后续新增模块时，在此处添加对应的 initDb() 调用：
  // const { initDb: initTravelDb } = await import("@/app/travel/services/db");
  // initTravelDb();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test __tests__/instrumentation.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 运行全部测试确认无回归**

Run: `pnpm test`
Expected: PASS — 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add instrumentation.ts __tests__/instrumentation.test.ts
git commit -m "feat: add server startup hook (instrumentation.ts)"
```

---

### Task 7: Next.js 配置更新 (`next.config.ts`)

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: 更新 Next.js 配置以支持 instrumentation**

```ts filename="next.config.ts"
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 instrumentation.ts 支持
  // Next.js 15+ 默认启用，但显式声明更清晰
  // better-sqlite3 已在 Next.js 内置的 serverExternalPackages 列表中，
  // 无需额外配置
};

export default nextConfig;
```

> **说明：** Next.js 15+ 已默认启用 `instrumentation.ts`，`better-sqlite3` 已在 [内置外部包列表](https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/server-external-packages.jsonc) 中自动排除，无需手动配置 `serverExternalPackages`。当前 `next.config.ts` 暂时保持最简配置，后续有需要时再添加。

- [ ] **Step 2: 验证构建正常**

Run: `pnpm build`
Expected: 构建成功（可能有 TypeScript 警告但不报错）

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "chore: update next.config.ts with instrumentation notes"
```

---

### Task 8: 环境变量模板 (`.env.example`)

**Files:**
- Create: `.env.example`

- [ ] **Step 1: 创建环境变量模板**

```env filename=".env.example"
# ─── 数据库 ──────────────────────────────────────────
# SQLite 数据库文件路径（默认 ./data/app.db）
DB_PATH=./data/app.db

# ─── 阿里云 OSS（旅行模块图片存储） ──────────────────
# 四个变量必须全部设置或全部留空
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=

# ─── 高德地图（旅行模块定位/搜索） ──────────────────
AMAP_KEY=
AMAP_SECRET=
```

- [ ] **Step 2: 确保 `.gitignore` 包含 `.env`**

检查 `.gitignore` 中是否已包含 `.env*.local` 或 `.env`。如果没有，添加：

```
.env
.env.local
.env.*.local
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "docs: add .env.example with all environment variables"
```

---

### Task 9: 全量验证

- [ ] **Step 1: 运行全部测试**

Run: `pnpm test`
Expected: PASS — 所有测试通过，无跳过

- [ ] **Step 2: 启动开发服务器验证**

Run: `pnpm dev`
Expected: 服务器正常启动，终端无报错

- [ ] **Step 3: 验证数据库文件创建**

启动后检查 `data/app.db` 文件是否存在：
Run: `ls -la data/`
Expected: `app.db` 文件存在

- [ ] **Step 4: 停止开发服务器后清理**

按 Ctrl+C 停止开发服务器。

- [ ] **Step 5: 最终 Commit**

如果 Step 2/3 有任何修改：
```bash
git add -A
git commit -m "fix: address issues found during full verification"
```

如果没有修改，跳过此步。
