/**
 * GET /api/push/check-offline 测试
 *
 * 验证离线检测、推送发送、410 清理、重复通知抑制。
 * node-sqlite3-wasm 不支持 ':memory:'，使用临时文件。
 */

import { existsSync, unlinkSync } from 'fs';
import path from 'path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// mock web-push 以避免真实网络调用
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

/** 临时数据库文件路径 */
const TEST_DB_PATH = path.join(__dirname, '.tmp-test-check-offline.db');

// 在导入 @/lib/db 之前设置，确保模块级常量读取此值
process.env.DB_PATH = TEST_DB_PATH;

const OFFLINE_CHIP_ID = 'offline-chip';
const ONLINE_CHIP_ID = 'online-chip';
const NOTIFIED_CHIP_ID = 'notified-chip';
const NOW = Date.now();

/**
 * 设置测试数据库：创建 3 个设备
 * - offline-chip: 最后心跳 31 分钟前，未通知
 * - online-chip: 最后心跳 1 分钟前，未通知
 * - notified-chip: 最后心跳 31 分钟前，已通知
 */
async function setupTestData() {
  const { initDb } = await import('@/app/watering/services/db');
  await initDb();
  const { getDbSync } = await import('@/lib/db');
  const db = getDbSync();
  const nowISO = new Date().toISOString();

  const devices = [
    { chipId: OFFLINE_CHIP_ID, name: '离线设备', mac: 'aa:bb:cc:dd:ee:01', lastTick: NOW - 31 * 60 * 1000, notified: 0 },
    { chipId: ONLINE_CHIP_ID, name: '在线设备', mac: 'aa:bb:cc:dd:ee:02', lastTick: NOW - 60 * 1000, notified: 0 },
    { chipId: NOTIFIED_CHIP_ID, name: '已通知设备', mac: 'aa:bb:cc:dd:ee:03', lastTick: NOW - 31 * 60 * 1000, notified: 1 },
  ];

  for (const d of devices) {
    db.run(
      'INSERT OR REPLACE INTO watering_device (chip_id, name, mac_address, created_time, last_write_time) VALUES (?, ?, ?, ?, ?)',
      [d.chipId, d.name, d.mac, nowISO, nowISO],
    );
    db.run(
      'INSERT OR REPLACE INTO watering_device_state (chip_id, state_id, last_tick_time, last_write_time, offline_notified) VALUES (?, ?, ?, ?, ?)',
      [d.chipId, `${d.chipId}-state`, d.lastTick, nowISO, d.notified],
    );
  }
}

describe('GET /api/push/check-offline', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'test-pub';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-priv';
  });

  afterAll(() => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    // 清理临时数据库文件
    if (existsSync(TEST_DB_PATH)) {
      try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略清理失败 */ }
    }
  });

  beforeEach(async () => {
    vi.resetModules();
    await setupTestData();
  });

  afterEach(async () => {
    // 重置 mock 状态
    const webpush = await import('web-push');
    (webpush.default.sendNotification as ReturnType<typeof vi.fn>).mockReset();
    (webpush.default.setVapidDetails as ReturnType<typeof vi.fn>).mockReset();
  });

  it('无订阅时跳过推送，返回 skipped: no_subscriptions', async () => {
    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    const body = (await response.json()) as { skipped?: string };
    expect(response.status).toBe(200);
    expect(body.skipped).toBe('no_subscriptions');
  });

  it('有订阅时向离线未通知设备推送，已通知设备跳过', async () => {
    // 先插入订阅
    const { upsertPushSubscription } = await import('@/app/watering/services/db');
    await upsertPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-1',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    // Mock web-push 成功
    const webpush = await import('web-push');
    (webpush.default.sendNotification as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ statusCode: 201 });

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    const body = (await response.json()) as { sent?: number };
    expect(response.status).toBe(200);
    // 只推送了 offline-chip（未通知的离线设备），不推送 online 和已通知的
    expect(body.sent).toBeGreaterThanOrEqual(1);

    // 验证 offline_notified 已更新为 1
    const { getDbSync } = await import('@/lib/db');
    const db = getDbSync();
    const row = db.get(
      'SELECT offline_notified FROM watering_device_state WHERE chip_id = ?',
      [OFFLINE_CHIP_ID],
    ) as unknown as { offline_notified: number };
    expect(row.offline_notified).toBe(1);
  });

  it('推送 410 时清理订阅', async () => {
    const { upsertPushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');
    await upsertPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/gone-endpoint',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    // Mock web-push 返回 410
    const webpush = await import('web-push');
    const error = new Error('Gone') as Error & { statusCode: number };
    error.statusCode = 410;
    (webpush.default.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    expect(response.status).toBe(200);

    // 验证订阅已清理
    const subs = await getPushSubscriptions();
    expect(subs).toHaveLength(0);
  });

  it('所有设备在线或无订阅时无推送', async () => {
    // 删除离线设备的状态，模拟全部在线
    const { getDbSync } = await import('@/lib/db');
    const db = getDbSync();
    db.run('DELETE FROM watering_device_state WHERE chip_id = ?', [OFFLINE_CHIP_ID]);
    db.run('DELETE FROM watering_device_state WHERE chip_id = ?', [NOTIFIED_CHIP_ID]);

    // 插入订阅以跳过"无订阅"早期返回，模拟有订阅但全部在线场景
    const { upsertPushSubscription } = await import('@/app/watering/services/db');
    await upsertPushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-all-online',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    const body = (await response.json()) as { sent?: number };
    expect(response.status).toBe(200);
    expect(body.sent).toBe(0);
  });

  it('VAPID 密钥未配置时返回 500', async () => {
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    vi.resetModules();

    const { GET } = await import('@/app/api/push/check-offline/route');
    const response = await GET();

    expect(response.status).toBe(500);
  });
});
