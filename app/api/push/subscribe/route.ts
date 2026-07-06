import { NextResponse } from 'next/server';

import {
  deletePushSubscription,
  upsertPushSubscription,
} from '@/app/watering/services/db';

/** 订阅请求体结构 */
interface SubscribeBody {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

/**
 * POST /api/push/subscribe
 *
 * 保存浏览器推送订阅。endpoint 为唯一键，重复订阅覆盖更新。
 */
export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return NextResponse.json(
      { error: 'endpoint, keys.p256dh, keys.auth required' },
      { status: 400 },
    );
  }

  try {
    await upsertPushSubscription({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] Failed to save subscription:', message);
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/push/subscribe
 *
 * 删除浏览器推送订阅。endpoint 不存在时静默返回成功。
 * 使用 new URL(request.url) 而非 request.nextUrl，确保可被普通 Request 测试。
 */
export async function DELETE(request: Request) {
  const endpoint = new URL(request.url).searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint query param required' }, { status: 400 });
  }

  try {
    await deletePushSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] Failed to delete subscription:', message);
    return NextResponse.json(
      { error: 'Failed to delete subscription' },
      { status: 500 },
    );
  }
}
