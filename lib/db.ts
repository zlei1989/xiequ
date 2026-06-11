import { Database } from "node-sqlite3-wasm";
import path from "path";
import { mkdirSync } from "fs";

type SQLiteDB = Database;

let db: SQLiteDB | null = null;

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");

export function getDb(): SQLiteDB {
  if (db) return db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  // WAL 模式在 WASM (Emscripten VFS) 和只读文件系统中不受支持，
  // 使用默认的 DELETE 日志模式，兼容性最好
  return db;
}

/** 同步获取数据库（仅在确保已初始化后调用） */
export function getDbSync(): SQLiteDB {
  if (!db) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return db;
}
