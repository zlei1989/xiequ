# 移动端返回键关闭弹窗

> 日期：2026-06-13 | 状态：设计完成

## 背景

移动端浏览器按返回键默认离开当前页面。对于使用 antd-mobile `Popup`（底部弹出面板）的场景，用户期望按返回键关闭弹窗而非跳转页面。需要实现返回键拦截，将弹窗接入移动端返回栈。

## 范围

| 维度 | 说明 |
|------|------|
| 覆盖组件 | travel 模块 4 个 antd-mobile `Popup`：`LocationViewPopup`、`LocationEditPopup`、`MomentEditPopup`、`SearchPopup` |
| 嵌套行为 | 栈式（LIFO）：按一次关最顶层，再按关下一层 |
| 接入方式 | 自定义 hook `useBackButton(visible, onClose)`，各组件按需调用 |
| 暂不覆盖 | watering 模块 antd `Drawer`、`Dialog.confirm/show` 命令式调用 |

## 架构

### 文件

```
lib/
  back-button.ts    ← 新增：全局弹窗返回栈 + useBackButton hook
```

各 Popup 组件加一行 `useBackButton(visible, onClose)` 调用。

### 模型

```
全局栈（模块级闭包变量）
┌──────────────────┐
│  entry_3 (最顶层)  │ ← 按返回键时关闭这个
│  entry_2          │
│  entry_1 (底层)    │
└──────────────────┘
   ↑ push / pop

popstate 监听器（全局唯一）
  → 取栈顶 onCloseRef.current() 执行
  → pushState 占位，阻止页面跳转
  → 栈空时清理监听器
```

### Hook 接口

```ts
/**
 * 将 antd-mobile Popup 接入移动端返回键栈
 *
 * 当 visible 为 true 时注册到全局栈，按返回键时栈顶的 onClose 被调用；
 * visible 变为 false 时从栈中移除。嵌套弹窗自动按 LIFO 顺序关闭。
 */
function useBackButton(visible: boolean, onClose: () => void): void;
```

## 数据流

### 注册（visible: false → true）

```
组件渲染 → useBackButton(true, onClose)
  → 将 { id, onCloseRef } push 到全局栈
  → 栈 size === 1 时：history.pushState() + 注册 popstate 监听器
```

### 注销（visible: true → false）

```
用户点击遮罩层/X按钮 → onClose() 调用 → visible 变 false
  → useEffect cleanup：从栈中移除该 entry
  → 栈为空时：移除 popstate 监听器
```

### 返回键触发

```
用户按返回键 → popstate 事件
  → 取栈顶 entry，调用 onCloseRef.current()
  → history.pushState() 占位（阻止真正跳转）
  → 若栈空，移除监听器
```

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| onClose 闭包过期 | 栈中存 ref 而非函数，每次渲染更新 ref.current，返回键总是调用最新 onClose |
| 快速连按返回键 | 第一次 popstate 后 pushState 占位，第二次 popstate 才触发下一层，天然限速 |
| 组件卸载时 visible | useEffect cleanup 从栈中移除（走正常注销路径） |
| SSR | 所有 window/history 访问前 guard `typeof window !== 'undefined'` |
| 页面首次进入无占位状态 | 首次打开弹窗时才 pushState，首次返回键会退出页面（预期行为） |

## 实现骨架

### `lib/back-button.ts`

```ts
/**
 * 移动端返回键弹窗栈
 *
 * 维护一个全局弹窗关闭回调栈，监听 popstate 事件实现栈式（LIFO）关闭。
 * 首次打开弹窗时注入 history 占位状态，栈空时自动清理监听器。
 */

'use client';

import { useEffect, useRef } from 'react';

// ---- 模块级全局状态 ----

interface StackEntry {
  id: symbol;
  onCloseRef: { current: (() => void) | null };
}

const stack: StackEntry[] = [];
let listenerRegistered = false;

function pushPlaceholder(): void {
  if (typeof window === 'undefined') return;
  window.history.pushState(null, '', window.location.href);
}

function handlePopstate(): void {
  const top = stack[stack.length - 1];
  if (top?.onCloseRef.current) {
    top.onCloseRef.current();
  }
  // 重新注入占位，阻止页面真正跳转
  pushPlaceholder();
  // 栈空则清理监听器
  if (stack.length === 0 && listenerRegistered) {
    window.removeEventListener('popstate', handlePopstate);
    listenerRegistered = false;
  }
}

export function useBackButton(visible: boolean, onClose: () => void): void {
  const entryRef = useRef<StackEntry | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) return;

    const entry: StackEntry = { id: Symbol(), onCloseRef };
    entryRef.current = entry;
    stack.push(entry);

    if (stack.length === 1) {
      pushPlaceholder();
      if (!listenerRegistered) {
        window.addEventListener('popstate', handlePopstate);
        listenerRegistered = true;
      }
    }

    return () => {
      const idx = stack.findIndex((e) => e.id === entry.id);
      if (idx !== -1) stack.splice(idx, 1);

      if (stack.length === 0 && listenerRegistered) {
        window.removeEventListener('popstate', handlePopstate);
        listenerRegistered = false;
      }
    };
  }, [visible]);
}
```

### 各组件接入

每个 Popup 组件加一行 import + 一行调用，例如 `location-view-popup.tsx`：

```tsx
import { useBackButton } from '@/lib/back-button';

export function LocationViewPopup({ visible, onClose, ... }: { ... }) {
  useBackButton(visible, onClose);
  // ... 其余代码不变
}
```

改动清单：

| 文件 | 改动 |
|------|------|
| `lib/back-button.ts` | 新增 |
| `app/travel/components/location-view-popup.tsx` | +2 行 |
| `app/travel/components/location-edit-popup.tsx` | +2 行 |
| `app/travel/components/moment-edit-popup.tsx` | +2 行 |
| `app/travel/components/search-popup.tsx` | +2 行 |

## 测试策略

### 测试文件

```
__tests__/
  back-button.test.tsx   ← vitest + @testing-library/react + jsdom
```

### 测试场景

| 场景 | 验证点 |
|------|--------|
| 单个弹窗打开 → 按返回键 | onClose 被调用 |
| 弹窗关闭后按返回键 | onClose 不再被调用 |
| 嵌套弹窗 A→B，按返回键 | B 关闭，A 保持 |
| 嵌套弹窗 A→B，按两次返回键 | 先 B 后 A |
| 组件卸载 | 从栈中移除，不影响其他弹窗 |
| 同一组件多次挂载 | Symbol id 防止旧 entry 残留 |

### 测试注意

- 每个测试前用 `vi.resetModules()` 重新加载模块隔离栈状态
- 用 `window.dispatchEvent(new PopStateEvent('popstate'))` 模拟返回键
- 用 `renderHook` 的 `rerender` 验证闭包过期时的 ref 机制

## 不做什么

- 不覆盖 watering 模块 antd `Drawer`
- 不覆盖 `Dialog.confirm/show` 命令式调用
- 不做真机兼容性自动化测试（手工验证）
