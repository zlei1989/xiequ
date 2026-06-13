# PWA 基础离线方案 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为"谐趣"应用添加 PWA 支持，实现手机桌面图标安装 + 断网离线兜底页。

**Architecture:** 零依赖方案。Next.js Metadata API 自动生成 manifest 标签，手动 Service Worker（`public/sw.js`）实现 Network First 策略，断网时返回 `/offline` 兜底页。客户端组件 `pwa-register.tsx` 在浏览器注册 SW。

**Tech Stack:** Next.js 16 Metadata API, Service Worker API, antd-mobile, vitest + jsdom

---

### Task 1: Service Worker（public/sw.js）

**Files:**
- Create: `public/sw.js`

- [ ] **Step 1: 编写 Service Worker 脚本**

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

- [ ] **Step 2: 提交**

```bash
git add public/sw.js
git commit -m "feat: add Service Worker for offline fallback"
```

---

### Task 2: 离线兜底页（app/offline/page.tsx）

**Files:**
- Create: `app/offline/page.tsx`
- Test: `__tests__/pwa/offline-page.test.tsx`

- [ ] **Step 1: 编写测试**

```tsx
/**
 * offline/page 组件测试
 *
 * 验证离线兜底页渲染"当前无网络连接"提示。
 */

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflinePage from '@/app/offline/page';

describe('OfflinePage', () => {
  it('渲染离线提示信息', () => {
    render(<OfflinePage />);

    // 应包含离线提示文本
    expect(screen.getByText('当前无网络连接')).toBeDefined();
  });

  it('包含重新加载按钮', () => {
    render(<OfflinePage />);

    const button = screen.getByRole('button', { name: /重新加载|重试/ });
    expect(button).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/pwa/offline-page.test.tsx
```

预期：FAIL — 模块不存在

- [ ] **Step 3: 实现离线兜底页**

```tsx
/**
 * 离线兜底页
 *
 * 当用户断网时，Service Worker 拦截导航请求并返回此页面。
 * 纯 Server Component，使用 antd-mobile 组件保持风格统一。
 */

import { Result, Button } from 'antd-mobile';

/**
 * 离线状态展示组件
 *
 * 显示网络断开提示和一个重新加载按钮。
 * 按钮点击后通过 window.location.reload() 尝试重新加载，
 * 若网络已恢复则正常渲染目标页面。
 */
export default function OfflinePage() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Result
        status="error"
        title="当前无网络连接"
        description="请检查网络设置后重试"
      />
      <div className="mt-4 text-center">
        {/* antd-mobile Button 在 Server Component 中需要 SSR 兼容层支持，
            此处使用原生 button 避免依赖 */}
        <a
          href="/"
          className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg no-underline"
        >
          重新加载
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/pwa/offline-page.test.tsx
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add app/offline/page.tsx __tests__/pwa/offline-page.test.tsx
git commit -m "feat: add offline fallback page"
```

---

### Task 3: SW 注册组件（components/pwa-register.tsx）

**Files:**
- Create: `components/pwa-register.tsx`
- Test: `__tests__/pwa/pwa-register.test.tsx`

- [ ] **Step 1: 编写测试**

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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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

    // 不应抛出异常
    expect(() => render(<PwaRegister />)).not.toThrow();
  });

  it('SSR 环境（无 navigator.serviceWorker）不崩溃', () => {
    vi.stubGlobal('navigator', {});

    expect(() => render(<PwaRegister />)).not.toThrow();
    expect(registerFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/pwa/pwa-register.test.tsx
```

预期：FAIL — 模块不存在

- [ ] **Step 3: 实现 PwaRegister 组件**

```tsx
'use client';

import { useEffect } from 'react';

/**
 * PWA 注册组件
 *
 * 职责：
 * - 在客户端注册 Service Worker（/sw.js）
 * - 注册失败静默处理，不影响主功能
 *
 * 注意：仅在浏览器环境下执行，"use client" + useEffect 确保 SSR 安全。
 * 不渲染任何 DOM（return null），纯副作用组件。
 */
export function PwaRegister() {
  useEffect(() => {
    // SSR 安全：无 window 或无 serviceWorker API 时跳过
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .catch(() => {
        // SW 注册失败不影响主功能，仅记录日志
        // 常见原因：非 HTTPS、浏览器不支持、private 模式限制
      });
  }, []);

  return null;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/pwa/pwa-register.test.tsx
```

预期：PASS

- [ ] **Step 5: 提交**

```bash
git add components/pwa-register.tsx __tests__/pwa/pwa-register.test.tsx
git commit -m "feat: add PWA Service Worker registration component"
```

---

### Task 4: Root Layout 集成

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: 更新 metadata 和引入 PwaRegister**

编辑 `app/layout.tsx`：

1. metadata 对象追加 PWA 相关字段
2. import PwaRegister
3. body 底部加入 `<PwaRegister />`

变更如下：

```diff
+ import { PwaRegister } from '../components/pwa-register';

  export const metadata: Metadata = {
    title: '谐趣',
    description: '浇花帮手、旅行计划、台岛遍历',
+   // PWA：手机桌面图标 + 全屏启动
+   manifest: '/manifest.webmanifest',
+   icons: {
+     icon: '/icons/icon-192.png',
+     apple: '/icons/icon-192.png',
+   },
+   appleWebApp: {
+     capable: true,
+     title: '谐趣',
+     statusBarStyle: 'black-translucent',
+   },
  };
```

```diff
          <ConfigProvider locale={zhCN}>
            <AntdMobileCompat />
            {children}
+           <PwaRegister />
          </ConfigProvider>
```

- [ ] **Step 2: 运行全部测试确保无回归**

```bash
npx vitest run
```

预期：所有已有测试 + 新增 PWA 测试全部 PASS

- [ ] **Step 3: 类型检查**

```bash
npm run typecheck
```

预期：无新增类型错误

- [ ] **Step 4: 提交**

```bash
git add app/layout.tsx
git commit -m "feat: integrate PWA metadata and SW registration into root layout"
```

---

### Task 5: 验证

> 此 Task 不修改代码，仅通过浏览器手动验证 PWA 功能。

- [ ] **Step 1: 构建生产版本**

```bash
npm run build
```

预期：构建成功，无错误

- [ ] **Step 2: 启动生产服务器**

```bash
npm start
```

- [ ] **Step 3: 验证 manifest**

Chrome DevTools → Application → Manifest：
- 名称："谐趣"
- 图标：192×192 正常显示
- 无报错

- [ ] **Step 4: 验证 Service Worker**

Application → Service Workers：
- 状态：activated
- Source：sw.js

- [ ] **Step 5: 验证离线兜底**

1. 正常访问任意页面
2. Network 面板 → 勾选 Offline
3. 刷新或导航到其他页面
4. 应显示"当前无网络连接"兜底页

- [ ] **Step 6: 验证桌面图标安装**

Android Chrome / iOS Safari：
- Android：应弹出"添加到主屏幕"提示（或通过菜单手动添加）
- iOS：分享 → "添加到主屏幕"
- 从桌面图标启动 → 全屏无地址栏

- [ ] **Step 7: 提交验证记录（可选）**

```bash
git add -A
git commit -m "chore: PWA verification complete"
```
