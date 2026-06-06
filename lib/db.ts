import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

const DB_PATH = path.join(process.cwd(), "data", "app.db");

export function getDb(): Database.Database {
  if (!db) {
    // 确保 data 目录存在
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    // 启用 WAL 模式提升并发性能
    db.pragma("journal_mode = WAL");
  }
  return db;
}
