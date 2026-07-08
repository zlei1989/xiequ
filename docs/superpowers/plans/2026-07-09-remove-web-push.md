# 移除 Web Push 功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除全部 Web Push 订阅/通知/离线检查/VAPID 代码与依赖，保留 PWA 离线能力。

**Architecture:** 纯删除任务。分四步按依赖顺序拆除：先删消费者（API 路由 + lib/push），再剥离前端 SW/组件里的推送部分，再删数据库层生产者（表/列/函数）与类型及其调用点，最后移除 npm 依赖与环境变量。每步以现有测试套件保持全绿 + 类型检查通过为验证，PWA（Service Worker 注册、离线兜底页、manifest、图标）全程不动。

**Tech Stack:** Next.js 16 App Router, SQLite (node-sqlite3-wasm), vitest, TypeScript

## Global Constraints

- **包管理器仅用 npm**（pnpm 符号链接与 standalone 不兼容）。
- **改动后进入审查前顺序执行：** `npm run format` → `npm run check` → 修复所有错误。
- 注释风格：TS/TSX 用 JSDoc（`/** ... */`），中文，先说"做什么"再说"怎么做"。
- **不删除** PWA：`app/offline/`、`public/manifest.webmanifest`、`public/icons/*`、`app/layout.tsx` 的 PWA 元数据与 `<PwaRegister />` 挂载点、`public/sw.js` 的 install/activate/fetch。
- **数据库遗留物留作孤儿**：只删代码层建表/建列/读写，不执行 `DROP TABLE`/`DROP COLUMN`。
- 本任务为删除，无"先写失败测试"环节；验证 = 删除后 `npm run test` 与 `npm run check` 全绿（无悬空 import / 无对已删符号的引用）。

---

### Task 1: 删除 Web Push API 路由、lib/push.ts 及对应测试

**Files:**
- Delete: `app/api/push/subscribe/route.ts`
- Delete: `app/api/push/vapid-public-key/route.ts`
- Delete: `app/api/push/check-offline/route.ts`
- Delete: `lib/push.ts`
- Delete: `__tests__/push/subscribe.test.ts`
- Delete: `__tests__/push/vapid-public-key.test.ts`
- Delete: `__tests__/push/check-offline.test.ts`
- Delete: `__tests__/push/push.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `app/api/push/` 目录清空移除；`lib/push.ts` 不复存在。`components/pwa-register.tsx` 通过 `fetch('/api/push/...')` 字符串引用这些端点（运行时，非编译期），Task 2 处理。`app/watering/services/db.ts` 中 `getPushSubscriptions`/`upsertPushSubscription`/`deletePushSubscription`/`markOfflineNotified` 在本任务后成为未被引用的导出（无 lint 错误），Task 3 删除。

- [ ] **Step 1: 删除路由、lib 与 4 个测试文件**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
git rm app/api/push/subscribe/route.ts \
       app/api/push/vapid-public-key/route.ts \
       app/api/push/check-offline/route.ts \
       lib/push.ts \
       __tests__/push/subscribe.test.ts \
       __tests__/push/vapid-public-key.test.ts \
       __tests__/push/check-offline.test.ts \
       __tests__/push/push.test.ts
```

- [ ] **Step 2: 清理空目录**

`git rm` 已移除文件；删除残留空目录（若存在）：

```bash
rmdir app/api/push/subscribe app/api/push/vapid-public-key app/api/push/check-offline app/api/push 2>/dev/null || true
```

说明：`__tests__/push/` 目录此时仍含 `db.test.ts`，不删除。

- [ ] **Step 3: 运行测试确认剩余用例通过**

Run: `npm run test`
Expected: PASS。push 路由/lib 相关测试文件已移除；`__tests__/push/db.test.ts`（仍引用 db.ts 中尚存的 `upsertPushSubscription` 等）与其余测试全部通过。

- [ ] **Step 4: 类型检查确认无悬空引用**

Run: `npm run check`
Expected: PASS。无对 `@/lib/push` 或已删路由的悬空 import（仅这 3 个路由 import 过 `@/lib/push`，均已删除）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: 删除 Web Push API 路由与 lib/push"
```

---

### Task 2: 剥离 Service Worker 与 pwa-register 中的推送逻辑（保留 PWA）

**Files:**
- Modify: `public/sw.js`（删除 push + notificationclick 监听，保留 install/activate/fetch）
- Modify: `components/pwa-register.tsx`（瘦身为纯 SW 注册）
- Modify: `__tests__/pwa/pwa-register.test.tsx`（删除"通知订阅"describe 块 + 未使用的 `waitFor` import）

**Interfaces:**
- Consumes: 无编译期依赖。
- Produces: `PwaRegister` 组件仅注册 `/sw.js` 并 `return null`；不再调用 `/api/push/*`（Task 1 已删这些端点，本任务消除调用方，恢复一致）。

- [ ] **Step 1: 删除 `public/sw.js` 的推送监听**

将 `public/sw.js` 第 38 行起到文件末尾（`push` 与 `notificationclick` 两个监听）整段删除，使文件在 `fetch` 监听结束（第 36 行的 `});`）后即结束。删除后 `public/sw.js` 完整内容为：

```js
/**
 * Service Worker — 基础离线兜底
 *
 * 策略：Network First（仅导航请求），失败时返回离线兜底页。
 * 静态资源（JS/CSS/图片）不拦截，走浏览器默认缓存。
 */

const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  // 预缓存离线兜底页
  event.waitUntil(
    caches.open('offline-v1').then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
  // 安装完成后立即激活，不等待旧 SW 关闭
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 接管所有页面
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 仅处理导航请求（页面跳转）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // 网络失败时返回缓存的离线兜底页
        return caches.match(OFFLINE_URL);
      })
    );
  }
});
```

- [ ] **Step 2: 瘦身 `components/pwa-register.tsx`**

用以下完整内容替换 `components/pwa-register.tsx`：

```tsx
'use client';

import { useEffect } from 'react';

/**
 * PWA Service Worker 注册组件
 *
 * 职责：在客户端注册 Service Worker（/sw.js），提供离线兜底能力。
 * 注册失败静默处理，不影响主功能。
 *
 * 注意：仅在浏览器环境执行，"use client" + useEffect 确保 SSR 安全。
 */
export function PwaRegister() {
  useEffect(() => {
    // SSR 安全：仅在支持 Service Worker 的浏览器环境注册
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 注册失败不影响主功能，静默记录
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('Service Worker 注册失败:', err);
    });
  }, []);

  // 无可见 UI
  return null;
}
```

- [ ] **Step 3: 精简 `__tests__/pwa/pwa-register.test.tsx`**

删除第二个 `describe('通知订阅', ...)` 块（当前第 54–129 行整段），并将顶部 import 中未再使用的 `waitFor` 移除。替换后完整内容为：

```tsx
/**
 * PwaRegister 组件测试
 *
 * 验证 Service Worker 注册逻辑：
 * - 支持 SW 的浏览器应调用 register
 * - 不支持时应静默跳过（不抛出异常）
 * - 注册失败时 catch 错误
 */

// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaRegister } from '@/components/pwa-register';

describe('PwaRegister', () => {
  let registerFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registerFn = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: registerFn,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('在浏览器中注册 Service Worker', () => {
    render(<PwaRegister />);

    expect(registerFn).toHaveBeenCalledWith('/sw.js');
  });

  it('注册失败时不抛出异常', () => {
    registerFn.mockRejectedValue(new Error('SW registration failed'));

    // 不应抛出异常（catch 在 useEffect 中异步执行，jsdom 中不触发）
    expect(() => render(<PwaRegister />)).not.toThrow();
  });

  it('SSR 环境（无 navigator.serviceWorker）不崩溃', () => {
    vi.stubGlobal('navigator', {});

    expect(() => render(<PwaRegister />)).not.toThrow();
    expect(registerFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 运行 pwa 测试确认通过**

Run: `npm run test -- __tests__/pwa/pwa-register.test.tsx`
Expected: PASS，3 个用例全绿。

- [ ] **Step 5: 类型检查**

Run: `npm run check`
Expected: PASS。无未使用 import（`waitFor` 已移除），组件无对推送 API 的引用。

- [ ] **Step 6: Commit**

```bash
git add public/sw.js components/pwa-register.tsx __tests__/pwa/pwa-register.test.tsx
git commit -m "refactor: 剥离 SW 与 pwa-register 中的 Web Push，保留 PWA 离线能力"
```

---

### Task 3: 移除数据库层推送函数、offline_notified、类型与 push-state 调用

**Files:**
- Delete: `__tests__/push/db.test.ts`
- Modify: `app/watering/api/push-state/route.ts`（移除 `resetOfflineNotified` import 与调用）
- Modify: `app/watering/services/db.ts`（删除 push_subscriptions 表、offline_notified 列相关引用、5 个函数、PushSubscriptionRow 接口）
- Modify: `app/watering/types.ts`（删除 `DeviceItem.offlineNotified`）

**Interfaces:**
- Consumes: 无。
- Produces: `db.ts` 不再导出 `getPushSubscriptions`/`upsertPushSubscription`/`deletePushSubscription`/`markOfflineNotified`/`resetOfflineNotified`；`DeviceItem` 不再含 `offlineNotified`。删除后 `__tests__/push/` 目录清空移除。

- [ ] **Step 1: 删除数据库测试（引用了待删函数，先删避免悬空）**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
git rm __tests__/push/db.test.ts
rmdir __tests__/push 2>/dev/null || true
```

- [ ] **Step 2: 移除 `push-state/route.ts` 的心跳复位调用**

在 `app/watering/api/push-state/route.ts` 中：

其一，从第 4 行 import 里移除 `resetOfflineNotified`（其余保持不变）：

```ts
import { calcSensorReadings, getDeviceConfig, getDeviceState, saveDeviceConfig, saveDeviceState, updateIdleSince, updateTick, writeDeviceLog } from '@/app/watering/services/db';
```

其二，删除以下两行（原第 23–24 行，`updateTick` 调用之后、`parseGpioParams` 之前）：

```ts
  // 设备在线心跳 → 复位离线通知状态（允许下次离线时再次通知）
  await resetOfflineNotified(chipId);
```

- [ ] **Step 3: 删除 `db.ts` 中 JoinRow 的 offline_notified 字段**

在 `app/watering/services/db.ts` 的 `JoinRow` 接口中删除这两行（原第 68–69 行）：

```ts
  /** s.offline_notified */
  state_offline_notified: number | null;
```

- [ ] **Step 4: 删除 `db.ts` 迁移段的 offline_notified 列与 push_subscriptions 建表**

删除以下整段（原第 218–230 行，位于 `addColumn(...)` 迁移调用之后）：

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

删除后该函数在 `addColumn('watering_device_state', 'last_action_finished_at', 'INTEGER');` 之后直接以 `}` 结束。

- [ ] **Step 5: 删除 `db.ts` 的 getAllDevices SELECT 与映射中的 offline_notified**

其一，删除 SELECT 中的这一行（原第 246 行）：

```ts
           s.offline_notified as state_offline_notified,
```

其二，删除映射赋值（原第 290 行）：

```ts
      item.offlineNotified = row.state_offline_notified ?? undefined;
```

- [ ] **Step 6: 删除 `db.ts` 尾部的推送相关接口与 5 个函数**

删除文件末尾整段：`PushSubscriptionRow` 接口 + `getPushSubscriptions` + `upsertPushSubscription` + `deletePushSubscription` + `markOfflineNotified` + `resetOfflineNotified`（原第 695–780 行，即 `hasLogAtTriggerTime` 之类函数结束后的所有内容）。删除的起始锚点为：

```ts
/** push_subscriptions 原始行 */
interface PushSubscriptionRow {
```

删除的结束锚点为文件最后一行 `resetOfflineNotified` 函数体的收尾 `}`。删除后文件以其上一个函数的 `}` 结束。

- [ ] **Step 7: 删除 `types.ts` 的 offlineNotified 字段**

在 `app/watering/types.ts` 的 `DeviceItem` 类型中删除这两行（原第 182–183 行）：

```ts
  /** 离线通知是否已发送（0=未通知, 1=已通知），用于抑制重复推送 */
  offlineNotified?: number;
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npm run test`
Expected: PASS。db.test.ts 已删；无测试引用已删函数/字段。

- [ ] **Step 9: 类型检查确认无悬空引用**

Run: `npm run check`
Expected: PASS。`push-state` 不再引用 `resetOfflineNotified`；无组件/测试引用 `offlineNotified`；`getDbSync`/`addColumn` 等共享辅助仍被其他函数使用，不会变为未使用。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: 移除数据库层 Web Push 订阅、offline_notified 与心跳复位"
```

---

### Task 4: 移除 web-push 依赖与环境变量，最终构建验证

**Files:**
- Modify: `package.json`（移除 `web-push` 与 `@types/web-push`）
- Modify: `package-lock.json`（`npm install` 重生成）
- Modify: `.env.example`（删除 Web Push VAPID 配置段）

**Interfaces:**
- Consumes: 无（Task 1 已删除唯一 import `web-push` 的 `lib/push.ts`）。
- Produces: 依赖树不再含 web-push；生产构建通过。

- [ ] **Step 1: 移除 package.json 依赖**

在 `package.json` 中删除 `dependencies` 里的 `"web-push": "^3.6.7"`（注意同时处理其上一行 `"tailwindcss"` 行尾逗号，使 JSON 合法——`web-push` 是 dependencies 最后一项）；删除 `devDependencies` 里的 `"@types/web-push": "^3.6.4",`。

删除后 `dependencies` 末尾为：

```json
    "recharts": "^3.8.1",
    "tailwindcss": "^3.4.0"
  },
```

- [ ] **Step 2: 删除 .env.example 的 Web Push 段**

在 `.env.example` 中删除这一段（原第 36–39 行，含其上方空行到 Admin 段之间）：

```
# ─── Web Push 通知 ──────────────────────────────
# 运行 `npx web-push generate-vapid-keys` 生成
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
```

- [ ] **Step 3: 重新生成 lock 文件**

Run: `npm install`
Expected: 成功，`package-lock.json` 更新，移除 `web-push` 及其子依赖（`@types/web-push`、`https-proxy-agent` 等）。

- [ ] **Step 4: 格式化**

Run: `npm run format`
Expected: 成功，无残留错误。

- [ ] **Step 5: 类型检查 + Lint**

Run: `npm run check`
Expected: PASS。

- [ ] **Step 6: 全量测试**

Run: `npm run test`
Expected: PASS，全部用例通过。

- [ ] **Step 7: 生产构建验证**

Run: `npm run build`
Expected: Next.js standalone 构建成功，无对 web-push / 已删路由的引用错误。

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: 移除 web-push 依赖与 VAPID 环境变量"
```

---

## 库外事项（仅提醒，无法在代码内完成）

腾讯云 SCF 上定时调用 `GET /api/push/check-offline` 的**定时触发器**需手动在控制台删除，否则会每 5 分钟触发 404。执行完本计划后提醒用户处理。

## Self-Review

**Spec coverage：**
- 整体删除文件（lib/push、3 路由、5 测试）→ Task 1 + Task 3（db.test.ts）。✓
- sw.js 剥离 push → Task 2 Step 1。✓
- pwa-register 瘦身 → Task 2 Step 2；其测试 → Task 2 Step 3。✓
- db.ts 表/列/函数/接口/SELECT/映射 → Task 3 Step 3–6。✓
- types.ts offlineNotified → Task 3 Step 7。✓
- push-state resetOfflineNotified → Task 3 Step 2。✓
- .env.example / package.json / lock → Task 4。✓
- 数据库留作孤儿（不 DROP）→ 全程未加 DROP 语句。✓
- 不动 PWA（offline/manifest/icons/layout 元数据）→ 未列入任何删除步骤。✓
- SCF 触发器提醒 → 库外事项。✓

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码。✓

**Type consistency：** 删除的符号名（`resetOfflineNotified`、`markOfflineNotified`、`getPushSubscriptions`、`upsertPushSubscription`、`deletePushSubscription`、`state_offline_notified`、`offlineNotified`）在各任务间一致；无新增类型。✓
