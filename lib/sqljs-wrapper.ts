/**
 * sql.js 兼容包装器 — 模拟 better-sqlite3 的 Database API。
 * 当 better-sqlite3 的原生 .node 文件无法编译（无 C++ 工具链）时使用。
 */

import initSqlJs, { type SqlJsStatic, type QueryExecResult, type BindParams, type ParamsObject, type SqlValue } from "sql.js";
import fs from "fs";
import path from "path";

let SQL: SqlJsStatic | null = null;
let initPromise: Promise<SqlJsStatic> | null = null;

/** 解析 sql-wasm.wasm 文件的绝对路径 */
function resolveWasmPath(): string {
  // 尝试从当前工作目录的 node_modules 解析
  const paths = [
    path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  // 回退：搜索 pnpm 缓存
  return require.resolve("sql.js").replace(/\.js$/, ".wasm").replace("sql-wasm.js", "sql-wasm.wasm");
}

function getSQL(): Promise<SqlJsStatic> {
  if (SQL) return Promise.resolve(SQL);
  if (!initPromise) {
    const wasmPath = resolveWasmPath();
    initPromise = initSqlJs({
      locateFile: () => wasmPath,
    }).then((sql) => {
      SQL = sql;
      return sql;
    });
  }
  return initPromise;
}

// ============================================================
// 语句包装器
// ============================================================
class Statement {
  private stmt: initSqlJs.Statement;
  private db: Database;

  constructor(db: Database, sql: string) {
    this.db = db;
    this.stmt = db.rawDb.prepare(sql);
  }

  /** 返回所有匹配行 */
  all(...params: unknown[]): unknown[] {
    this.bindParams(params);
    const results: unknown[] = [];
    while (this.stmt.step()) {
      results.push(this.stmt.getAsObject());
    }
    this.stmt.reset();
    return results;
  }

  /** 返回单行 */
  get(...params: unknown[]): unknown | undefined {
    this.bindParams(params);
    if (this.stmt.step()) {
      const row = this.stmt.getAsObject();
      this.stmt.reset();
      return row;
    }
    this.stmt.reset();
    return undefined;
  }

  /** 执行语句并返回变更信息 */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    this.bindParams(params);
    this.stmt.step();
    this.stmt.reset();
    // sql.js 的 getRowsModified 需要通过 db 获取
    const changes = this.db.rawDb.getRowsModified();
    // 尝试获取 lastInsertRowid
    let lastInsertRowid: number | bigint = 0;
    try {
      const result = this.db.rawDb.exec("SELECT last_insert_rowid() as id");
      if (result.length > 0 && result[0].values.length > 0) {
        lastInsertRowid = result[0].values[0][0] as number;
      }
    } catch {
      // 忽略
    }
    this.db.markDirty();
    return { changes, lastInsertRowid };
  }

  private bindParams(params: unknown[]): void {
    // 处理展开的参数数组
    if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
      // 命名参数绑定
      this.stmt.bind(params[0] as ParamsObject);
    } else {
      // 位置参数绑定
      this.stmt.bind(params as BindParams);
    }
  }

  free(): void {
    this.stmt.free();
  }
}

// ============================================================
// 数据库包装器
// ============================================================
export class Database {
  rawDb: initSqlJs.Database;
  private dbPath: string;
  private dirty: boolean = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(rawDb: initSqlJs.Database, dbPath: string) {
    this.rawDb = rawDb;
    this.dbPath = dbPath;
  }

  /** 创建或打开数据库（异步初始化） */
  static async create(dbPath: string): Promise<Database> {
    const sql = await getSQL();

    // 确保目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let rawDb: initSqlJs.Database;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      rawDb = new sql.Database(buffer);
    } else {
      rawDb = new sql.Database();
    }

    const db = new Database(rawDb, dbPath);

    // 进程退出时保存
    const saveHandler = () => {
      if (db.dirty) {
        try {
          const data = db.rawDb.export();
          const buf = Buffer.from(data);
          fs.writeFileSync(dbPath, buf);
        } catch {
          // 静默忽略保存错误
        }
      }
    };

    const exitHandler = () => {
      saveHandler();
      process.exit();
    };

    process.on("exit", saveHandler);
    process.on("SIGINT", exitHandler);
    process.on("SIGTERM", exitHandler);

    return db;
  }

  /** 标记脏数据，延迟保存到磁盘（防抖） */
  markDirty(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const data = this.rawDb.export();
        const buf = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buf);
        this.dirty = false;
      } catch {
        // 静默忽略保存错误
      }
    }, 100);
  }

  /** 立即同步保存 */
  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    try {
      const data = this.rawDb.export();
      const buf = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buf);
      this.dirty = false;
    } catch {
      // 静默忽略保存错误
    }
  }

  // --- better-sqlite3 兼容 API ---

  prepare(sql: string): Statement {
    return new Statement(this, sql);
  }

  exec(sql: string): void {
    this.rawDb.run(sql);
    this.markDirty();
  }

  pragma(sql: string): void {
    // sql.js 中 pragma 直接通过 exec/run 执行
    const pragmaSql = sql.includes("PRAGMA") || sql.includes("pragma") ? sql : `PRAGMA ${sql}`;
    this.rawDb.run(pragmaSql);
    this.markDirty();
  }

  close(): void {
    this.save();
    this.rawDb.close();
  }
}
