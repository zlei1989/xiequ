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
  // 先取出回调并置空再执行，防止快速连按时重复调用
  const top = stack[stack.length - 1];
  const close = top?.onCloseRef.current;
  if (close) {
    top.onCloseRef.current = null;
    close();
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
  // 始终持有最新 onClose，避免闭包过期
  const onCloseRef = useRef(onClose);
  // 在 effect 中同步最新回调（React 19 禁止 render 期间访问 ref）
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!visible) return;

    // 创建 entry 并入栈
    const entry: StackEntry = { id: Symbol(), onCloseRef };
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
