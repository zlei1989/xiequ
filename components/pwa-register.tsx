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
