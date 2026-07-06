/**
 * GET /api/push/check-offline
 *
 * 由 SCF 定时触发器每 5 分钟调用，检查所有设备的离线状态。
 * 对离线超 30 分钟且未通知过的设备，向所有浏览器订阅推送通知。
 *
 * 410 Gone 的订阅自动清理，其他推送错误向上传播（SCF 下次重试）。
 */

import { NextResponse } from 'next/server';

import { deletePushSubscription, getAllDevices, getPushSubscriptions, markOfflineNotified } from '@/app/watering/services/db';
import { initWebPush, sendPushNotification } from '@/lib/push';

/** 离线超时阈值（毫秒） */
const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

export async function GET() {
  // 初始化 VAPID 密钥，未配置时返回 500
  try {
    initWebPush();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] check-offline: VAPID init failed:', message);
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 });
  }

  // 获取所有订阅，无订阅时跳过
  const subs = await getPushSubscriptions();
  if (subs.length === 0) {
    return NextResponse.json({ skipped: 'no_subscriptions' });
  }

  // 获取所有设备，筛选离线且未通知的
  const devices = await getAllDevices();
  const now = Date.now();
  const offlineDevices = devices.filter((d) => {
    if (!d.lastTickTime) return false; // 从未心跳，跳过
    const offlineMs = now - d.lastTickTime;
    if (offlineMs <= OFFLINE_THRESHOLD_MS) return false; // 未超阈值
    if (d.offlineNotified === 1) return false; // 已通知过
    return true;
  });

  let sent = 0;

  for (const device of offlineDevices) {
    const payload = {
      title: `${device.name} 已离线`,
      body: '超过 30 分钟未收到心跳',
      data: { url: `/watering/devices/${device.chipId}` },
    };

    // 向所有订阅推送
    let deviceSent = 0;
    let allGone = true;
    for (const sub of subs) {
      try {
        const result = await sendPushNotification(sub, payload);
        if (result.success) {
          deviceSent++;
          allGone = false;
        } else if (result.gone) {
          // 410——浏览器已卸载 PWA，清理订阅
          console.info('[Push] Removing gone subscription:', sub.endpoint);
          await deletePushSubscription(sub.endpoint);
        }
      } catch (err: unknown) {
        // 网络错误，记录日志，继续处理其他订阅
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Push] Failed to send to ${sub.endpoint}:`, message);
        allGone = false;
      }
    }

    sent += deviceSent;

    // 至少一个订阅推送成功或全部 410 后标记已通知
    if (deviceSent > 0 || allGone) {
      await markOfflineNotified(device.chipId);
    }
  }

  console.info(`[Push] check-offline done: ${String(sent)} notifications sent for ${String(offlineDevices.length)} offline devices`);
  return NextResponse.json({ sent });
}
