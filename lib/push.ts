/**
 * Web Push 通知工具模块
 *
 * 封装 web-push 库，提供类型安全的 VAPID 初始化、推送发送、
 * 和公钥获取功能。
 *
 * 注意事项：
 * - VAPID 密钥通过环境变量注入，服务端安全边界
 * - 410 Gone 不做隐式清理，由调用方决定处理策略
 */

import webpush from 'web-push';

/** 邮件地址，用于 VAPID 身份标识（不会实际发送邮件） */
const VAPID_SUBJECT = 'mailto:no-reply@xiequ.app';

/**
 * 初始化 web-push VAPID 密钥
 *
 * 在发送任何推送前调用。密钥缺失时抛出异常，
 * 调用方应在 API Route 中捕获并返回 500。
 */
export function initWebPush(): void {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys not configured. Set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY.',
    );
  }

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
}

/** 推送负载结构 */
export interface PushPayload {
  title: string;
  body: string;
  data: { url: string };
}

/** 浏览器 PushSubscription 格式 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** 推送结果 */
export type PushResult =
  | { success: true }
  | { success: false; gone: boolean };

/**
 * 向单个浏览器订阅发送 Web Push 通知
 *
 * 返回结果对象而非抛出异常，方便调用方区分 410（需清理订阅）
 * 和其他错误（网络问题，可重试）。
 *
 * @param subscription 浏览器推送订阅对象
 * @param payload 通知标题、正文和点击跳转 URL
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<PushResult> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err: unknown) {
    // web-push 的 WebPushError 包含 statusCode 属性
    if (
      err &&
      typeof err === 'object' &&
      'statusCode' in err &&
      (err as { statusCode: number }).statusCode === 410
    ) {
      return { success: false, gone: true };
    }
    throw err;
  }
}

/**
 * 获取 VAPID 公钥
 *
 * 通过 API 暴露给前端，供 PushManager.subscribe() 的
 * applicationServerKey 参数使用。
 */
export function getVapidPublicKey(): string {
  const key = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!key) {
    throw new Error('VAPID public key not configured.');
  }
  return key;
}
