import { Database } from "node-sqlite3-wasm";
import path from "path";
import { mkdirSync, existsSync } from "fs";

type SQLiteDB = Database;

let db: SQLiteDB | null = null;

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");

// 诊断日志
console.log("[DB] process.cwd():", process.cwd());
console.log("[DB] DB_PATH:", DB_PATH);
console.log("[DB] process.env.NEXT_RUNTIME:", process.env.NEXT_RUNTIME);

export function getDb(): SQLiteDB {
  if (db) {
    console.log("[DB] Returning cached db instance, ptr:", (db as any)._ptr);
    return db;
  }

  const dir = path.dirname(DB_PATH);
  console.log("[DB] Creating directory:", dir);
  console.log("[DB] Directory exists before mkdir:", existsSync(dir));
  mkdirSync(dir, { recursive: true });
  console.log("[DB] Directory exists after mkdir:", existsSync(dir));

  console.log("[DB] Creating database at:", DB_PATH);
  try {
    db = new Database(DB_PATH);
    console.log("[DB] Database created successfully, ptr:", (db as any)._ptr);
  } catch (e) {
    console.error("[DB] Failed to create database:", e);
    throw e;
  }
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
