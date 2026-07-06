/**
 * lib/push.ts 单元测试
 *
 * 验证 VAPID 初始化、推送发送、410 处理。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// mock web-push 以避免真实网络调用
const mockSendNotification = vi.fn();
const mockSetVapidDetails = vi.fn();

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => {
      mockSetVapidDetails(...args);
    },
    sendNotification: (...args: unknown[]) => mockSendNotification(...args) as Promise<unknown>,
  },
}));

describe('initWebPush', () => {
  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    mockSetVapidDetails.mockClear();
    vi.resetModules();
  });

  it('VAPID 密钥齐全时成功初始化', async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private-key';

    const { initWebPush } = await import('@/lib/push');
    initWebPush();

    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      'mailto:no-reply@xiequ.app',
      'test-public-key',
      'test-private-key',
    );
  });

  it('缺少公钥时抛出异常', async () => {
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private-key';

    const { initWebPush } = await import('@/lib/push');
    expect(() => { initWebPush(); }).toThrow('VAPID keys not configured');
  });

  it('缺少私钥时抛出异常', async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key';

    const { initWebPush } = await import('@/lib/push');
    expect(() => { initWebPush(); }).toThrow('VAPID keys not configured');
  });
});

describe('sendPushNotification', () => {
  beforeEach(() => {
    mockSendNotification.mockReset();
  });

  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'p256dh-test', auth: 'auth-test' },
  };
  const payload = {
    title: '测试离线',
    body: '设备已离线 30 分钟',
    data: { url: '/watering/devices/chip1' },
  };

  it('推送成功返回 { success: true }', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });

    const { sendPushNotification } = await import('@/lib/push');
    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).toHaveBeenCalledWith(
      subscription,
      JSON.stringify(payload),
    );
  });

  it('410 Gone 返回 { success: false, gone: true }', async () => {
    const error = new Error('Gone') as Error & { statusCode: number };
    error.statusCode = 410;
    mockSendNotification.mockRejectedValue(error);

    const { sendPushNotification } = await import('@/lib/push');
    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: false, gone: true });
  });

  it('其他错误向上抛出', async () => {
    const error = new Error('Network error');
    mockSendNotification.mockRejectedValue(error);

    const { sendPushNotification } = await import('@/lib/push');
    await expect(sendPushNotification(subscription, payload)).rejects.toThrow('Network error');
  });
});

describe('getVapidPublicKey', () => {
  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    vi.resetModules();
  });

  it('返回配置的公钥', async () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'pub-key-123';

    const { getVapidPublicKey } = await import('@/lib/push');
    expect(getVapidPublicKey()).toBe('pub-key-123');
  });

  it('未配置时抛出异常', async () => {
    const { getVapidPublicKey } = await import('@/lib/push');
    expect(() => getVapidPublicKey()).toThrow('VAPID public key not configured');
  });
});
