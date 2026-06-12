# 移动端返回键关闭弹窗 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `useBackButton` hook，按移动端返回键时以 LIFO 栈式关闭 antd-mobile Popup 弹窗。

**Architecture:** 模块级全局栈维护弹窗关闭回调，全局唯一 popstate 监听器。首次弹窗打开时 pushState 占位，返回键触发栈顶回调关闭弹窗，栈空时清理监听器。

**Tech Stack:** React 19, TypeScript, vitest + @testing-library/react + jsdom

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `lib/back-button.ts` | 新增 | 全局弹窗返回栈 + `useBackButton` hook |
| `__tests__/lib/back-button.test.ts` | 新增 | 栈行为、hook 生命周期、边界情况测试 |
| `app/travel/components/location-view-popup.tsx` | 修改 | +2 行接入 hook |
| `app/travel/components/location-edit-popup.tsx` | 修改 | +2 行接入 hook |
| `app/travel/components/moment-edit-popup.tsx` | 修改 | +2 行接入 hook |
| `app/travel/components/search-popup.tsx` | 修改 | +2 行接入 hook |
| `package.json` | 修改 | 新增 devDependencies |

---

### Task 1: 安装测试依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 @testing-library/react 和 jsdom**

```bash
npm install -D @testing-library/react jsdom
```

- [ ] **Step 2: 验证安装成功**

```bash
node -e "require('@testing-library/react'); console.log('OK')"
```

Expected: 输出 `OK`

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 安装 @testing-library/react 和 jsdom 测试依赖"
```

---

### Task 2: 创建 useBackButton hook（TDD）

**Files:**
- Create: `lib/back-button.ts`
- Create: `__tests__/lib/back-button.test.ts`

- [ ] **Step 1: 编写测试文件 `__tests__/lib/back-button.test.ts`**

```ts
/**
 * useBackButton hook 单元测试
 *
 * 测试模块级全局栈行为：push/pop、LIFO 关闭顺序、闭包过期保护、
 * 组件卸载清理、SSR guard。
 *
 * 每个测试用例前通过 vi.resetModules() 隔离模块级状态，
 * 通过 vi.stubGlobal('window', ...) 模拟浏览器 API。
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/** 存储通过 addEventListener 注册的事件处理器 */
let eventListeners: Record<string, EventListener[]>;
/** mock 的 history.pushState */
let pushState: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  eventListeners = {};
  pushState = vi.fn();
  vi.stubGlobal('window', {
    history: { pushState },
    location: { href: 'http://localhost:3000/test' },
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      (eventListeners[event] ??= []).push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
      const arr = eventListeners[event];
      if (!arr) return;
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 触发 popstate 事件（模拟移动端返回键） */
function triggerPopstate() {
  const handlers = eventListeners['popstate'] ?? [];
  for (const handler of handlers) {
    handler(new PopStateEvent('popstate'));
  }
}

/** 从 mock 中获取注册的 popstate 处理器数量 */
function getPopstateHandlerCount(): number {
  return (eventListeners['popstate'] ?? []).length;
}

/** 动态导入 back-button 模块（确保每次 resetModules 后拿到新实例） */
async function importBackButton() {
  return import('@/lib/back-button');
}

// ---- 测试用例 ----

describe('useBackButton', () => {
  it('弹窗打开时注册到栈，按返回键关闭', async () => {
    const { useBackButton } = await importBackButton();
    const onClose = vi.fn();

    const { unmount } = renderHook(
      ({ visible }) => useBackButton(visible, onClose),
      { initialProps: { visible: false } as { visible: boolean } }
    );

    // 打开弹窗 → entry 入栈 + pushState + 注册 popstate
    act(() => {
      renderHook(
        ({ visible }) => useBackButton(visible, onClose),
        { initialProps: { visible: true } as { visible: boolean } }
      );
    });

    // 此时已通过 renderHook 的 effect 注册，但需要确认
    // 重新用 visible=true 渲染
  });
});
```

等一下 — `renderHook` 的 `initialProps` 如果是 `{ visible: false }`，effect 不会注册。我需要用 `rerender` 来切换 visible。

让我重写测试：

```ts
/**
 * useBackButton hook 单元测试
 *
 * 测试模块级全局栈的 push/pop 行为和 LIFO 关闭顺序。
 * 每个测试用例通过 vi.resetModules() 隔离模块级栈状态。
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let eventListeners: Record<string, EventListener[]>;
let pushState: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  eventListeners = {};
  pushState = vi.fn();
  vi.stubGlobal('window', {
    history: { pushState },
    location: { href: 'http://localhost:3000/test' },
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      (eventListeners[event] ??= []).push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
      const arr = eventListeners[event];
      if (!arr) return;
      const i = arr.indexOf(handler);
      if (i !== -1) arr.splice(i, 1);
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 广播 popstate 事件给所有已注册处理器 */
function firePopstate() {
  const handlers = eventListeners['popstate'];
  if (handlers) {
    // 复制一份，防止处理器在执行中修改数组
    for (const h of [...handlers]) {
      (h as (e: Event) => void)(new PopStateEvent('popstate'));
    }
  }
}

/** 获取当前注册的 popstate 处理器数量 */
function popstateCount(): number {
  return (eventListeners['popstate'] ?? []).length;
}

/** 动态导入模块（每次 resetModules 后获得干净的模块级状态） */
async function loadHook() {
  const mod = await import('@/lib/back-button');
  return mod.useBackButton;
}

// ---- 测试 ----

describe('useBackButton', () => {
  it('visible=true 时 pushState 占位并注册 popstate 监听', async () => {
    const useBackButton = await loadHook();
    const onClose = vi.fn();

    const { rerender, unmount } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onClose),
      { initialProps: { visible: false } }
    );

    // visible=false 时不应该有任何注册
    expect(pushState).not.toHaveBeenCalled();
    expect(popstateCount()).toBe(0);

    // 打开弹窗
    rerender({ visible: true });

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(popstateCount()).toBe(1);

    unmount();
  });

  it('按返回键时调用栈顶 onClose', async () => {
    const useBackButton = await loadHook();
    const onClose = vi.fn();

    const { rerender, unmount } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onClose),
      { initialProps: { visible: false } }
    );

    rerender({ visible: true });
    firePopstate();

    expect(onClose).toHaveBeenCalledOnce();

    unmount();
  });

  it('嵌套弹窗 LIFO 关闭：B 先关，A 后关', async () => {
    const useBackButton = await loadHook();
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();

    // 弹窗 A
    const { rerender: rerenderA, unmount: unmountA } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onCloseA),
      { initialProps: { visible: false } }
    );
    rerenderA({ visible: true });

    // 弹窗 B（嵌套在 A 之上）
    const { rerender: rerenderB, unmount: unmountB } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onCloseB),
      { initialProps: { visible: false } }
    );
    rerenderB({ visible: true });

    // 第一次返回键 → B 关闭
    firePopstate();
    expect(onCloseB).toHaveBeenCalledOnce();
    expect(onCloseA).not.toHaveBeenCalled();

    // 模拟 B 关闭后组件 rerender（visible 变 false → cleanup 出栈）
    rerenderB({ visible: false });

    // 第二次返回键 → A 关闭
    firePopstate();
    expect(onCloseA).toHaveBeenCalledOnce();

    unmountB();
    unmountA();
  });

  it('弹窗关闭（visible=false）后从栈中移除，不再响应返回键', async () => {
    const useBackButton = await loadHook();
    const onClose = vi.fn();

    const { rerender, unmount } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onClose),
      { initialProps: { visible: false } }
    );

    // 打开再关闭
    rerender({ visible: true });
    rerender({ visible: false });

    // 返回键不应触发 onClose
    firePopstate();
    expect(onClose).not.toHaveBeenCalled();

    // 监听器应被清理
    expect(popstateCount()).toBe(0);

    unmount();
  });

  it('栈空后移除 popstate 监听器', async () => {
    const useBackButton = await loadHook();
    const onClose = vi.fn();

    const { rerender, unmount } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onClose),
      { initialProps: { visible: false } }
    );

    rerender({ visible: true });
    expect(popstateCount()).toBe(1);

    // 关闭弹窗 → 栈空 → 监听器移除
    rerender({ visible: false });
    expect(popstateCount()).toBe(0);

    unmount();
  });

  it('onClose 闭包更新：返回键始终调用最新回调', async () => {
    const useBackButton = await loadHook();
    const onCloseOld = vi.fn();
    const onCloseNew = vi.fn();

    const { rerender, unmount } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean; cb: () => void }>(
      ({ visible, cb }) => useBackButton(visible, cb),
      { initialProps: { visible: true, cb: onCloseOld } }
    );

    // 更新回调函数引用
    rerender({ visible: true, cb: onCloseNew });

    firePopstate();

    // 应调用最新的 onCloseNew 而非 onCloseOld
    expect(onCloseNew).toHaveBeenCalledOnce();
    expect(onCloseOld).not.toHaveBeenCalled();

    unmount();
  });

  it('组件卸载时从栈中移除，不影响其他弹窗', async () => {
    const useBackButton = await loadHook();
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();

    // 弹窗 A
    const { rerender: rerenderA, unmount: unmountA } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onCloseA),
      { initialProps: { visible: false } }
    );
    rerenderA({ visible: true });

    // 弹窗 B
    const { rerender: rerenderB, unmount: unmountB } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onCloseB),
      { initialProps: { visible: false } }
    );
    rerenderB({ visible: true });

    // 强制卸载 A（模拟异常情况）
    unmountA();

    // 返回键应关闭 B（栈顶），A 已经在栈外
    firePopstate();
    expect(onCloseB).toHaveBeenCalledOnce();
    expect(onCloseA).not.toHaveBeenCalled();

    unmountB();
  });

  it('SSR 环境（window 为 undefined）不抛出异常', async () => {
    // 暂时移除 jsdom 的 window
    vi.unstubAllGlobals();
    // 确保没有 window
    vi.stubGlobal('window', undefined);

    const useBackButton = await loadHook();
    const onClose = vi.fn();

    // 在无 window 环境下渲染不应崩溃
    const { unmount } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => useBackButton(visible, onClose),
      { initialProps: { visible: true } }
    );

    // 不抛异常即为通过
    unmount();
  });
});
```

- [ ] **Step 2: 运行测试，确认全部失败**

```bash
npx vitest run __tests__/lib/back-button.test.ts
```

Expected: 全部失败（模块不存在）

- [ ] **Step 3: 创建 `lib/back-button.ts` 实现 hook**

```ts
/**
 * 移动端返回键弹窗栈
 *
 * 维护一个模块级全局弹窗关闭回调栈，监听 popstate 事件，
 * 实现按返回键时以 LIFO 顺序关闭弹窗。
 *
 * 首次弹窗打开时注入 history 占位状态，栈空时自动清理监听器。
 *
 * 使用方式：
 *   useBackButton(visible, onClose);
 */

'use client';

import { useEffect, useRef } from 'react';

// ---- 模块级全局状态 ----

interface StackEntry {
  id: symbol;
  onCloseRef: { current: (() => void) | null };
}

/** 弹窗关闭回调栈，栈顶为最上层弹窗 */
const stack: StackEntry[] = [];
/** 全局 popstate 监听器是否已注册 */
let listenerRegistered = false;

/**
 * 注入 history 占位状态
 *
 * 使返回键触发 popstate 而非离开页面。仅在浏览器环境执行。
 */
function pushPlaceholder(): void {
  if (typeof window === 'undefined') return;
  window.history.pushState(null, '', window.location.href);
}

/**
 * popstate 事件处理器
 *
 * 取栈顶 entry 的 onClose 回调调用之，关闭最上层弹窗。
 * 关闭后重新注入占位状态阻止页面跳转。
 * 若栈空则移除监听器。
 */
function handlePopstate(): void {
  // 取栈顶回调并调用（关闭最上层弹窗）
  const top = stack[stack.length - 1];
  if (top?.onCloseRef.current) {
    top.onCloseRef.current();
  }

  // 重新注入占位，阻止页面跳转
  // 仅在栈中还有未关闭的弹窗时注入占位（stack.length > 1，
  // 因为当前被关闭的弹窗 entry 仍在栈中，等待 React cleanup 移除）
  // 若只剩当前关闭的这个（stack.length === 1），不注入占位，
  // 让浏览器的自然回退离开页面
  if (stack.length > 1) {
    pushPlaceholder();
  }

  // 栈空时清理监听器
  // handlePopstate 先于 React cleanup 执行，栈可能仍有 entry；
  // cleanup 中也会检查栈空时移除监听器，双保险
  if (stack.length === 0 && listenerRegistered) {
    window.removeEventListener('popstate', handlePopstate);
    listenerRegistered = false;
  }
}

// ---- Hook ----

/**
 * 将 antd-mobile Popup 接入移动端返回键栈
 *
 * visible 为 true 时将弹窗注册到全局返回栈，按返回键时
 * 自动调用 onClose 关闭最上层弹窗。支持嵌套弹窗的
 * LIFO 关闭顺序。
 *
 * @param visible - 弹窗是否可见
 * @param onClose  - 关闭弹窗的回调函数
 */
export function useBackButton(visible: boolean, onClose: () => void): void {
  // entry 在 visible 变为 true 时创建，cleanup 时从栈中移除
  const entryRef = useRef<StackEntry | null>(null);
  // 始终持有最新 onClose，避免闭包过期
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) return;

    // 创建 entry 并入栈
    const entry: StackEntry = { id: Symbol(), onCloseRef };
    entryRef.current = entry;
    stack.push(entry);

    // 首个弹窗：注入占位状态 + 注册全局 popstate 监听器
    if (stack.length === 1) {
      pushPlaceholder();
      if (!listenerRegistered) {
        window.addEventListener('popstate', handlePopstate);
        listenerRegistered = true;
      }
    }

    return () => {
      // 从栈中移除当前 entry
      const idx = stack.findIndex((e) => e.id === entry.id);
      if (idx !== -1) stack.splice(idx, 1);

      // 栈空则清理监听器
      if (stack.length === 0 && listenerRegistered) {
        window.removeEventListener('popstate', handlePopstate);
        listenerRegistered = false;
      }
    };
  }, [visible]);
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
npx vitest run __tests__/lib/back-button.test.ts
```

Expected: 全部 8 个测试通过

- [ ] **Step 5: 格式化与类型检查**

```bash
npm run format
npm run check
```

修复所有报错后继续。

- [ ] **Step 6: 提交**

```bash
git add lib/back-button.ts __tests__/lib/back-button.test.ts
git commit -m "feat: 实现 useBackButton hook —— 移动端返回键关闭弹窗"
```

---

### Task 3: 接入 Popup 组件

**Files:**
- Modify: `app/travel/components/location-view-popup.tsx`
- Modify: `app/travel/components/location-edit-popup.tsx`
- Modify: `app/travel/components/moment-edit-popup.tsx`
- Modify: `app/travel/components/search-popup.tsx`

每个组件改动相同模式：加 1 行 import + 1 行 hook 调用。

- [ ] **Step 1: 接入 `location-view-popup.tsx`**

在 `app/travel/components/location-view-popup.tsx` 中，在 import 区域加入：

```ts
import { useBackButton } from '@/lib/back-button';
```

在组件函数体开头（`if (!location) return null;` 之前）加入：

```ts
useBackButton(visible, onClose);
```

完整 diff：

```diff
 import { CoverImage } from './cover-image';
 import { Section } from './section';
 import { UploadImage } from './upload-image';
+import { useBackButton } from '@/lib/back-button';

 // ...

 export function LocationViewPopup({ /* ... */ }) {
+  useBackButton(visible, onClose);
+
   if (!location) return null;
```

- [ ] **Step 2: 接入 `location-edit-popup.tsx`**

在 `app/travel/components/location-edit-popup.tsx` 中，在 import 区域加入：

```ts
import { useBackButton } from '@/lib/back-button';
```

在组件函数体开头加入：

```ts
useBackButton(visible, onClose);
```

- [ ] **Step 3: 接入 `moment-edit-popup.tsx`**

在 `app/travel/components/moment-edit-popup.tsx` 中，在 import 区域加入：

```ts
import { useBackButton } from '@/lib/back-button';
```

在组件函数体开头（state 声明之后、`isEdit` 之前）加入：

```ts
useBackButton(visible, onClose);
```

- [ ] **Step 4: 接入 `search-popup.tsx`**

在 `app/travel/components/search-popup.tsx` 中，在 import 区域加入：

```ts
import { useBackButton } from '@/lib/back-button';
```

在组件函数体开头加入：

```ts
useBackButton(visible, onClose);
```

- [ ] **Step 5: 格式化与类型检查**

```bash
npm run format
npm run check
```

修复所有报错后继续。

- [ ] **Step 6: 提交**

```bash
git add app/travel/components/location-view-popup.tsx app/travel/components/location-edit-popup.tsx app/travel/components/moment-edit-popup.tsx app/travel/components/search-popup.tsx
git commit -m "feat: travel Popup 组件接入 useBackButton 返回键关闭"
```

---

### Task 4: 最终验证

- [ ] **Step 1: 运行全部测试**

```bash
npm run test
```

Expected: 所有测试通过（包括已有的 marker-style、filter-locations 等测试和新增的 back-button 测试）。

- [ ] **Step 2: 格式化与类型检查**

```bash
npm run format
npm run check
```

Expected: 无报错。

- [ ] **Step 3: 生产构建测试**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 4: 验收提交**

```bash
git add -A
git commit -m "chore: 最终验证 —— 全量测试 + 构建通过"
```
