# 从 sql.js 迁移到 better-sqlite3 设计文档

## 背景与动机

当前项目使用 `sql.js`（WASM 实现的 SQLite），通过 `lib/sqljs-wrapper.ts` 封装来模拟 `better-sqlite3` API。sql.js 的持久化机制存在根本性缺陷：

- **全量快照写盘**：每次保存调用 `export()` 将整个数据库序列化为 Buffer，再 `fs.writeFileSync` 全量写入
- **防抖延迟**：写操作通过 `markDirty()` 标记脏数据，100ms 防抖后才写盘——崩溃可能丢失最近 100ms 内的所有写入
- **无真 WAL**：`journal_mode = WAL` 只是形式上的 pragma，sql.js 不支持真正的文件级 WAL

对于浇花 IoT 模块频繁的写入场景（设备心跳每秒更新 `last_tick_time`、状态推送 upsert、日志写入），这个持久化模型不够可靠。需要替换为 native 的 `better-sqlite3`，实现真正的文件级持久化和 WAL 模式。

## 约束条件

| 约束 | 说明 |
|------|------|
| 开发环境 | Windows |
| 部署环境 | 腾讯云 SCF（Linux） |
| 部署方式 | zip 包上传，解压后 `node server.js` 启动 |
| 构建方式 | Windows 本地 `npm run build`，打包脚本上传 |
| standalone | `output: 'standalone'`，必须跨平台 |
| 包管理 | 仅 npm（pnpm 与 standalone 不兼容） |

## 核心方案：better-sqlite3 + 预编译二进制替换

`better-sqlite3` 官方为每个版本提供 win-x64 / linux-x64 / darwin-x64 的预编译 `.node` 二进制。利用这一特性：

1. Windows 上 `npm install` → 自动安装 win-x64 预编译二进制
2. Windows 上 `npm run build` → Next.js standalone 产出（含 win-x64 二进制）
3. `scripts/deploy.ts` 打包前 → 下载 linux-x64 预编译二进制，替换 standalone 中的版本
4. zip 上传 SCF → `node server.js` 加载 Linux 原生二进制

### 为什么不用 SCF 的 `InstallDependency`

SCF 的 `InstallDependency: "TRUE"` 会在 zip 根目录运行 `npm install`，但它安装到 `zip_root/node_modules/`，而 Next.js standalone 的 `server.js` 从 `.next/standalone/node_modules/` 解析模块。两个路径不相交，无法生效。

## 变更清单

### 文件变更

| 文件 | 动作 | 说明 |
|------|------|------|
| `lib/sqljs-wrapper.ts` | 删除 | 230 行 WASM 包装器不再需要 |
| `lib/db.ts` | 重写 | 直接用 better-sqlite3，约 20 行 |
| `package.json` | 修改 | `sql.js` → `better-sqlite3`；`@types/sql.js` → `@types/better-sqlite3` |
| `scripts/deploy.ts` | 新增函数 | `swapBetterSqlite3Binary()`（~40行）+ `cleanStandalone()`（~30行） |
| `scf_bootstrap` | 修改 | 添加 `export PORT=9000` |
| `app/watering/services/db.ts` | 微调 | 移除 `parseJSON` 的 sql.js 注释，API 不变 |

### lib/db.ts — 数据库连接

```typescript
import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";

let db: Database | null = null;

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");

export function getDb(): Database {
  if (db) return db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}
```

**变化要点：**
- 由异步变同步：不再需要加载 WASM，`new Database(path)` 是同步调用
- 外部调用方无感：`await getDb()` 在同步函数上仍然有效（同步函数返回的值自动包装为 resolved Promise）
- 删除：`markDirty()`、`save()`、process 退出 handler——这些都不再需要
- 真正的 WAL：数据直接写入 `app.db-wal` 文件，OS 管理磁盘同步

### scripts/deploy.ts — 二进制替换

在 `main()` 中 `buildProject()` 之后、`copyDir()` 之前插入：

```typescript
await swapBetterSqlite3Binary();
```

新增函数核心职责：

1. 定位 standalone 中的 `better_sqlite3.node` 路径
2. 读取已安装版本号
3. **解析 SCF 目标 Node ABI**：从 `scf_bootstrap` 中提取 Node 主版本号（如 `/var/lang/node24/bin/node` → Node 24），映射到对应 ABI。不能用 `process.versions.modules`（那是本地 Node 的 ABI）
4. 从 GitHub Releases 下载匹配的 Linux x64 预编译包：
   `https://github.com/WiseLibs/better-sqlite3/releases/download/v{VERSION}/better-sqlite3-v{VERSION}-node-v{SCF_ABI}-linux-x64.tar.gz`
5. `zlib.gunzipSync` 解压 → 遍历 tar entry → 提取 `.node` 文件 → 写入替换

**设计决策：**
- ABI 来源是 `scf_bootstrap` 中声明的 SCF Node 版本，而非本地 Node
- 内置一个 Node 版本 → ABI 映射表（Node 18:108, 20:115, 22:127, 24:135），如果 SCF Node 版本不在表中，尝试运行时探测
- 使用 `fetch` + `zlib` + 纯 JS tar 解析，不依赖系统 `curl`/`tar`
- 下载失败 → `process.exit(1)`，不部署损坏的包

### scripts/deploy.ts — 部署包精简

`buildProject()` 后、`createZip()` 前，新增 `cleanStandalone()` 步骤。Next.js standalone 会 trace 进大量非运行时文件，需在打包前清理：

**排除清单（从 `.next/standalone/` 中删除）：**

| 文件/目录 | 大小 | 理由 |
|-----------|------|------|
| `docs/` | 752 KB | 设计文档 |
| `README.md`、`CLAUDE.md`、`AGENTS.md` | ~5 KB | 项目文档 |
| `eslint.config.mjs` | — | 开发工具 |
| `next.config.ts` | — | 构建时配置 |
| `tsconfig.json` | — | TypeScript 配置 |
| `vitest.config.ts` | — | 测试配置 |
| `instrumentation.ts` | — | 已编译到 `.next/server/` |
| `package-lock.json` | 372 KB | 非运行时需要 |
| `scripts/` | — | 部署脚本 |
| `.env` | — | 用 `.env.local` 代替 |
| `scf_bootstrap` | — | zip 根目录已有，standalone 内重复 |

**保留：** `.next/`、`node_modules/`、`server.js`、`package.json`、`app/`、`components/`、`lib/`、`data/`、`public/`、`.env.local`

### scripts/deploy.ts — 环境变量处理

- standalone 中保留 `.env.local`（从项目根目录的 `.env.local` 复制到 standalone，覆盖 Next.js 自动 trace 的版本）
- 删除 standalone 中的 `.env`（避免泄露默认值到生产环境）
- 在 `.env.local` 中确保 `PORT=9000`

### scf_bootstrap — 端口配置

修改 `scf_bootstrap`，显式设置端口为 9000：

```bash
#!/bin/bash
export PORT=9000
/var/lang/node24/bin/node .next/standalone/server.js
```

### Zip 包结构验证

```
zip root/
  scf_bootstrap          ← SCF 入口脚本
  .next/standalone/      ← 精简后的 standalone 目录
    server.js
    package.json
    .env.local           ← 运行时环境变量（含 PORT=9000）
    .next/               ← Next.js 编译输出
    node_modules/        ← 平铺依赖（含 Linux better-sqlite3）
    data/                ← 数据库文件目录
    public/              ← 静态资源
```

`scf_bootstrap` 中 `.next/standalone/server.js` 的路径与 zip 结构匹配，正确。

### JSON 字段处理 — 不变

`app/watering/services/db.ts` 中的 `parseJSON()` 辅助函数和所有 `JSON.stringify()`/`JSON.parse()` 调用保持不变。better-sqlite3 和 sql.js 对 JSON/TEXT 列的处理方式一致——都是存储为 TEXT 字符串，应用层负责序列化/反序列化。

### Next.js 配置 — 不变

`better-sqlite3` 已在 Next.js 内置的 `serverExternalPackages` 列表中，无需修改 `next.config.ts`。

## 兼容性

| 项目 | 状态 |
|------|------|
| SQL 语法 | 完全兼容（同一 SQLite 引擎） |
| API 调用方式 | 兼容（sqljs-wrapper 已模拟 better-sqlite3 API） |
| WAL 模式 | 从形式变为真正的文件级 WAL |
| 现有测试 | 无数据库层测试，无需修改 |
| 本地开发 (`npm run dev`) | 正常（Windows 预编译二进制） |
| 本地验证 standalone | `npm run build` 后可跑（Windows 二进制）；`npm run deploy` 后不可跑（已替换为 Linux 二进制） |
| SCF 部署 | 正常（Linux 预编译二进制） |

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| GitHub Releases 网络不可达（国内构建） | 下载失败时报明确错误信息，含完整 URL，方便排查 |
| SCF Node ABI 与本地不同，预编译二进制不匹配 | 从 `scf_bootstrap` 解析 SCF Node 版本，映射到正确的 ABI，不依赖本地 `process.versions.modules` |
| SCF 升级 Node 版本后需同步更新 | `scf_bootstrap` 是部署包的一部分，Node 版本变更自然反映在文件中，自动适配 |
| 旧 `data/app.db` 文件残留（sql.js 格式） | sql.js 和 better-sqlite3 使用相同的 SQLite 文件格式，旧数据库文件可直接打开，无需迁移 |
