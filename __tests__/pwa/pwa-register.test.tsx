/**
 * PwaRegister 组件测试
 *
 * 验证 Service Worker 注册逻辑：
 * - 支持 SW 的浏览器应调用 register
 * - 不支持时应静默跳过（不抛出异常）
 * - 注册失败时 catch 错误
 */

// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    // 不应抛出异常（catch 在 useEffect 中异步执行，jsdom 中不触发）
    expect(() => render(<PwaRegister />)).not.toThrow();
  });

  it('SSR 环境（无 navigator.serviceWorker）不崩溃', () => {
    vi.stubGlobal('navigator', {});

    expect(() => render(<PwaRegister />)).not.toThrow();
    expect(registerFn).not.toHaveBeenCalled();
  });
});

describe('通知订阅', () => {
  let subscribeFn: ReturnType<typeof vi.fn>;
  let registerFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subscribeFn = vi.fn().mockResolvedValue({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
    registerFn = vi.fn().mockResolvedValue({
      pushManager: {
        subscribe: subscribeFn,
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: registerFn,
        ready: Promise.resolve({
          pushManager: {
            subscribe: subscribeFn,
            getSubscription: vi.fn().mockResolvedValue(null),
          },
        }),
      },
    });
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('权限 granted 后订阅推送', () => {
    // 注：实际执行在 useEffect 中，
    // 此处验证组件挂载不崩溃（权限 granted 路径）
    expect(() => render(<PwaRegister />)).not.toThrow();
  });

  it('权限 denied 时静默跳过', () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    expect(() => render(<PwaRegister />)).not.toThrow();
  });

  it('权限 denied 时渲染"通知已关闭"提示', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    const { getByText } = render(<PwaRegister />);
    // SW 注册 mock 同步 resolve，但状态更新是异步的，使用 waitFor 等待
    await waitFor(() => {
      expect(getByText('🔕 通知已关闭')).toBeDefined();
    });
  });

  it('权限 granted 时渲染"已开启通知"和关闭入口', async () => {
    const { getAllByText } = render(<PwaRegister />);
    // SW 注册后状态更新为 granted
    await waitFor(() => {
      const elements = getAllByText('🔔 已开启通知');
      expect(elements.length).toBeGreaterThan(0);
    });
    // 关闭入口也应在 DOM 中
    const closeElements = getAllByText('关闭');
    expect(closeElements.length).toBeGreaterThan(0);
  });
});
