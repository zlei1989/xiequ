/**
 * Admin 数据库管理 — 服务层
 *
 * 纯函数，负责文件列表读取、删除、OSS 上传等核心逻辑。
 * 不含认证检查，认证由 actions.ts 的 Server Action 包装层处理。
 * 注意事项：
 * - 数据库目录路径从 DB_PATH 环境变量派生，兼容 SCF /tmp 部署
 * - uploadToOss 仅接受 .db 后缀文件
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs';
import path from 'path';

import { getOssAdapter, isOssConfigured } from '@/lib/oss';

/** 数据库文件目录（DB_PATH 的 dirname，兼容 SCF /tmp 路径） */
function getDbDir(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');
  return path.dirname(dbPath);
}

/** 当前数据库文件名 */
function getCurrentDbName(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');
  return path.basename(dbPath);
}

/** 文件信息 */
export type FileInfo = {
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 人类可读的文件大小（如 "44 KB"） */
  sizeDisplay: string;
  /** 是否为当前配置中的数据库文件 */
  isCurrentDb: boolean;
};

/** OSS 上传结果 */
export type UploadResult = {
  success: boolean;
  /** OSS 完整路径（成功时有效） */
  ossPath: string;
  /** 错误信息（失败时有效） */
  error?: string;
};

/**
 * 格式化文件大小（字节 → 人类可读）
 *
 * < 1024 B 显示 "X B"，< 1 MB 显示 "X.X KB"，>= 1 MB 显示 "X.X MB"
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 列出数据库目录下所有文件
 *
 * 读取 data/ 目录 → 过滤子目录（只保留文件）→ 排序（按文件名）。
 * 目录不存在时返回空数组（兼容 SCF 冷启动 /tmp 未创建场景）。
 */
export function listFiles(): FileInfo[] {
  const dbDir = getDbDir();
  if (!existsSync(dbDir)) {
    console.warn(`[Admin] 数据库目录不存在: ${dbDir}`);
    return [];
  }
  const currentDb = getCurrentDbName();
  const entries = readdirSync(dbDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(dbDir, e.name);
      const stat = statSync(filePath);
      return {
        name: e.name,
        size: stat.size,
        sizeDisplay: formatSize(stat.size),
        isCurrentDb: e.name === currentDb,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 删除指定文件
 *
 * 安全检查：不允许删除当前数据库文件（path.basename(DB_PATH)）。
 * 文件不存在时返回错误而非抛出异常。
 */
export function deleteFile(name: string): { success: boolean; error?: string } {
  const dbDir = getDbDir();
  const currentDb = getCurrentDbName();

  if (name === currentDb) {
    console.warn(`[Admin] 拒绝删除当前数据库文件: ${name}`);
    return { success: false, error: '不能删除当前使用的数据库文件' };
  }

  const filePath = path.join(dbDir, name);
  if (!existsSync(filePath)) {
    console.warn(`[Admin] 文件不存在: ${filePath}`);
    return { success: false, error: '文件不存在或已被删除' };
  }

  unlinkSync(filePath);
  console.log(`[Admin] 已删除文件: ${name}`);
  return { success: true };
}

/**
 * 上传 .db 文件到 OSS（腾讯云 COS）
 *
 * 仅接受 .db 后缀文件；目标路径格式：{OSS_BACKUP_PREFIX}{name}.{YYYY-MM-DD}.db。
 * OSS_BACKUP_PREFIX 从环境变量读取，默认 "apps/"。
 * 文件不存在或 OSS 未配置时返回错误，不抛异常。
 */
export async function uploadToOss(name: string): Promise<UploadResult> {
  if (!name.endsWith('.db')) {
    return { success: false, ossPath: '', error: '仅支持上传 .db 文件' };
  }

  if (!isOssConfigured()) {
    console.warn('[Admin] OSS 未配置，无法上传');
    return { success: false, ossPath: '', error: 'OSS 未配置，请检查环境变量' };
  }

  const dbDir = getDbDir();
  const filePath = path.join(dbDir, name);
  if (!existsSync(filePath)) {
    return { success: false, ossPath: '', error: '文件不存在或已被删除' };
  }

  const prefix = process.env.OSS_BACKUP_PREFIX || 'apps/';
  // 去掉原 .db 后缀，拼接日期生成 OSS 路径
  const baseName = name.replace(/\.db$/, '');
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const ossPath = `${prefix}${baseName}.${dateStr}.db`;

  try {
    const buffer = readFileSync(filePath);
    const adapter = getOssAdapter();
    await adapter.putBuffer(ossPath, buffer);
    console.log(`[Admin] 已上传至 OSS: ${ossPath}`);
    return { success: true, ossPath };
  } catch (err) {
    // ERROR: OSS 上传失败，打印堆栈和上下文
    console.error(`[Admin] OSS 上传失败 path=${ossPath}:`, err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    const message = err instanceof Error ? err.message : '上传失败';
    return { success: false, ossPath, error: message };
  }
}
