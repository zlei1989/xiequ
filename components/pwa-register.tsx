'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * PWA 注册组件
 *
 * 职责：
 * - 在客户端注册 Service Worker（/sw.js）
 * - 注册失败静默处理，不影响主功能
 * - 通知权限 granted 时自动订阅 Web Push
 * - 通知权限 denied 时展示"通知已关闭"提示
 * - 通知权限 granted 时展示状态和取消订阅入口
 * - 通知权限 default 时展示订阅按钮
 *
 * 注意：仅在浏览器环境下执行，"use client" + useEffect 确保 SSR 安全。
 */
export function PwaRegister() {
  /** 通知权限状态：'prompt' | 'granted' | 'denied' | 'unsupported' */
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  /**
   * 获取当前通知权限状态
   *
   * SSR/不支持的浏览器返回 'unsupported'。
   */
  const getPermission = useCallback((): NotificationPermission | 'unsupported' => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }, []);

  /**
   * 订阅 Web Push 通知
   *
   * 流程：获取 VAPID 公钥 → pushManager.subscribe() → 保存到服务端。
   * 任一环节失败静默处理，不阻断 UI。
   */
  const subscribe = useCallback(async () => {
    try {
      // 等待 SW 就绪
      const registration = await navigator.serviceWorker.ready;
      // 获取 VAPID 公钥
      const vapidRes = await fetch('/api/push/vapid-public-key');
      const { publicKey } = (await vapidRes.json()) as { publicKey?: string };
      if (!publicKey) return;

      // 浏览器生成订阅
      const pushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // 保存到服务端
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushSub.toJSON()),
      });
    } catch (err: unknown) {
      // 订阅失败不影响主功能
      console.warn('Web Push 订阅失败:', err);
    }
  }, []);

  /**
   * 取消订阅 Web Push 通知
   *
   * 流程：获取当前订阅 → pushManager.unsubscribe() → 服务端删除。
   * 完成后将 UI 重置为"通知已关闭"状态。
   */
  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const currentSub = await registration.pushManager.getSubscription();
      if (currentSub) {
        await currentSub.unsubscribe();
        // 通知服务端删除订阅记录
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(currentSub.endpoint)}`, {
          method: 'DELETE',
        });
      }
    } catch (err: unknown) {
      console.warn('Web Push 取消订阅失败:', err);
    } finally {
      setPermission('denied');
    }
  }, []);

  /**
   * 请求通知权限
   *
   * 用户点击按钮后显式调用，避免页面加载时弹权限弹窗。
   */
  const requestPermission = useCallback(async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        await subscribe();
      }
    } catch {
      // 权限请求失败静默处理
    }
  }, [subscribe]);

  useEffect(() => {
    // SSR 安全
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 注册 SW
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        // 检查通知权限：已授权则自动订阅
        const perm = getPermission();
        setPermission(perm);
        if (perm === 'granted') {
          void subscribe();
        }
      })
      .catch((err: unknown) => {
        console.warn('Service Worker 注册失败:', err);
      });
  }, [getPermission, subscribe]);

  // 不支持通知的浏览器静默跳过
  if (permission === 'unsupported') {
    return null;
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 16,
    right: 16,
    zIndex: 1000,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    backgroundColor: '#1677ff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  };

  // 用户已拒绝通知权限，显示提示文字
  if (permission === 'denied') {
    return (
      <div style={containerStyle}>
        <span style={{ fontSize: 13, color: '#999' }}>🔕 通知已关闭</span>
      </div>
    );
  }

  // 已授权通知，显示状态和取消订阅入口
  if (permission === 'granted') {
    return (
      <div style={containerStyle}>
        <span style={{ fontSize: 13, color: '#666' }}>🔔 已开启通知</span>
        <span style={{ margin: '0 4px', fontSize: 13, color: '#ccc' }}>·</span>
        <span
          role="button"
          style={{ fontSize: 13, color: '#1677ff', cursor: 'pointer' }}
          tabIndex={0}
          onClick={() => { void unsubscribe(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void unsubscribe(); }}
        >
          关闭
        </span>
      </div>
    );
  }

  // 首次访问、权限未决定时渲染订阅按钮
  return (
    <div style={containerStyle}>
      <button
        style={buttonStyle}
        onClick={() => { void requestPermission(); }}
      >
        🔔 开启浇水通知
      </button>
    </div>
  );
}

/**
 * URL-safe Base64 转 Uint8Array
 *
 * PushManager.subscribe() 的 applicationServerKey 要求 Uint8Array 格式。
 * VAPID 公钥为 URL-safe Base64 编码，需先解码为字节数组。
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
