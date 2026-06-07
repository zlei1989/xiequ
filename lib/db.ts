import { Database } from "@/lib/sqljs-wrapper";
import path from "path";

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;

const DB_PATH = path.join(process.cwd(), "data", "app.db");

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (!dbPromise) {
    dbPromise = Database.create(DB_PATH).then((d) => {
      db = d;
      // 启用 WAL 模式提升并发性能（sql.js 中的 pragma）
      d.pragma("journal_mode = WAL");
      return d;
    });
  }
  return dbPromise;
}

/** 同步获取数据库（仅在确保已初始化后调用） */
export function getDbSync(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return db;
}
