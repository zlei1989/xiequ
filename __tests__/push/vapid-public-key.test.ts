/**
 * GET /api/push/vapid-public-key 测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 创建 mock GET handler
const createHandler = async () => {
  const { GET } = await import('@/app/api/push/vapid-public-key/route');
  return GET;
};

describe('GET /api/push/vapid-public-key', () => {
  beforeEach(() => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public-key-for-api';
  });

  afterEach(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    vi.resetModules();
  });

  it('返回 VAPID 公钥', async () => {
    const handler = await createHandler();
    const response = handler();

    const body = (await response.json()) as { publicKey: string };
    expect(body).toEqual({ publicKey: 'test-public-key-for-api' });
    expect(response.status).toBe(200);
  });

  it('密钥未配置时返回 500', async () => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;

    const handler = await createHandler();
    const response = handler();

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBeDefined();
  });
});
