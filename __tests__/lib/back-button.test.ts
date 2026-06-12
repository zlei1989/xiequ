/**
 * useBackButton hook 单元测试
 *
 * 测试模块级全局栈的 push/pop 行为和 LIFO 关闭顺序。
 * 每个测试用例通过 vi.resetModules() 隔离模块级栈状态。
 */

// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      (h)(new PopStateEvent('popstate'));
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
      ({ visible }) => { useBackButton(visible, onClose); },
      { initialProps: { visible: false } },
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
      ({ visible }) => { useBackButton(visible, onClose); },
      { initialProps: { visible: false } },
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
      ({ visible }) => { useBackButton(visible, onCloseA); },
      { initialProps: { visible: false } },
    );
    rerenderA({ visible: true });

    // 弹窗 B（嵌套在 A 之上）
    const { rerender: rerenderB, unmount: unmountB } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => { useBackButton(visible, onCloseB); },
      { initialProps: { visible: false } },
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
      ({ visible }) => { useBackButton(visible, onClose); },
      { initialProps: { visible: false } },
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
      ({ visible }) => { useBackButton(visible, onClose); },
      { initialProps: { visible: false } },
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
      ({ visible, cb }) => { useBackButton(visible, cb); },
    { initialProps: { visible: true, cb: onCloseOld } },
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
      ({ visible }) => { useBackButton(visible, onCloseA); },
      { initialProps: { visible: false } },
    );
    rerenderA({ visible: true });

    // 弹窗 B
    const { rerender: rerenderB, unmount: unmountB } = renderHook<ReturnType<typeof useBackButton>, { visible: boolean }>(
      ({ visible }) => { useBackButton(visible, onCloseB); },
      { initialProps: { visible: false } },
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

    // 在无 window 环境下导入模块不应崩溃
    // 注：SSR 中 useEffect 不执行，模块顶层代码不访问 window 即可保证安全
    const useBackButton = await loadHook();
    expect(useBackButton).toBeDefined();
    expect(typeof useBackButton).toBe('function');
  });
});
