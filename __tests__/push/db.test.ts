/**
 * push_subscriptions 表 + offline_notified 字段的数据库操作测试
 *
 * 使用 node-sqlite3-wasm 临时文件数据库测试，
 * 验证建表、增删查、通知状态标记/复位。
 * node-sqlite3-wasm 不支持 ':memory:'，使用临时文件。
 */

import { existsSync, unlinkSync } from 'fs';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** 临时数据库文件路径 */
const TEST_DB_PATH = path.join(__dirname, '.tmp-test-push.db');

// 必须在导入 @/lib/db 之前设置，确保模块级常量读取此值
process.env.DB_PATH = TEST_DB_PATH;

afterAll(() => {
  // 清理临时数据库文件
  if (existsSync(TEST_DB_PATH)) {
    try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略清理失败 */ }
  }
});

describe('push_subscriptions CRUD', () => {
  beforeAll(async () => {
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
  });

  const testSub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    keys: {
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
    },
  };

  it('upsertPushSubscription 保存新订阅', async () => {
    const { upsertPushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');

    await upsertPushSubscription(testSub);
    const subs = await getPushSubscriptions();

    expect(subs).toHaveLength(1);
    expect(subs[0]?.endpoint).toBe(testSub.endpoint);
    expect(subs[0]?.keys).toEqual(testSub.keys);
  });

  it('upsertPushSubscription 更新已有订阅（相同 endpoint）', async () => {
    const { upsertPushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');

    const updated = {
      ...testSub,
      keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
    };
    await upsertPushSubscription(updated);
    const subs = await getPushSubscriptions();

    expect(subs).toHaveLength(1);
    expect(subs[0]?.keys).toEqual(updated.keys);
  });

  it('deletePushSubscription 删除订阅', async () => {
    const { deletePushSubscription, getPushSubscriptions } = await import('@/app/watering/services/db');

    await deletePushSubscription(testSub.endpoint);
    const subs = await getPushSubscriptions();

    expect(subs).toHaveLength(0);
  });

  it('getPushSubscriptions 空表返回空数组', async () => {
    const { getPushSubscriptions } = await import('@/app/watering/services/db');

    const subs = await getPushSubscriptions();

    expect(subs).toEqual([]);
  });
});

describe('offline_notified', () => {
  const chipId = 'test-chip-offline';

  beforeAll(async () => {
    const { initDb } = await import('@/app/watering/services/db');
    await initDb();
    // 创建测试设备和状态行
    const { getDbSync } = await import('@/lib/db');
    const db = getDbSync();
    const now = new Date().toISOString();
    db.run(
      'INSERT OR REPLACE INTO watering_device (chip_id, name, mac_address, created_time, last_write_time) VALUES (?, ?, ?, ?, ?)',
      [chipId, 'Test Device', 'aa:bb:cc:dd:ee:ff', now, now],
    );
    db.run(
      'INSERT OR REPLACE INTO watering_device_state (chip_id, state_id, last_tick_time, last_write_time, offline_notified) VALUES (?, ?, ?, ?, ?)',
      [chipId, 'test-state', Date.now(), now, 0],
    );
  });

  it('markOfflineNotified 将状态设为 1', async () => {
    const { markOfflineNotified } = await import('@/app/watering/services/db');
    const { getDbSync } = await import('@/lib/db');

    await markOfflineNotified(chipId);

    const db = getDbSync();
    const row = db.get(
      'SELECT offline_notified FROM watering_device_state WHERE chip_id = ?',
      [chipId],
    ) as unknown as { offline_notified: number } | undefined;
    expect(row?.offline_notified).toBe(1);
  });

  it('resetOfflineNotified 将状态复位为 0', async () => {
    const { markOfflineNotified, resetOfflineNotified } = await import('@/app/watering/services/db');
    const { getDbSync } = await import('@/lib/db');

    await markOfflineNotified(chipId);
    await resetOfflineNotified(chipId);

    const db = getDbSync();
    const row = db.get(
      'SELECT offline_notified FROM watering_device_state WHERE chip_id = ?',
      [chipId],
    ) as unknown as { offline_notified: number } | undefined;
    expect(row?.offline_notified).toBe(0);
  });

  it('resetOfflineNotified 对不存在的设备静默跳过', async () => {
    const { resetOfflineNotified } = await import('@/app/watering/services/db');

    // 不应抛出异常
    await expect(resetOfflineNotified('non-existent-chip')).resolves.toBeUndefined();
  });
});
