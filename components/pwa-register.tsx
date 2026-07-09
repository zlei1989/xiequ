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
