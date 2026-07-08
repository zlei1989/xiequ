# 移除 Web Push 功能设计

**日期：** 2026-07-09
**状态：** 已批准

## 背景

Web Push 离线通知功能（feat: Web Push 离线通知功能，d99180f）在目标浏览器上不受支持（Push API / Notification API 不可用，如 iOS Safari / 部分国产浏览器 / WebView），需要移除。

PWA 离线能力（Service Worker 离线兜底页、桌面图标 manifest）兼容性更好且与 Web Push 无直接关系，**予以保留**。删除范围仅限 Web Push 通知本身。

## 目标

- 移除所有 Web Push 订阅、通知、离线检查推送、VAPID 相关代码与依赖。
- 保留 PWA：Service Worker 注册、离线兜底页 `/offline`、`manifest.webmanifest`、桌面图标、`layout.tsx` PWA 元数据。
- 保持 `npm run test` / `check` / `build` 全绿。

## 非目标

- 不移除 PWA 离线能力。
- 不清理已部署数据库中的遗留表/列（留作无害孤儿，见下文）。
- 不修改腾讯云 SCF 控制台（库外操作，仅提醒）。

## 变更清单

### A. 整体删除的文件（纯 Web Push）

| 文件 | 说明 |
|------|------|
| `lib/push.ts` | web-push VAPID 封装（initWebPush / sendPushNotification / getVapidPublicKey） |
| `app/api/push/subscribe/route.ts` | 订阅存取 API |
| `app/api/push/vapid-public-key/route.ts` | VAPID 公钥暴露 API |
| `app/api/push/check-offline/route.ts` | 离线检查 + 推送 API |
| `__tests__/push/subscribe.test.ts` | 订阅 API 测试 |
| `__tests__/push/vapid-public-key.test.ts` | 公钥 API 测试 |
| `__tests__/push/check-offline.test.ts` | 离线检查测试 |
| `__tests__/push/db.test.ts` | push_subscriptions + offline_notified 数据库测试 |
| `__tests__/push/push.test.ts` | lib/push 测试 |

删除后 `app/api/push/` 与 `__tests__/push/` 目录清空，一并移除空目录。

### B. 部分删除（剥离 Web Push，保留 PWA）

#### `public/sw.js`
- 删除 `push` 事件监听（接收推送 + showNotification）。
- 删除 `notificationclick` 事件监听。
- **保留** install / activate / fetch（离线兜底页逻辑）。

#### `components/pwa-register.tsx`
- 剥离全部推送订阅逻辑：VAPID 公钥拉取、`pushManager.subscribe/unsubscribe`、通知权限状态机、`requestPermission`、`urlBase64ToUint8Array`、铃铛按钮 / 权限提示 UI。
- **瘦身为纯 Service Worker 注册**：`'use client'` + `useEffect` 中 `navigator.serviceWorker.register('/sw.js')`，注册失败静默处理，组件 `return null`（无渲染 UI）。
- 文件头注释同步更新为"仅注册 SW"。

#### `app/watering/services/db.ts`
- 删除 `push_subscriptions` 建表 DDL（initSchema 中的 CREATE TABLE）。
- 删除 `offline_notified` 列：`addColumn('watering_device_state', 'offline_notified', ...)`、`getAllDevices` SELECT 中的 `s.offline_notified as state_offline_notified`、`JoinRow` 中的 `state_offline_notified` 字段、映射行 `item.offlineNotified = ...`。
- 删除函数：`getPushSubscriptions`、`upsertPushSubscription`、`deletePushSubscription`、`markOfflineNotified`、`resetOfflineNotified`。
- 删除 `PushSubscriptionRow` 接口。

#### `app/watering/types.ts`
- 删除 `DeviceItem.offlineNotified` 字段及其注释。

#### `app/watering/api/push-state/route.ts`
- 从 import 中移除 `resetOfflineNotified`。
- 删除第 24 行 `await resetOfflineNotified(chipId);` 及其上方注释。

#### `.env.example`
- 删除"Web Push 通知"配置段（`WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY`）。

#### `package.json`
- 移除 `dependencies.web-push`。
- 移除 `devDependencies.@types/web-push`。
- 执行 `npm install` 重新生成 `package-lock.json`。

#### `__tests__/pwa/pwa-register.test.tsx`
- 现有用例均针对推送 UI（权限状态、铃铛按钮、订阅/取消）。瘦身后组件无 UI。
- 改写为最小冒烟测试：渲染 `<PwaRegister />` 不抛错、`serviceWorker.register` 被调用一次、`return null`（无可见文本）。

### C. 数据库遗留物处理（已决策：留作孤儿）

已部署数据库中 `push_subscriptions` 表与 `watering_device_state.offline_notified` 列已存在。本设计**只删除代码层的建表/建列/读写引用**：
- 新库初始化不再创建该表/列。
- 旧库残留一张空表 + 一个死列，无害、零风险、改动最小。

不执行 `DROP TABLE` / `DROP COLUMN`（避免在生产库上跑 DDL 的风险）。

### D. 不改动的部分

- PWA 离线兜底页 `/offline`（`app/offline/`）。
- `public/manifest.webmanifest`。
- `app/layout.tsx` 的 PWA 元数据（manifest、appleWebApp、icons）与 `<PwaRegister />` 挂载点。
- `public/icons/*`。
- `docs/` 下历史 Web Push 规格/计划文档（作为历史记录保留）。

## 库外事项（仅提醒，无法在代码内完成）

腾讯云 SCF 上定时调用 `GET /api/push/check-offline` 的**定时触发器**需手动在控制台删除，否则会每 5 分钟触发 404。

## 验证策略

顺序执行，全部通过方视为完成：

1. `npm run test` — 移除 push 测试后全部用例通过（无对已删函数/文件的悬空 import）。
2. `npm run format` — ESLint + Stylelint 自动修复。
3. `npm run check` — TypeScript 类型检查 + Lint 无错误（重点：无未使用 import、无对已删符号的引用）。
4. `npm run build` — Next.js standalone 生产构建通过。

## 风险

| 风险 | 缓解 |
|------|------|
| 删除 `db.ts` 函数后有悬空引用 | `npm run check` 类型检查兜底；已确认引用点仅 push-state 与 push API |
| `pwa-register.tsx` 瘦身破坏 PWA 注册 | 保留 SW 注册核心逻辑；冒烟测试验证 register 调用 |
| 移除依赖后 lock 不一致 | `npm install` 重生成 lock，`npm run build` 验证 |
| 遗留孤儿表/列引发困惑 | 本文档记录为已知无害遗留 |
