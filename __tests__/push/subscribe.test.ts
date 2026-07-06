/**
 * POST/DELETE /api/push/subscribe 测试
 *
 * 使用临时文件 SQLite 测试实际数据库操作。
 * node-sqlite3-wasm 不支持 ':memory:'，使用临时文件。
 */

import { existsSync, unlinkSync } from 'fs';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** POST 测试用的临时数据库文件路径 */
const POST_DB_PATH = path.join(__dirname, '.tmp-test-subscribe-post.db');

/** DELETE 测试用的临时数据库文件路径 */
const DELETE_DB_PATH = path.join(__dirname, '.tmp-test-subscribe-delete.db');

describe('POST /api/push/subscribe', () => {
  beforeAll(async () => {
    process.env.DB_PATH = POST_DB_PATH;
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
  });

  afterAll(() => {
    delete process.env.DB_PATH;
    vi.resetModules();
    // 清理临时数据库文件
    if (existsSync(POST_DB_PATH)) {
      try { unlinkSync(POST_DB_PATH); } catch { /* 忽略清理失败 */ }
    }
  });

  const validBody = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/sub-test',
    keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
  };

  it('保存有效订阅返回 success', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it('缺少 endpoint 返回 400', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: { p256dh: 'x', auth: 'y' } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('请求体格式错误返回 400', async () => {
    vi.resetModules();
    const { POST } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/push/subscribe', () => {
  beforeAll(async () => {
    process.env.DB_PATH = DELETE_DB_PATH;
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
  });

  afterAll(() => {
    delete process.env.DB_PATH;
    vi.resetModules();
    // 清理临时数据库文件
    if (existsSync(DELETE_DB_PATH)) {
      try { unlinkSync(DELETE_DB_PATH); } catch { /* 忽略清理失败 */ }
    }
  });

  it('删除已有订阅返回 success', async () => {
    // 先创建
    const { POST } = await import('@/app/api/push/subscribe/route');
    const createReq = new Request('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://fcm.googleapis.com/fcm/send/delete-test',
        keys: { p256dh: 'x', auth: 'y' },
      }),
    });
    await POST(createReq);

    // 再删除
    vi.resetModules();
    const { DELETE } = await import('@/app/api/push/subscribe/route');
    const deleteReq = new Request(
      'http://localhost/api/push/subscribe?endpoint=https://fcm.googleapis.com/fcm/send/delete-test',
      { method: 'DELETE' },
    );
    const response = await DELETE(deleteReq);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it('缺少 endpoint 参数返回 400', async () => {
    vi.resetModules();
    const { DELETE } = await import('@/app/api/push/subscribe/route');
    const request = new Request('http://localhost/api/push/subscribe', { method: 'DELETE' });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
  });
});
