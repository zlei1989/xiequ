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
  // node-sqlite3-wasm 通过 exec() 执行 PRAGMA（无 pragma() 方法）
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

/** 同步获取数据库（仅在确保已初始化后调用） */
export function getDbSync(): SQLiteDB {
  if (!db) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return db;
}
