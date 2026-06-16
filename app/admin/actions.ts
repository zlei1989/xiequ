/**
 * Admin 数据库管理 — Server Actions
 *
 * 所有服务端操作统一从这里导出，前端组件通过 import 直接调用。
 * 认证检查在此层完成：每个操作前校验 admin_token cookie。
 * 核心逻辑委托给 services.ts。
 */

'use server';

import { createHash } from 'crypto';

import { cookies } from 'next/headers';

import { deleteFile, listFiles, uploadToOss } from './services';

import type { FileInfo, UploadResult } from './services';

/** Cookie 名称常量 */
const TOKEN_COOKIE = 'admin_token';

/**
 * 获取密码的 SHA-256 哈希
 *
 * ADMIN_PASSWORD 未配置时返回 null，所有认证操作将拒绝。
 */
function getPasswordHash(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash('sha256').update(password).digest('hex');
}

/**
 * 校验当前请求是否已认证
 *
 * 读取 admin_token cookie 与密码哈希比对，匹配则视为已认证。
 */
async function authenticate(): Promise<boolean> {
  const hash = getPasswordHash();
  if (!hash) return false;
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  return token === hash;
}

/**
 * 验证管理密码
 *
 * 比对明文密码的 SHA-256 与 ADMIN_PASSWORD 的哈希，
 * 匹配则设置 httpOnly cookie（24h 有效）并返回成功。
 */
export async function verifyPassword(password: string): Promise<{ success: boolean }> {
  const hash = getPasswordHash();
  if (!hash) {
    console.warn('[Admin] ADMIN_PASSWORD 未配置，拒绝登录');
    return { success: false };
  }
  const inputHash = createHash('sha256').update(password).digest('hex');
  if (inputHash !== hash) {
    return { success: false };
  }
  (await cookies()).set(TOKEN_COOKIE, hash, {
    httpOnly: true,
    maxAge: 86400,
    path: '/',
    sameSite: 'lax' as const,
  });
  console.log('[Admin] 管理员登录成功');
  return { success: true };
}

/**
 * 检查当前认证状态
 *
 * 页面加载时调用，判断是否已登录。
 */
export async function checkAuth(): Promise<{ authenticated: boolean }> {
  return { authenticated: await authenticate() };
}

/**
 * 退出登录
 *
 * 删除 admin_token cookie，后续操作需重新验证密码。
 */
export async function logout(): Promise<{ success: boolean }> {
  (await cookies()).delete(TOKEN_COOKIE);
  console.log('[Admin] 管理员退出登录');
  return { success: true };
}

/**
 * 获取文件列表
 *
 * 未认证时返回 error: 'UNAUTHORIZED'，前端据此回到密码状态。
 */
export async function getFiles(): Promise<{ files: FileInfo[]; error?: string }> {
  if (!(await authenticate())) return { files: [], error: 'UNAUTHORIZED' };
  console.log('[Admin] 获取文件列表');
  return { files: listFiles() };
}

/**
 * 删除文件
 *
 * 未认证时返回 error: 'UNAUTHORIZED'。
 * 不允许删除当前数据库文件（services.ts 层校验）。
 */
export async function removeFile(name: string): Promise<{ success: boolean; error?: string }> {
  if (!(await authenticate())) return { success: false, error: 'UNAUTHORIZED' };
  console.log(`[Admin] 删除文件: ${name}`);
  return deleteFile(name);
}

/**
 * 上传文件到 OSS
 *
 * 未认证时返回 error: 'UNAUTHORIZED'。
 * 仅支持 .db 文件（services.ts 层校验）。
 */
export async function backupToOss(name: string): Promise<UploadResult> {
  if (!(await authenticate())) return { success: false, ossPath: '', error: 'UNAUTHORIZED' };
  console.log(`[Admin] 上传到 OSS: ${name}`);
  return uploadToOss(name);
}
