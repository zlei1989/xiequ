# Web Push 离线通知方案

> 日期：2026-07-06 | 状态：设计完成

## 目标

为"谐趣"PWA 添加 Web Push 通知能力，首期实现：
- **设备离线超过 30 分钟** → 推送通知 → 通知一次后不再重复
- 设备恢复在线时清空通知状态，下次离线可重新通知

## 技术选型

**方案：web-push（零子依赖 Node 库）+ SCF 定时触发器**

- 使用 `web-push` npm 包（~2KB，零子依赖）处理 VAPID 签名和推送
- 腾讯云 SCF timer trigger 定时调用离线检查 API
- 浏览器端通过 Push API + Service Worker 接收并展示通知
- 与现有 PWA 基础设施（`public/sw.js`、`components/pwa-register.tsx`）无缝集成

## 架构设计

```
SCF 定时触发器 (每 5 分钟)
        │
        ▼
GET /api/push/check-offline
        │
        │  查询所有设备：lastTickTime > 30分钟前
        │  AND offline_notified = 0
        │
        ▼
  web-push 库发送推送 ──────→ 浏览器推送服务 ──→ SW push 事件
        │                                               │
        │ 更新 offline_notified = 1                showNotification()
        │                                               │
        ▼                                          点击通知 → 打开应用
  用户手机弹出通知
```

**重置链路**：

```
设备 heartbeat → push-state API → offline_notified 复位为 0
```

## 数据模型

### watering_device_state 新增字段

```sql
ALTER TABLE watering_device_state ADD COLUMN offline_notified INTEGER DEFAULT 0;
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `offline_notified` | INTEGER | 0=未通知(或已复位), 1=已通知 |

### push_subscriptions 新表

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_time TEXT NOT NULL
);
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `endpoint` | TEXT | 浏览器推送服务端点 UNIQUE |
| `p256dh_key` | TEXT | 客户端公钥 |
| `auth_key` | TEXT | 客户端认证密钥 |
| `created_time` | TEXT | ISO 8601 创建时间 |

> 一个浏览器/PWA 实例产生一条订阅记录。通知时遍历所有订阅逐个推送。后续引入用户系统时加 `user_id` 字段即可。

## API 设计

### 1. `GET /api/push/vapid-public-key`

返回 VAPID 公钥，客户端订阅时使用。

```
响应: { publicKey: "..." }
```

### 2. `POST /api/push/subscribe`

保存浏览器推送订阅。

```
请求: { endpoint, keys: { p256dh, auth } }
响应: { success: true }
```

### 3. `DELETE /api/push/subscribe`

删除订阅。查询参数 `?endpoint=...`。

```
响应: { success: true }
```

### 4. `GET /api/push/check-offline`

离线检查（SCF 定时触发，每 5 分钟调用一次）。

**逻辑**：
1. 查询所有设备（`getAllDevices()`）
2. 筛选条件：`lastTickTime` 存在 **且** `(now - lastTickTime) > 30分钟` **且** `offline_notified === 0`
3. 对每个符合条件的设备，向所有订阅发送 Web Push（title=`{设备名} 已离线`, body=`超过 30 分钟未收到心跳`）
4. 推送成功后将 `offline_notified` 更新为 1
5. 推送失败（如 410 Gone）清理无效订阅记录

### 5. 修改 `POST /watering/api/push-state`

在现有心跳更新逻辑中追加：`offline_notified === 1` 时复位为 0。

## Service Worker 改动

在现有 `public/sw.js` 中新增：

```js
self.addEventListener('push', (event) => {
  const payload = event.data?.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data,
      requireInteraction: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/watering'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
```

## VAPID 密钥管理

- 私钥存 `.env.local`：`WEB_PUSH_VAPID_PRIVATE_KEY`
- 公钥存 `.env.local`：`WEB_PUSH_VAPID_PUBLIC_KEY`（不敏感，也通过 API 暴露给前端）
- 生成命令：`npx web-push generate-vapid-keys`
- 新增依赖：`web-push`（npm），`@types/web-push`（devDependencies）

## 前端 UI

### `components/pwa-register.tsx` 改动

在现有 SW 注册逻辑基础上增加通知订阅管理：

1. 注册 SW 后检查 `Notification.permission`
2. 权限为 `default` → 展示"开启通知"按钮
3. 权限为 `granted` → 自动订阅（调用 `pushManager.subscribe()`）
4. 订阅成功后 POST 到 `/api/push/subscribe`
5. 取消订阅时 DELETE `/api/push/subscribe?endpoint=...`

UI 形态：首页环境下可放置一个轻量开关/BellIcon 按钮。首次不弹浏览器权限弹窗，等用户主动点击按钮后再请求权限（降低骚扰感，提高授权率）。

## SCF 定时触发器配置

在 SCF 控制台为函数添加 timer trigger：

| 参数 | 值 |
|------|-----|
| 触发方式 | 定时触发 |
| Cron 表达式 | `*/5 * * * *` |
| 触发消息 | `{"path": "/api/push/check-offline"}` |

> 每 5 分钟粒度在 30 分钟离线阈值下足够精细，且不会给 SCF 带来多余开销。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.env.local` | 修改 | 新增 `WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY` |
| `package.json` | 修改 | 新增 `web-push` 依赖、`@types/web-push` devDeps |
| `app/watering/services/db.ts` | 修改 | `initDb()` 新增 `push_subscriptions` 表 + `offline_notified` 列；新增 `getPushSubscriptions()`、`upsertPushSubscription()`、`deletePushSubscription()`、`markOfflineNotified()`、`resetOfflineNotified()` |
| `public/sw.js` | 修改 | 新增 `push`、`notificationclick` 事件 |
| `components/pwa-register.tsx` | 修改 | 新增通知订阅/取消逻辑，含权限请求和订阅持久化 |
| `app/api/push/vapid-public-key/route.ts` | 新增 | GET 返回 VAPID 公钥 |
| `app/api/push/subscribe/route.ts` | 新增 | POST 保存订阅、DELETE 删除订阅 |
| `app/api/push/check-offline/route.ts` | 新增 | 离线检查 + Web Push 推送 |
| `app/watering/api/push-state/route.ts` | 修改 | 心跳后复位 `offline_notified` |
| `lib/push.ts` | 新增 | Web Push 工具函数（发送推送、初始化 web-push） |
| `__tests__/push/` | 新增 | 推送相关单元和 API 测试 |

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| 用户拒绝通知权限 | 静默跳过，UI 显示"通知已关闭"，不影响其他功能 |
| 设备从未心跳 | `lastTickTime` 为 undefined/null，跳过不通知 |
| 同一离线重复通知 | `offline_notified` 标志位确保只推一次 |
| 上线后再次离线 | 心跳复位 `offline_notified = 0`，重新开始 30 分钟计时 |
| VAPID 密钥未配置 | `check-offline` 返回 500 + 日志告警 |
| 浏览器已卸载 PWA | 推送返回 410 Gone，清理无效订阅 |
| 多浏览器订阅 | 遍历所有订阅逐个推送，单个失败不影响其他 |
| SCF 冷启动 | 轻量操作（一次 SQL 查询 + N 次 HTTP），冷启动延迟可忽略 |
| 通知点击 | 打开设备详情页 `/watering/devices/{chipId}` |
| HTTPS 要求 | PWA 部署在腾讯云提供 HTTPS，天然满足 |

## 测试策略

| 层级 | 内容 |
|------|------|
| 单元测试 | `lib/push.ts` 推送构造、离线判断逻辑（Mock 时间） |
| API 测试 | `/api/push/check-offline`：离线设备推送、无离线不推送、已通知不重复、无订阅跳过、410 清理 |
| 组件测试 | `PwaRegister` 订阅开关（Mock Notification API + PushManager） |
| SW 测试 | `push` 事件 → `showNotification`；`notificationclick` → `clients.openWindow` |
