import { NextResponse } from 'next/server';

import { getVapidPublicKey } from '@/lib/push';

/**
 * GET /api/push/vapid-public-key
 *
 * 返回 VAPID 公钥，供前端 PushManager.subscribe() 的
 * applicationServerKey 使用。公钥不敏感，可公开暴露。
 */
export function GET() {
  try {
    const publicKey = getVapidPublicKey();
    return NextResponse.json({ publicKey });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Push] Failed to get VAPID public key:', message);
    return NextResponse.json({ error: 'VAPID public key not configured' }, { status: 500 });
  }
}
