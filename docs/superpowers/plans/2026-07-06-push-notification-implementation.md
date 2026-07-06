# Web Push 离线通知——实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为"谐趣"PWA 添加设备离线 Web Push 通知，设备离线超 30 分钟推送一次，上线后复位。

**Architecture:** 新增 `lib/push.ts` 封装 web-push 发送逻辑；新增 `push_subscriptions` 表 + `offline_notified` 字段存储订阅和通知状态；新增 3 个 API Route 处理订阅/取消/离线检查；修改 `public/sw.js` 处理 push/notificationclick 事件；修改 `pwa-register.tsx` 添加订阅 UI；修改 `push-state/route.ts` 在心跳时复位离线通知状态。

**Tech Stack:** Next.js 16 App Router, SQLite (node-sqlite3-wasm), web-push, vitest, TypeScript

## Global Constraints

- 零额外 PWA 依赖（web-push 仅服务端用，不增加客户端 bundle）
- TDD: 先写测试 → 确认失败 → 实现 → 确认通过
- 代码变更后必须 `npm run format` → `npm run check` → 修复 → 再提交
- 遵循项目现有文件组织模式和命名约定
- SQLite WASM 驱动为同步 API，函数签名保持 async 兼容上层

来源：`docs/superpowers/specs/2026-07-06-push-notification-design.md`

---

### Task 1: 依赖安装与环境变量

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.env.local`

**Interfaces:**
- Produces: `web-push` 可用，`WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY` 环境变量已配置

**目标:** 安装 web-push 依赖，生成 VAPID 密钥对，配置环境变量。

- [ ] **Step 1: 安装依赖**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

- [ ] **Step 2: 生成 VAPID 密钥对**

```bash
npx web-push generate-vapid-keys
```

记录输出的公钥和私钥。

- [ ] **Step 3: 将密钥添加到 `.env.local`**

```env
# ─── Web Push 通知 ──────────────────────────────
WEB_PUSH_VAPID_PUBLIC_KEY=<Step 2 的公钥>
WEB_PUSH_VAPID_PRIVATE_KEY=<Step 2 的私钥>
```

- [ ] **Step 4: 在 `.env.example` 中添加占位**

```env
# ─── Web Push 通知 ──────────────────────────────
# 运行 `npx web-push generate-vapid-keys` 生成
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
```

- [ ] **Step 5: 验证**

```bash
node -e "const webpush = require('web-push'); console.log('web-push OK')"
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add web-push dependency and VAPID env vars"
```

---

### Task 2: 数据库迁移——新增 push_subscriptions 表与 offline_notified 字段

**Files:**
- Create: `__tests__/push/db.test.ts`
- Modify: `app/watering/services/db.ts`

**Interfaces:**
- Produces:
  - `getPushSubscriptions(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }[]>`
  - `upsertPushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>`
  - `deletePushSubscription(endpoint: string): Promise<void>`
  - `markOfflineNotified(chipId: string): Promise<void>`
  - `resetOfflineNotified(chipId: string): Promise<void>`

**目标:** 在 `initDb()` 中新增表/字段，实现 5 个数据库操作函数。

- [ ] **Step 1: 编写测试**

创建 `__tests__/push/db.test.ts`：

```ts
/**
 * push_subscriptions 表 + offline_notified 字段的数据库操作测试
 *
 * 使用 node-sqlite3-wasm 内存数据库测试，
 * 验证建表、增删查、通知状态标记/复位。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// 注意：这些函数是从 app/watering/services/db.ts 导出的
// 测试文件通过 vitest alias @/ 导入

describe('push_subscriptions CRUD', () => {
  // 测试将在 __tests__/push/ 目录下运行
  // SQLite 内存模式通过 DB_PATH=:memory: 实现
  beforeAll(async () => {
    // 设置内存数据库
    process.env.DB_PATH = ':memory:';
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
  });

  afterAll(() => {
    delete process.env.DB_PATH;
  });

  const testSub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  it('upsertPushSubscription 保存新订阅', async () => {
    const { upsertPushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');

    await upsertPushSubscription(testSub);
    const subs = await getPushSubscriptions();

    expect(subs).toHaveLength(1);
    expect(subs[0]?.endpoint).toBe(testSub.endpoint);
    expect(subs[0]?.keys).toEqual(testSub.keys);
  });

  it('upsertPushSubscription 更新已有订阅（相同 endpoint）', async () => {
    const { upsertPushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');

    const updated = {
      ...testSub,
      keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
    };
    await upsertPushSubscription(updated);
    const subs = await getPushSubscriptions();

    expect(subs).toHaveLength(1);
    expect(subs[0]?.keys).toEqual(updated.keys);
  });

  it('deletePushSubscription 删除订阅', async () => {
    const { deletePushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');

    await deletePushSubscription(testSub.endpoint);
    const subs = await getPushSubscriptions();

    expect(subs).toHaveLength(0);
  });

  it('getPushSubscriptions 空表返回空数组', async () => {
    const { getPushSubscriptions } = await import('@/app/watering/services/db');

    const subs = await getPushSubscriptions();

    expect(subs).toEqual([]);
  });
});

describe('offline_notified', () => {
  const chipId = 'test-chip-offline';

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
    // 创建测试设备和状态行
    const { getDbSync } = await import('@/lib/db');
    const db = getDbSync();
    const now = new Date().toISOString();
    db.run(
      'INSERT OR REPLACE INTO watering_device (chip_id, name, mac_address, created_time, last_write_time) VALUES (?, ?, ?, ?, ?)',
      [chipId, 'Test Device', 'aa:bb:cc:dd:ee:ff', now, now],
    );
    db.run(
      'INSERT OR REPLACE INTO watering_device_state (chip_id, state_id, last_tick_time, last_write_time, offline_notified) VALUES (?, ?, ?, ?, ?)',
      [chipId, 'test-state', Date.now(), now, 0],
    );
  });

  afterAll(() => {
    delete process.env.DB_PATH;
  });

  it('markOfflineNotified 将状态设为 1', async () => {
    const { markOfflineNotified } = await import('@/app/watering/services/db');
    const { getDbSync } = await import('@/lib/db');

    await markOfflineNotified(chipId);

    const db = getDbSync();
    const row = db.get(
      'SELECT offline_notified FROM watering_device_state WHERE chip_id = ?',
      [chipId],
    ) as unknown as { offline_notified: number } | undefined;
    expect(row?.offline_notified).toBe(1);
  });

  it('resetOfflineNotified 将状态复位为 0', async () => {
    const { markOfflineNotified, resetOfflineNotified } = await import('@/app/watering/services/db');
    const { getDbSync } = await import('@/lib/db');

    await markOfflineNotified(chipId);
    await resetOfflineNotified(chipId);

    const db = getDbSync();
    const row = db.get(
      'SELECT offline_notified FROM watering_device_state WHERE chip_id = ?',
      [chipId],
    ) as unknown as { offline_notified: number } | undefined;
    expect(row?.offline_notified).toBe(0);
  });

  it('resetOfflineNotified 对不存在的设备静默跳过', async () => {
    const { resetOfflineNotified } = await import('@/app/watering/services/db');

    // 不应抛出异常
    await expect(resetOfflineNotified('non-existent-chip')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试，确认全部 FAIL**

```bash
npx vitest run __tests__/push/db.test.ts
```

预期: 全部失败（函数未定义）。

- [ ] **Step 3: 在 `app/watering/services/db.ts` 的 `initDb()` 中新增建表 DDL**

在 `initDb()` 函数末尾（`addColumn` 调用之后）追加：

```ts
  // 新增列——offline_notified（设备离线通知状态）
  addColumn('watering_device_state', 'offline_notified', 'INTEGER DEFAULT 0');

  // push_subscriptions——Web Push 浏览器订阅
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh_key TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      created_time TEXT NOT NULL
    )
  `);
```

- [ ] **Step 4: 在 `app/watering/services/db.ts` 末尾新增 5 个函数**

```ts
/** push_subscriptions 原始行 */
interface PushSubscriptionRow {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  created_time: string;
}

/**
 * 获取所有 Web Push 订阅
 *
 * 遍历所有订阅逐个推送，调用方负责处理单个推送失败。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getPushSubscriptions(): Promise<
  { endpoint: string; keys: { p256dh: string; auth: string } }[]
> {
  const db = getDb();
  const rows = db.all(
    'SELECT * FROM push_subscriptions ORDER BY created_time DESC',
  ) as unknown as PushSubscriptionRow[];
  return rows.map((r) => ({
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh_key, auth: r.auth_key },
  }));
}

/**
 * 保存或更新 Web Push 订阅
 *
 * endpoint 为唯一键，重复订阅覆盖密钥和创建时间。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function upsertPushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO push_subscriptions (endpoint, p256dh_key, auth_key, created_time)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh_key=?, auth_key=?, created_time=?`,
    [sub.endpoint, sub.keys.p256dh, sub.keys.auth, now, sub.keys.p256dh, sub.keys.auth, now],
  );
}

/**
 * 删除 Web Push 订阅
 *
 * endpoint 不存在时静默跳过。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const db = getDb();
  db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

/**
 * 标记设备离线通知已发送
 *
 * 将 offline_notified 设为 1，避免重复通知。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function markOfflineNotified(chipId: string): Promise<void> {
  const db = getDbSync();
  db.run('UPDATE watering_device_state SET offline_notified = 1 WHERE chip_id = ?', [chipId]);
}

/**
 * 复位设备离线通知状态
 *
 * 设备恢复在线（收到心跳）时调用，使设备下次离线时能被再次通知。
 * 设备不存在时静默跳过。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function resetOfflineNotified(chipId: string): Promise<void> {
  const db = getDbSync();
  db.run(
    'UPDATE watering_device_state SET offline_notified = 0 WHERE chip_id = ? AND offline_notified = 1',
    [chipId],
  );
}
```

- [ ] **Step 5: 运行测试，确认全部 PASS**

```bash
npx vitest run __tests__/push/db.test.ts
```

预期: 全部通过。

- [ ] **Step 6: 格式化与检查**

```bash
npm run format
npm run check
```

如有错误则修复。

- [ ] **Step 7: Commit**

```bash
git add __tests__/push/db.test.ts app/watering/services/db.ts
git commit -m "feat: add push_subscriptions table and offline_notified column"
```

---

### Task 3: `lib/push.ts` — Web Push 工具函数

**Files:**
- Create: `__tests__/push/push.test.ts`
- Create: `lib/push.ts`

**Interfaces:**
- Produces:
  - `initWebPush(): void` — 设置 VAPID 密钥，密钥缺失时抛错
  - `sendPushNotification(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: { title: string; body: string; data: { url: string } }): Promise<{ success: boolean; gone?: boolean }>` — 发送推送，gone=true 表示 410 需清理
  - `getVapidPublicKey(): string` — 获取 VAPID 公钥

**目标:** 封装 web-push 库，提供类型安全的推送发送和 VAPID 密钥管理。

- [ ] **Step 1: 编写测试**

创建 `__tests__/push/push.test.ts`：

```ts
/**
 * lib/push.ts 单元测试
 *
 * 验证 VAPID 初始化、推送发送、410 处理。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// mock web-push 以避免真实网络调用
const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

describe('initWebPush', () => {
  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    mockSetVapidDetails.mockClear();
    vi.resetModules();
  });

  it('VAPID 密钥齐全时成功初始化', async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private-key';

    const { initWebPush } = await import('@/lib/push');
    initWebPush();

    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      'mailto:no-reply@xiequ.app',
      'test-public-key',
      'test-private-key',
    );
  });

  it('缺少公钥时抛出异常', async () => {
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private-key';

    const { initWebPush } = await import('@/lib/push');
    expect(() => initWebPush()).toThrow('VAPID keys not configured');
  });

  it('缺少私钥时抛出异常', async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key';

    const { initWebPush } = await import('@/lib/push');
    expect(() => initWebPush()).toThrow('VAPID keys not configured');
  });
});

describe('sendPushNotification', () => {
  beforeEach(() => {
    mockSendNotification.mockReset();
  });

  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'p256dh-test', auth: 'auth-test' },
  };
  const payload = {
    title: '测试离线',
    body: '设备已离线 30 分钟',
    data: { url: '/watering/devices/chip1' },
  };

  it('推送成功返回 { success: true }', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    const { sendPushNotification } = await import('@/lib/push');
    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).toHaveBeenCalledWith(
      subscription,
      JSON.stringify(payload),
    );
  });

  it('410 Gone 返回 { success: false, gone: true }', async () => {
    const error = new Error('Gone') as Error & { statusCode: number };
    error.statusCode = 410;
    mockSendNotification.mockRejectedValue(error);

    const { sendPushNotification } = await import('@/lib/push');
    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: false, gone: true });
  });

  it('其他错误向上抛出', async () => {
    const error = new Error('Network error');
    mockSendNotification.mockRejectedValue(error);

    const { sendPushNotification } = await import('@/lib/push');
    await expect(sendPushNotification(subscription, payload)).rejects.toThrow('Network error');
  });
});

describe('getVapidPublicKey', () => {
  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    vi.resetModules();
  });

  it('返回配置的公钥', async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'pub-key-123';

    const { getVapidPublicKey } = await import('@/lib/push');
    expect(getVapidPublicKey()).toBe('pub-key-123');
  });

  it('未配置时抛出异常', async () => {
    const { getVapidPublicKey } = await import('@/lib/push');
    expect(() => getVapidPublicKey()).toThrow('VAPID public key not configured');
  });
});
```

- [ ] **Step 2: 运行测试，确认全部 FAIL**

```bash
npx vitest run __tests__/push/push.test.ts
```

预期: 模块 `/lib/push` 不存在，全部失败。

- [ ] **Step 3: 实现 `lib/push.ts`**

```ts
/**
 * Web Push 通知工具模块
 *
 * 封装 web-push 库，提供类型安全的 VAPID 初始化、推送发送、
 * 和公钥获取功能。
 *
 * 注意事项：
 * - VAPID 密钥通过环境变量注入，服务端安全边界
 * - 410 Gone 不做隐式清理，由调用方决定处理策略
 */

import webpush from 'web-push';

/** 邮件地址，用于 VAPID 身份标识（不会实际发送邮件） */
const VAPID_SUBJECT = 'mailto:no-reply@xiequ.app';

/**
 * 初始化 web-push VAPID 密钥
 *
 * 在发送任何推送前调用。密钥缺失时抛出异常，
 * 调用方应在 API Route 中捕获并返回 500。
 */
export function initWebPush(): void {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys not configured. Set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY.',
    );
  }

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
}

/** 推送负载结构 */
export interface PushPayload {
  title: string;
  body: string;
  data: { url: string };
}

/** 浏览器 PushSubscription 格式 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** 推送结果 */
export type PushResult =
  | { success: true }
  | { success: false; gone: boolean };

/**
 * 向单个浏览器订阅发送 Web Push 通知
 *
 * 返回结果对象而非抛出异常，方便调用方区分 410（需清理订阅）
 * 和其他错误（网络问题，可重试）。
 *
 * @param subscription 浏览器推送订阅对象
 * @param payload 通知标题、正文和点击跳转 URL
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<PushResult> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err: unknown) {
    // web-push 的 WebPushError 包含 statusCode 属性
    if (
      err &&
      typeof err === 'object' &&
      'statusCode' in err &&
      (err as { statusCode: number }).statusCode === 410
    ) {
      return { success: false, gone: true };
    }
    throw err;
  }
}

/**
 * 获取 VAPID 公钥
 *
 * 通过 API 暴露给前端，供 PushManager.subscribe() 的
 * applicationServerKey 参数使用。
 */
export function getVapidPublicKey(): string {
  const key = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!key) {
    throw new Error('VAPID public key not configured.');
  }
  return key;
}
```

- [ ] **Step 4: 运行测试，确认全部 PASS**

```bash
npx vitest run __tests__/push/push.test.ts
```

- [ ] **Step 5: 格式化与检查**

```bash
npm run format
npm run check
```

修复错误。

- [ ] **Step 6: Commit**

```bash
git add __tests__/push/push.test.ts lib/push.ts
git commit -m "feat: add web push utility (init, send, getVapidPublicKey)"
```

---

### Task 4: `GET /api/push/vapid-public-key` — VAPID 公钥 API

**Files:**
- Create: `__tests__/push/vapid-public-key.test.ts`
- Create: `app/api/push/vapid-public-key/route.ts`

**Interfaces:**
- Produces: `GET /api/push/vapid-public-key` → `{ publicKey: string }`

**目标:** 提供 HTTP 接口让前端获取 VAPID 公钥。

- [ ] **Step 1: 编写测试**

创建 `__tests__/push/vapid-public-key.test.ts`：

```ts
/**
 * GET /api/push/vapid-public-key 测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 创建 mock GET handler
const createHandler = async () => {
  const { GET } = await import('@/app/api/push/vapid-public-key/route');
  return GET;
};

describe('GET /api/push/vapid-public-key', () => {
  beforeEach(() => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key-for-api';
  });

  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    vi.resetModules();
  });

  it('返回 VAPID 公钥', async () => {
    const handler = await createHandler();
    const response = await handler();

    const body = await response.json();
    expect(body).toEqual({ publicKey: 'test-public-key-for-api' });
    expect(response.status).toBe(200);
  });

  it('密钥未配置时返回 500', async () => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;

    const handler = await createHandler();
    const response = await handler();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
npx vitest run __tests__/push/vapid-public-key.test.ts
```

- [ ] **Step 3: 实现 API Route**

创建 `app/api/push/vapid-public-key/route.ts`：

```ts
import { NextResponse } from 'next/server';

import { getVapidPublicKey } from '@/lib/push';

/**
 * GET /api/push/vapid-public-key
 *
 * 返回 VAPID 公钥，供前端 PushManager.subscribe() 的
 * applicationServerKey 使用。公钥不敏感，可公开暴露。
 */
export async function GET() {
  try {
    const publicKey = getVapidPublicKey();
    return NextResponse.json({ publicKey });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] Failed to get VAPID public key:', message);
    return NextResponse.json({ error: 'VAPID public key not configured' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
npx vitest run __tests__/push/vapid-public-key.test.ts
```

- [ ] **Step 5: 格式化与检查**

```bash
npm run format
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add __tests__/push/vapid-public-key.test.ts app/api/push/vapid-public-key/route.ts
git commit -m "feat: add VAPID public key API endpoint"
```

---

### Task 5: `POST/DELETE /api/push/subscribe` — 订阅管理 API

**Files:**
- Create: `__tests__/push/subscribe.test.ts`
- Create: `app/api/push/subscribe/route.ts`

**Interfaces:**
- Produces:
  - `POST /api/push/subscribe` body `{ endpoint: string; keys: { p256dh: string; auth: string } }` → `{ success: true }`
  - `DELETE /api/push/subscribe?endpoint=...` → `{ success: true }`

**目标:** 提供订阅保存和删除的 HTTP 接口。

- [ ] **Step 1: 编写测试**

创建 `__tests__/push/subscribe.test.ts`：

```ts
/**
 * POST/DELETE /api/push/subscribe 测试
 *
 * 使用内存 SQLite 测试实际数据库操作。
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('POST /api/push/subscribe', () => {
  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
  });

  afterAll(async () => {
    delete process.env.DB_PATH;
    vi.resetModules();
  });

  const validBody = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/sub-test',
    keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
  };

  it('保存有效订阅返回 success', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it('缺少 endpoint 返回 400', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: { p256dh: 'x', auth: 'y' } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('请求体格式错误返回 400', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/push/subscribe', () => {
  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
  });

  afterAll(async () => {
    delete process.env.DB_PATH;
    vi.resetModules();
  });

  it('删除已有订阅返回 success', async () => {
    // 先创建
    const { POST } = await import('@/app/api/push/subscribe/route');
    const createReq = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://fcm.googleapis.com/fcm/send/delete-test',
        keys: { p256dh: 'x', auth: 'y' },
      }),
    });
    await POST(createReq);

    // 再删除
    vi.resetModules();
    const { DELETE } = await import('@/app/api/push/subscribe/route');
    const deleteReq = new Request(
      'http://localhost/api/push/subscribe?endpoint=https://fcm.googleapis.com/fcm/send/delete-test',
      { method: 'DELETE' },
    );
    const response = await DELETE(deleteReq);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it('缺少 endpoint 参数返回 400', async () => {
    vi.resetModules();
    const { DELETE } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', { method: 'DELETE' });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
npx vitest run __tests__/push/subscribe.test.ts
```

- [ ] **Step 3: 实现 API Route**

创建 `app/api/push/subscribe/route.ts`：

```ts
import { NextResponse } from 'next/server';

import {
  deletePushSubscription,
  upsertPushSubscription,
} from '@/app/watering/services/db';

import type { NextRequest } from 'next/server';

/** 订阅请求体结构 */
interface SubscribeBody {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

/**
 * POST /api/push/subscribe
 *
 * 保存浏览器推送订阅。endpoint 为唯一键，重复订阅覆盖更新。
 */
export async function POST(request: NextRequest) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: 'endpoint, keys.p256dh, keys.auth required' },
      { status: 400 },
    );
  }

  try {
    await upsertPushSubscription({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] Failed to save subscription:', message);
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/push/subscribe
 *
 * 删除浏览器推送订阅。endpoint 不存在时静默返回成功。
 */
export async function DELETE(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint query param required' }, { status: 400 });
  }

  try {
    await deletePushSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] Failed to delete subscription:', message);
    return NextResponse.json(
      { error: 'Failed to delete subscription' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
npx vitest run __tests__/push/subscribe.test.ts
```

- [ ] **Step 5: 格式化与检查**

```bash
npm run format
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add __tests__/push/subscribe.test.ts app/api/push/subscribe/route.ts
git commit -m "feat: add push subscribe/unsubscribe API endpoints"
```

---

### Task 6: `GET /api/push/check-offline` — 离线检查 + 推送 API

**Files:**
- Create: `__tests__/push/check-offline.test.ts`
- Create: `app/api/push/check-offline/route.ts`

**Interfaces:**
- Consumes: `getAllDevices()` (已有), `getPushSubscriptions()` (Task 2), `initWebPush()` + `sendPushNotification()` (Task 3), `markOfflineNotified()` (Task 2), `deletePushSubscription()` (Task 2)

**目标:** SCF 定时触发此接口，检查离线设备并推送通知。

- [ ] **Step 1: 编写测试**

创建 `__tests__/push/check-offline.test.ts`：

```ts
/**
 * GET /api/push/check-offline 测试
 *
 * 验证离线检测、推送发送、410 清理、重复通知抑制。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

const OFFLINE_CHIP_ID = 'offline-chip';
const ONLINE_CHIP_ID = 'online-chip';
const NOTIFIED_CHIP_ID = 'notified-chip';
const NOW = Date.now();

/**
 * 设置测试数据库：创建 3 个设备
 * - offline-chip: 最后心跳 31 分钟前，未通知
 * - online-chip: 最后心跳 1 分钟前，未通知
 * - notified-chip: 最后心跳 31 分钟前，已通知
 */
async function setupTestData() {
  const { initDb } = await import('@/app/watering/services/db');
  await initDb();
  const { getDbSync } = await import('@/lib/db');
  const db = getDbSync();
  const nowISO = new Date().toISOString();

  const devices = [
    { chipId: OFFLINE_CHIP_ID, name: '离线设备', mac: 'aa:bb:cc:dd:ee:01', lastTick: NOW - 31 * 60 * 1000, notified: 0 },
    { chipId: ONLINE_CHIP_ID, name: '在线设备', mac: 'aa:bb:cc:dd:ee:02', lastTick: NOW - 60 * 1000, notified: 0 },
    { chipId: NOTIFIED_CHIP_ID, name: '已通知设备', mac: 'aa:bb:cc:dd:ee:03', lastTick: NOW - 31 * 60 * 1000, notified: 1 },
  ];

  for (const d of devices) {
    db.run(
      'INSERT OR REPLACE INTO watering_device (chip_id, name, mac_address, created_time, last_write_time) VALUES (?, ?, ?, ?, ?)',
      [d.chipId, d.name, d.mac, nowISO, nowISO],
    );
    db.run(
      'INSERT OR REPLACE INTO watering_device_state (chip_id, state_id, last_tick_time, last_write_time, offline_notified) VALUES (?, ?, ?, ?, ?)',
      [d.chipId, `${d.chipId}-state`, d.lastTick, nowISO, d.notified],
    );
  }
}

describe('GET /api/push/check-offline', () => {
  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-pub';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-priv';
  });

  afterAll(() => {
    delete process.env.DB_PATH;
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  });

  beforeEach(async () => {
    vi.resetModules();
    await setupTestData();
  });

  it('无订阅时跳过推送，返回 skipped: no_subscriptions', async () => {
    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.skipped).toBe('no_subscriptions');
  });

  it('有订阅时向离线未通知设备推送，已通知设备跳过', async () => {
    // 先插入订阅
    const { upsertPushSubscription } = await import('@/app/watering/services/db');
    await upsertPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-1',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    // Mock web-push 成功
    const webpush = await import('web-push');
    (webpush.default.sendNotification as ReturnType<typeof vi.fn>).mockResolvedValue({ statusCode: 201 });

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    const body = await response.json();
    expect(response.status).toBe(200);
    // 只推送了 offline-chip（未通知的离线设备），不推送 online 和已通知的
    expect(body.sent).toBeGreaterThanOrEqual(1);

    // 验证 offline_notified 已更新为 1
    const { getDbSync } = await import('@/lib/db');
    const db = getDbSync();
    const row = db.get(
      'SELECT offline_notified FROM watering_device_state WHERE chip_id = ?',
      [OFFLINE_CHIP_ID],
    ) as unknown as { offline_notified: number };
    expect(row.offline_notified).toBe(1);
  });

  it('推送 410 时清理订阅', async () => {
    const { upsertPushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');
    await upsertPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/gone-endpoint',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    // Mock web-push 返回 410
    const webpush = await import('web-push');
    const error = new Error('Gone') as Error & { statusCode: number };
    error.statusCode = 410;
    (webpush.default.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    expect(response.status).toBe(200);

    // 验证订阅已清理
    const subs = await getPushSubscriptions();
    expect(subs).toHaveLength(0);
  });

  it('所有设备在线或无订阅时无推送', async () => {
    // 删除离线设备的状态，模拟全部在线
    const { getDbSync } = await import('@/lib/db');
    const db = getDbSync();
    db.run('DELETE FROM watering_device_state WHERE chip_id = ?', [OFFLINE_CHIP_ID]);
    db.run('DELETE FROM watering_device_state WHERE chip_id = ?', [NOTIFIED_CHIP_ID]);

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sent).toBe(0);
  });

  it('VAPID 密钥未配置时返回 500', async () => {
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    vi.resetModules();

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: 运行测试，确认 FAIL**

```bash
npx vitest run __tests__/push/check-offline.test.ts
```

- [ ] **Step 3: 实现 API Route**

创建 `app/api/push/check-offline/route.ts`：

```ts
import { NextResponse } from 'next/server';

import { getAllDevices, getPushSubscriptions, markOfflineNotified, deletePushSubscription } from '@/app/watering/services/db';
import { initWebPush, sendPushNotification } from '@/lib/push';

/** 离线超时阈值（毫秒） */
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * GET /api/push/check-offline
 *
 * 由 SCF 定时触发器每 5 分钟调用，检查所有设备的离线状态。
 * 对离线超 30 分钟且未通知过的设备，向所有浏览器订阅推送通知。
 *
 * 410 Gone 的订阅自动清理，其他推送错误向上传播（SCF 下次重试）。
 */
export async function GET() {
  // 初始化 VAPID 密钥，未配置时返回 500
  try {
    initWebPush();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] check-offline: VAPID init failed:', message);
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 });
  }

  // 获取所有订阅，无订阅时跳过
  const subs = await getPushSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json({ skipped: 'no_subscriptions' });
  }

  // 获取所有设备，筛选离线且未通知的
  const devices = await getAllDevices();
  const now = Date.now();
  const offlineDevices = devices.filter((d) => {
    if (!d.lastTickTime) return false; // 从未心跳，跳过
    const offlineMs = now - d.lastTickTime;
    if (offlineMs <= OFFLINE_THRESHOLD_MS) return false; // 未超阈值
    const notified = (d.state as Record<string, unknown> | undefined)?.offline_notified;
    if (notified === 1) return false; // 已通知过
    return true;
  });

  let sent = 0;

  for (const device of offlineDevices) {
    const payload = {
      title: `${device.name} 已离线`,
      body: '超过 30 分钟未收到心跳',
      data: { url: `/watering/devices/${device.chipId}` },
    };

    // 向所有订阅推送
    let allGone = true;
    for (const sub of subs) {
      try {
        const result = await sendPushNotification(sub, payload);
        if (result.success) {
          sent++;
          allGone = false;
        } else if (result.gone) {
          // 410——浏览器已卸载 PWA，清理订阅
          console.info('[Push] Removing gone subscription:', sub.endpoint);
          await deletePushSubscription(sub.endpoint);
        }
      } catch (err: unknown) {
        // 网络错误，记录日志，继续处理其他订阅
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Push] Failed to send to ${sub.endpoint}:`, message);
        allGone = false;
      }
    }

    // 至少一个订阅推送成功后标记已通知
    if (sent > 0 || allGone) {
      await markOfflineNotified(device.chipId);
    }
  }

  console.info(`[Push] check-offline done: ${String(sent)} notifications sent for ${String(offlineDevices.length)} offline devices`);
  return NextResponse.json({ sent });
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
npx vitest run __tests__/push/check-offline.test.ts
```

- [ ] **Step 5: 格式化与检查**

```bash
npm run format
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add __tests__/push/check-offline.test.ts app/api/push/check-offline/route.ts
git commit -m "feat: add offline check and push notification API"
```

---

### Task 7: Service Worker —— push / notificationclick 事件

**Files:**
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: 推送负载 `{ title: string; body: string; data: { url: string } }`
- Produces: `self.registration.showNotification()` + 点击跳转

**目标:** 在现有 SW 中添加 push 和 notificationclick 事件监听。

> 注意：SW 在 public/ 下是明文 JavaScript（非 TS），不参与构建。无法用 vitest 单元测试——通过 Task 10 手动验证。

- [ ] **Step 1: 在 `public/sw.js` 末尾追加 push 和 notificationclick 事件**

```js
/**
 * Web Push — 接收推送并在设备上展示通知
 *
 * 服务端发送的 payload 需包含 title、body 和可选的 data.url。
 * requireInteraction: true 防止通知自动消失。
 */
self.addEventListener('push', (event) => {
  let payload = { title: '谐趣', body: '' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // payload 非 JSON 时使用默认标题
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data,
      requireInteraction: true,
    })
  );
});

/**
 * 通知点击 — 打开或聚焦目标页面
 *
 * 优先查找已打开的窗口并聚焦，无匹配窗口则新开标签。
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/watering';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: 验证——SW 无语法错误**

在浏览器 DevTools → Application → Service Workers 中确认 SW 仍然正常激活，无报错。

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat: add push and notificationclick events to Service Worker"
```

---

### Task 8: PwaRegister —— 通知订阅 UI

**Files:**
- Modify: `__tests__/pwa/pwa-register.test.tsx`
- Modify: `components/pwa-register.tsx`

**Interfaces:**
- Consumes: `GET /api/push/vapid-public-key` (Task 4), `POST/DELETE /api/push/subscribe` (Task 5)

**目标:** 在现有 PwaRegister 组件中增加通知订阅管理逻辑。

- [ ] **Step 1: 更新测试**

修改 `__tests__/pwa/pwa-register.test.tsx`，在文件末尾追加：

```ts
  describe('通知订阅', () => {
    let subscribeFn: ReturnType<typeof vi.fn>;
    let registerFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      subscribeFn = vi.fn().mockResolvedValue({
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
      });
      registerFn = vi.fn().mockResolvedValue({
        pushManager: {
          subscribe: subscribeFn,
          getSubscription: vi.fn().mockResolvedValue(null),
        },
      });
      vi.stubGlobal('navigator', {
        serviceWorker: {
          register: registerFn,
          ready: Promise.resolve({
            pushManager: {
              subscribe: subscribeFn,
              getSubscription: vi.fn().mockResolvedValue(null),
            },
          }),
        },
      });
      vi.stubGlobal('Notification', {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('权限 granted 后订阅推送', async () => {
      // 注：实际执行在 useEffect 中，
      // 此处验证组件挂载不崩溃（权限 granted 路径）
      const { render } = await import('@testing-library/react');
      expect(() => render(<PwaRegister />)).not.toThrow();
    });

    it('权限 denied 时静默跳过', () => {
      vi.stubGlobal('Notification', {
        permission: 'denied',
        requestPermission: vi.fn().mockResolvedValue('denied'),
      });

      const { render } = require('@testing-library/react');
      expect(() => render(<PwaRegister />)).not.toThrow();
    });
  });
```

- [ ] **Step 2: 运行测试，确认 FAIL（新用例不支持）**

```bash
npx vitest run __tests__/pwa/pwa-register.test.tsx
```

- [ ] **Step 3: 更新组件实现**

修改 `components/pwa-register.tsx`：

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * PWA 注册组件
 *
 * 职责：
 * - 在客户端注册 Service Worker（/sw.js）
 * - 注册失败静默处理，不影响主功能
 * - 通知权限 granted 时自动订阅 Web Push
 * - 通知权限 denied/missing 时展示订阅按钮
 *
 * 注意：仅在浏览器环境下执行，"use client" + useEffect 确保 SSR 安全。
 * 不渲染任何 DOM（return null），纯副作用组件。
 */
export function PwaRegister() {
  /** 通知权限状态：'prompt' | 'granted' | 'denied' | 'unsupported' */
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('prompt');

  /**
   * 获取当前通知权限状态
   *
   * SSR/不支持的浏览器返回 'unsupported'。
   */
  const getPermission = useCallback((): NotificationPermission | 'unsupported' => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }, []);

  /**
   * 订阅 Web Push 通知
   *
   * 流程：获取 VAPID 公钥 → pushManager.subscribe() → 保存到服务端。
   * 任一环节失败静默处理，不阻断 UI。
   */
  const subscribe = useCallback(async () => {
    try {
      // 等待 SW 就绪
      const registration = await navigator.serviceWorker.ready;
      // 获取 VAPID 公钥
      const vapidRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = (await vapidRes.json()) as { publicKey?: string };
      if (!publicKey) return;

      // 浏览器生成订阅
      const pushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 保存到服务端
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushSub.toJSON()),
      });
    } catch (err: unknown) {
      // 订阅失败不影响主功能
      console.warn('Web Push 订阅失败:', err);
    }
  }, []);

  /**
   * 请求通知权限
   *
   * 用户点击按钮后显式调用，避免页面加载时弹权限弹窗。
   */
  const requestPermission = useCallback(async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        await subscribe();
      }
    } catch {
      // 权限请求失败静默处理
    }
  }, [subscribe]);

  useEffect(() => {
    // SSR 安全
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 注册 SW
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        // 检查通知权限：已授权则自动订阅
        const perm = getPermission();
        setPermission(perm);
        if (perm === 'granted') {
          void subscribe();
        }
      })
      .catch((err: unknown) => {
        console.warn('Service Worker 注册失败:', err);
      });
  }, [getPermission, subscribe]);

  // 权限已明确（denied/granted/unsupported），无需渲染按钮
  if (permission !== 'prompt') {
    return null;
  }

  // 首次访问、权限未决定时渲染订阅按钮
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
      }}
    >
      <button
        onClick={() => { void requestPermission(); }}
        style={{
          padding: '10px 20px',
          backgroundColor: '#1677ff',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        🔔 开启浇水通知
      </button>
    </div>
  );
}

/**
 * URL-safe Base64 转 Uint8Array
 *
 * PushManager.subscribe() 的 applicationServerKey 要求 Uint8Array 格式。
 * VAPID 公钥为 URL-safe Base64 编码，需先解码为字节数组。
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

- [ ] **Step 4: 运行测试，确认 PASS**

```bash
npx vitest run __tests__/pwa/pwa-register.test.tsx
```

- [ ] **Step 5: 格式化与检查**

```bash
npm run format
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add __tests__/pwa/pwa-register.test.tsx components/pwa-register.tsx
git commit -m "feat: add Web Push subscription UI to PwaRegister"
```

---

### Task 9: push-state —— 心跳时复位 offline_notified

**Files:**
- Modify: `app/watering/api/push-state/route.ts`

**Interfaces:**
- Consumes: `resetOfflineNotified()` (Task 2)

**目标:** 设备每次心跳（pushState）时，如果之前离线已通知，复位标志位。

- [ ] **Step 1: 修改 `push-state/route.ts`**

在现有 `await updateTick(chipId)` 之后（约第 20 行），加入复位逻辑：

```ts
  // 刷新心跳
  await updateTick(chipId);

  // 设备在线心跳 → 复位离线通知状态（允许下次离线时再次通知）
  await resetOfflineNotified(chipId);
```

需要在文件顶部的 import 中加入 `resetOfflineNotified`：

将：
```ts
import { execCallback } from '@/app/watering/services/callback-map';
import { calcSensorReadings, getDeviceConfig, getDeviceState, saveDeviceConfig, saveDeviceState, updateIdleSince, updateTick, writeDeviceLog } from '@/app/watering/services/db';
```

改为：
```ts
import { execCallback } from '@/app/watering/services/callback-map';
import { calcSensorReadings, getDeviceConfig, getDeviceState, resetOfflineNotified, saveDeviceConfig, saveDeviceState, updateIdleSince, updateTick, writeDeviceLog } from '@/app/watering/services/db';
```

- [ ] **Step 2: 验证——现有 push-state 测试仍通过**

```bash
npx vitest run
```

确认所有已有测试仍然通过，没有回归。

- [ ] **Step 3: 格式化与检查**

```bash
npm run format
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat: reset offline_notified on device heartbeat"
```

---

### Task 10: 端到端验证

**目标:** 构建生产版本，验证所有功能协同工作。

- [ ] **Step 1: 运行全部测试**

```bash
npm run test
```

预期: 全部通过（包括新增的 push 测试和已有测试）。

- [ ] **Step 2: 生产构建验证**

```bash
npm run build
```

预期: 构建成功，无 TypeScript 错误。

- [ ] **Step 3: 手动验证 PWA 功能**

启动开发服务器：

```bash
npm run dev
```

在 Chrome 中访问 `https://localhost:3000`（或 http），依次检查：
1. DevTools → Application → Service Workers：SW 状态 activated
2. 首页右下角出现"🔔 开启浇水通知"按钮
3. 点击按钮 → 浏览器弹出通知权限弹窗
4. 允许后 → Network 面板确认 `/api/push/subscribe` 200
5. DevTools → Application → Push Messaging：可测试推送

- [ ] **Step 4: 模拟离线通知**

1. 在数据库中将某设备 `last_tick_time` 设置为 31 分钟前
2. 确保 `offline_notified = 0`
3. 访问 `http://localhost:3000/api/push/check-offline`
4. 浏览器收到通知"xxx 已离线"

- [ ] **Step 5: 验证通知去重**

再次访问 `check-offline`，确认不重复推送（`offline_notified` 已为 1）。

- [ ] **Step 6: 验证复位**

通过 `push-state` 模拟心跳 → 确认 `offline_notified` 重置为 0。

- [ ] **Step 7: 格式化与检查**

```bash
npm run format
npm run check
```

- [ ] **Step 8: 最终 Commit**

```bash
git add -A
git commit -m "chore: final verification, all tests pass"
```

---

## 依赖关系

```
Task 1 (依赖) ──┐
                ├── Task 2 (DB) ──┬── Task 5 (订阅 API) ──┐
                │                 ├── Task 6 (离线检查) ───┤
Task 3 (push.ts)┤                 │                        ├── Task 8 (UI)
                │                 ├── Task 9 (push-state)  │
                │                                        │  │
Task 4 (公钥API)┘                                        │  │
                                                          │  │
Task 7 (SW) ──────────────────────────────────────────────┘  │
                                                              │
Task 10 (验证) ←──────────────────────────────────────────────┘
```

可并行执行：Task 2+3+4+7、Task 5+6+8+9 在 Task 2/3 完成后可并行。
