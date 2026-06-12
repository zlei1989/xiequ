/**
 * SQLite 数据库连接模块（WASM 实现）
 *
 * 基于 node-sqlite3-wasm，在 WASM 虚拟文件系统中运行。
 * 数据库文件路径由 DB_PATH 环境变量指定，默认 project_root/data/app.db。
 *
 * 注意事项：
 * - WAL 模式不受 WASM 虚拟文件系统支持，使用默认 DELETE 日志模式
 * - SCF 部署时 DB_PATH 应设为 /tmp/app.db（仅 /tmp 可写）
 * - 数据库实例为模块级单例，getDb() 负责懒初始化
 *
 * @see instrumentation.ts — 应用启动时预初始化数据库
 */

import { mkdirSync, existsSync } from 'fs';
import path from 'path';

import { Database } from 'node-sqlite3-wasm';

type SQLiteDB = Database;

/** 模块级数据库单例（懒初始化） */
let db: SQLiteDB | null = null;

/** 数据库文件路径（支持环境变量覆盖，SCF 下需设为 /tmp/） */
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');

// DEBUG: 模块加载时打印运行时上下文，方便排查 SCF 与本地路径差异
if (process.env.NODE_ENV !== 'production') {
  console.log('[DB] process.cwd():', process.cwd());
  console.log('[DB] DB_PATH:', DB_PATH);
  console.log('[DB] process.env.NEXT_RUNTIME:', process.env.NEXT_RUNTIME);
}

/**
 * 获取数据库实例（懒初始化）
 *
 * 首次调用时创建数据库文件所在目录、初始化连接。
 * 后续调用直接返回缓存的单例。
 */
export function getDb(): SQLiteDB {
  if (db) {
    // DEBUG: 返回缓存实例（非生产打印指针地址辅助排查内存问题）
    if (process.env.NODE_ENV !== 'production') {
      // _ptr 是 node-sqlite3-wasm 内部属性，仅用于调试
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log('[DB] Returning cached db instance, ptr:', (db as any)._ptr);
    }
    return db;
  }

  // INFO: 首次初始化，打印关键状态
  console.log('[DB] Initializing database...');
  const initStart = Date.now();

  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) {
    // INFO: 目录不存在则创建（SCF /tmp 冷启动场景）
    console.log('[DB] Creating data directory:', dir);
    mkdirSync(dir, { recursive: true });
  }

  try {
    db = new Database(DB_PATH);
    const elapsed = Date.now() - initStart;
    console.log(`[DB] Database initialized at ${DB_PATH} (${String(elapsed)}ms)`);

    // WAL 模式在 WASM (Emscripten VFS) 和只读文件系统中不受支持，
    // 使用默认的 DELETE 日志模式，兼容性最好
  } catch (e) {
    // ERROR: 数据库创建失败，打印上下文和堆栈
    console.error(`[DB] Failed to create database at ${DB_PATH}:`, e);
    if (e instanceof Error && e.stack) console.error(e.stack);
    throw e;
  }
  return db;
}

/**
 * 同步获取已初始化的数据库实例
 *
 * 仅应在确认 getDb() 已调用后使用（如 instrumentation.ts 预初始化之后）。
 * 若未初始化则抛出异常，避免隐式初始化导致的时序问题。
 */
export function getDbSync(): SQLiteDB {
  if (!db) {
    throw new Error('[DB] Database not initialized. Call getDb() first.');
  }
  return db;
}
