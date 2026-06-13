# PWA 基础离线方案

> 日期：2026-06-13 | 状态：设计完成

## 目标

为"谐趣"应用添加 PWA 支持，实现：
1. 手机桌面独立图标（Android "添加到主屏幕" / iOS "添加到主屏幕"）
2. 全屏启动体验（无浏览器地址栏）
3. 网络断开时展示友好离线兜底页，不白屏

## 技术选型

**方案：Next.js Metadata API + 手动 Service Worker**

- 零额外依赖，利用 Next.js 16 内置的 `metadata.manifest` + `metadata.icons` 自动生成 PWA 标签
- Service Worker 手动编写，仅 ~30 行，策略清晰可控
- 与现有 standalone 输出模式完全兼容

拒绝的方案：
- `@serwist/next`：依赖重、配置复杂，对"仅需基础离线"过度设计
- 纯手动 manifest.json：无类型安全，与现有 metadata 体系割裂

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/layout.tsx` | 修改 | 补充 manifest、icons、appleWebApp 等 metadata 字段；body 底部引入 PwaRegister |
| `app/offline/page.tsx` | 新增 | 离线兜底页，Server Component |
| `components/pwa-register.tsx` | 新增 | "use client" 组件，注册 Service Worker |
| `public/sw.js` | 新增 | Service Worker 脚本，Network First 策略 |
| `public/icons/icon-192.png` | 已就绪 | PWA 图标 192×192 |
| `public/icons/icon-512.png` | 已就绪 | PWA 图标 512×512 |

## 架构设计

### 1. Manifest 生成（layout.tsx metadata）

```ts
export const metadata: Metadata = {
  title: '谐趣',
  description: '浇花帮手、旅行计划、台岛遍历',
  manifest: '/manifest.webmanifest',    // Next.js 内部路由自动生成
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    title: '谐趣',
    statusBarStyle: 'black-translucent',
  },
};
```

Next.js 16 构建时自动将以上字段转换为 HTML `<link>` 和 `<meta>` 标签，standalone 模式同样生效。

### 2. Service Worker（public/sw.js）

- **预缓存**：install 事件中缓存 `/offline` 页面
- **拦截策略**：仅拦截 `navigate` 请求（页面跳转），静态资源走浏览器自身缓存
- **兜底逻辑**：Network First → 网络失败时返回缓存的 `/offline`
- **生命周期**：`skipWaiting()` + `clients.claim()` 确保新 SW 立即接管

```
fetch (navigate) → 尝试网络请求 → 成功返回正常页面
                                  → 失败返回缓存 /offline
fetch (其他)     → 不拦截，浏览器默认行为
```

### 3. 离线兜底页（app/offline/page.tsx）

- antd-mobile `Result` 组件，展示"当前无网络连接"提示
- "重新加载"按钮 → `window.location.reload()`
- 纯 Server Component，无客户端依赖

### 4. SW 注册（components/pwa-register.tsx）

- `"use client"` 组件，`useEffect` 中执行注册
- 无 UI 渲染（`return null`）
- 注册失败静默处理，不影响主功能
- 在 `layout.tsx` body 底部引用，全站一次性加载

## 测试清单

| 测试项 | 验证方式 |
|--------|----------|
| manifest 正常生成 | DevTools → Application → Manifest |
| SW 注册成功 | Application → Service Workers，状态 activated |
| 离线兜底生效 | Network 面板勾选 Offline，刷新 → 显示兜底页 |
| PWA 可安装 | Chrome Android："添加到主屏幕"提示；iOS Safari：分享 → 添加到主屏幕 |
| 桌面图标全屏启动 | 从桌面图标打开 → 无浏览器地址栏 |
| 非导航请求不受影响 | API、静态资源正常加载 |

## 已知限制

- **iOS 限制**：不支持 `beforeinstallprompt`，用户需手动通过 Safari 分享菜单添加
- **首次访问**：需在线访问一次，SW 才能安装和缓存
- **SW 更新**：SW 文件内容变化才触发更新（本场景极少变更）
