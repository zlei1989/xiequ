# sql.js → better-sqlite3 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据库层从 sql.js（WASM）替换为 better-sqlite3（原生），实现真正的文件级 WAL 持久化，同时优化部署包和端口配置。

**Architecture:** 替换数据库依赖 → 重写连接层 → 清理旧 wrapper → 更新部署脚本（二进制跨平台替换 + 包精简 + 端口配置）。现有业务层 API 不变。

**Tech Stack:** better-sqlite3, Next.js 16 standalone, Node.js, TypeScript, 腾讯云 SCF

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 替换依赖声明 |
| `lib/db.ts` | 重写 | better-sqlite3 连接单例（~20 行） |
| `lib/sqljs-wrapper.ts` | 删除 | 不再需要 |
| `app/watering/services/db.ts` | 微调 | 移除 sql.js 特有注释，`await getDb()` 改为 `getDb()` |
| `scf_bootstrap` | 修改 | 添加 `PORT=9000` |
| `scripts/deploy.ts` | 新增 + 调整 | `swapBetterSqlite3Binary()` + `cleanStandalone()` + 调整 main 流程 |

### 未修改文件

- `instrumentation.ts` — `register()` 保持 async，`await initDb()` 行为不变
- `next.config.ts` — better-sqlite3 已在 Next.js 内置 `serverExternalPackages` 列表
- `app/watering/` 其他文件 — API 不变

---

### Task 1: 替换依赖 — package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 卸载 sql.js，安装 better-sqlite3**

```bash
npm uninstall sql.js @types/sql.js
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

- [ ] **Step 2: 验证 package.json 变更**

确认 `package.json` 中：
- `dependencies` 不再包含 `sql.js`
- `dependencies` 新增 `"better-sqlite3": "^11.x.x"`（版本号以 npm 实际安装为准）
- `devDependencies` 不再包含 `@types/sql.js`
- `devDependencies` 新增 `"@types/better-sqlite3": "^7.x.x"`

```bash
node -e "const p = require('./package.json'); console.log('better-sqlite3:', p.dependencies['better-sqlite3']); console.log('sql.js present:', 'sql.js' in p.dependencies)"
```

Expected: `better-sqlite3: 11.x.x`, `sql.js present: false`

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "deps: replace sql.js with better-sqlite3"
```

---

### Task 2: 重写 lib/db.ts

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: 替换文件内容**

将 `lib/db.ts` 的内容替换为：

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

/** 同步获取数据库（仅在确保已初始化后调用） */
export function getDbSync(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return db;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit lib/db.ts
```

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add lib/db.ts
git commit -m "refactor(db): rewrite lib/db.ts with better-sqlite3"
```

---

### Task 3: 删除 lib/sqljs-wrapper.ts

**Files:**
- Delete: `lib/sqljs-wrapper.ts`

- [ ] **Step 1: 删除文件**

```bash
git rm lib/sqljs-wrapper.ts
```

- [ ] **Step 2: 验证无残留引用**

```bash
grep -r "sqljs-wrapper" --include="*.ts" --include="*.tsx" . 2>nul || echo "No references found"
```

Expected: `No references found`。

- [ ] **Step 3: 提交**

```bash
git commit -m "refactor: remove sql.js wrapper (replaced by better-sqlite3)"
```

---

### Task 4: 微调 app/watering/services/db.ts

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 更新 import 和注释，替换所有 `await getDb()` 为 `getDb()`**

`app/watering/services/db.ts` 中需要做三处文本替换：

**替换 A — 第 1 行 import（不变，`getDb` 来自 `@/lib/db`，路径不变）：**
无需修改。

**替换 B — 第 5-8 行，更新 parseJSON 的注释：**
```
旧:  * sql.js 的 getAsObject() 将 JSON 列作为字符串返回（不自动解析）。
新:  * better-sqlite3 将 JSON/TEXT 列作为字符串返回，需手动解析。
```

**替换 C — 全文件：将所有 `await getDb()` 替换为 `getDb()`**

当前所有函数都使用 `const db = await getDb()`，由于 `getDb()` 现在是同步的，需去掉 `await`。共 11 处。

```bash
# 验证替换数量
grep -c "await getDb()" app/watering/services/db.ts
# Expected: 0
grep -c "getDb()" app/watering/services/db.ts  
# Expected: 11
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add app/watering/services/db.ts
git commit -m "refactor(watering): remove await from getDb() calls, update comment"
```

---

### Task 5: 更新 scf_bootstrap

**Files:**
- Modify: `scf_bootstrap`

- [ ] **Step 1: 添加 PORT 环境变量**

将 `scf_bootstrap` 内容替换为：

```bash
#!/bin/bash
export PORT=9000
/var/lang/node24/bin/node .next/standalone/server.js
```

- [ ] **Step 2: 提交**

```bash
git add scf_bootstrap
git commit -m "feat: set PORT=9000 in scf_bootstrap"
```

---

### Task 6: scripts/deploy.ts — 添加 swapBetterSqlite3Binary()

**Files:**
- Modify: `scripts/deploy.ts`

> 在 `loadConfig()` 函数之后、`main()` 函数之前插入新函数。

- [ ] **Step 1: 在文件顶部添加新 import**

在 `scripts/deploy.ts` 顶部已有 import 块（第 1-18 行），追加以下 import：

```typescript
// 在现有 import 块末尾追加：
import { gunzipSync } from "zlib";
```

最终顶部 import 块为：

```typescript
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  createReadStream,
  createWriteStream,
  unlinkSync,
  rmSync,
} from "fs";
import { resolve, join, basename } from "path";
import archiver from "archiver";
import COS from "cos-nodejs-sdk-v5";
import { scf } from "tencentcloud-sdk-nodejs";
import dayjs from "dayjs";
import { gunzipSync } from "zlib";
```

- [ ] **Step 2: 在 `loadConfig()` 函数下方插入辅助函数和主函数**

在 `function loadConfig(): DeployConfig { ... }` 函数的闭合 `}` 之后、`const ROOT = resolve(__dirname, "..");` 之前，插入以下代码：

```typescript
// ─── better-sqlite3 二进制替换 ─────────────────────────────

/** Node.js 主版本 → NODE_MODULE_VERSION (ABI) 映射表 */
const NODE_ABI_MAP: Record<number, number> = {
  14: 83, 16: 93, 18: 108, 19: 111, 20: 115, 21: 120, 22: 127, 23: 131, 24: 135,
};

/** 从 scf_bootstrap 中解析 SCF 目标 Node 主版本号 */
function parseScfNodeVersion(): number {
  const bootstrapPath = join(ROOT, "scf_bootstrap");
  const content = readFileSync(bootstrapPath, "utf-8");
  const match = content.match(/\/var\/lang\/node(\d+)\/bin\/node/);
  if (!match) {
    console.error("❌ 无法从 scf_bootstrap 中解析 SCF Node 版本");
    process.exit(1);
  }
  return parseInt(match[1], 10);
}

/** 简单 tar 解析：从 tar Buffer 中找到 better_sqlite3.node 并返回其内容 */
function extractNodeFromTar(tarBuffer: Buffer): Buffer {
  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    // 全零块 = 归档结束标记
    if (header.every(b => b === 0)) break;

    const name = header.toString("utf-8", 0, 100).replace(/\0/g, "");
    const sizeStr = header.toString("utf-8", 124, 136).replace(/\0/g, "");
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    if (name.endsWith("better_sqlite3.node")) {
      return tarBuffer.subarray(offset, offset + size);
    }

    // 跳到下一个 entry（512 字节对齐）
    offset += Math.ceil(size / 512) * 512;
  }
  throw new Error("tar 包中未找到 better_sqlite3.node");
}

/** 下载 Linux x64 的 better-sqlite3 预编译二进制并替换 standalone 中的版本 */
async function swapBetterSqlite3Binary(): Promise<void> {
  const standaloneDir = join(ROOT, ".next", "standalone");
  const binaryPath = join(
    standaloneDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node",
  );

  if (!existsSync(binaryPath)) {
    console.log("⚠️ better-sqlite3 未在 standalone 中找到，跳过二进制替换");
    return;
  }

  // 读取已安装版本
  const pkgJsonPath = join(standaloneDir, "node_modules", "better-sqlite3", "package.json");
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const version: string = pkgJson.version;

  // 解析 SCF Node ABI
  const nodeMajor = parseScfNodeVersion();
  const nodeAbi = NODE_ABI_MAP[nodeMajor];
  if (!nodeAbi) {
    console.error(`❌ 未知的 Node.js 主版本 ${nodeMajor}，请在 NODE_ABI_MAP 中补充映射`);
    process.exit(1);
  }

  const filename = `better-sqlite3-v${version}-node-v${nodeAbi}-linux-x64.tar.gz`;
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/${filename}`;

  console.log(`📥 下载 better-sqlite3 Linux 预编译二进制 v${version} (Node ABI ${nodeAbi})...`);
  console.log(`   ${url}`);

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    console.error("❌ 网络请求失败，请检查网络连接或 GitHub 可达性");
    console.error(`   URL: ${url}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`❌ 下载失败: HTTP ${response.status} ${response.statusText}`);
    console.error(`   请确认版本 v${version} 支持 Node ABI ${nodeAbi}`);
    console.error(`   可访问 https://github.com/WiseLibs/better-sqlite3/releases 确认预编译包`);
    process.exit(1);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  const decompressed = gunzipSync(compressed);
  const nodeBinary = extractNodeFromTar(decompressed);

  writeFileSync(binaryPath, nodeBinary);
  console.log("✅ better-sqlite3 二进制已替换为 Linux x64 版本");
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit scripts/deploy.ts
```

注意：`deploy.ts` 通过 `tsx` 运行，可能使用独立的 tsconfig 配置。验证通过 `npx tsx --eval "import './scripts/deploy'"` 的语法检查。

Expected: 无语法错误。

- [ ] **Step 3: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add swapBetterSqlite3Binary for cross-platform native binary"
```

---

### Task 7: scripts/deploy.ts — 添加 cleanStandalone()

**Files:**
- Modify: `scripts/deploy.ts`

> 在 `swapBetterSqlite3Binary()` 函数之后、`const ROOT` 之前插入。

- [ ] **Step 1: 插入 cleanStandalone 函数**

在 Task 6 新增的 `swapBetterSqlite3Binary` 函数闭合 `}` 之后、`const ROOT` 之前，插入：

```typescript
// ─── 部署包精简 ────────────────────────────────────────────

/** 需从 standalone 中删除的非运行时文件 */
const CLEANUP_PATTERNS = [
  // 文档
  "docs",
  "README.md",
  "CLAUDE.md",
  "AGENTS.md",
  // 开发工具配置
  "eslint.config.mjs",
  "next.config.ts",
  "tsconfig.json",
  "vitest.config.ts",
  // 源文件（已编译到 .next/server/）
  "instrumentation.ts",
  // 非运行时文件
  "package-lock.json",
  "scripts",
  // 环境变量（保留 .env.local）
  ".env",
  // zip 根目录已有，standalone 内重复
  "scf_bootstrap",
];

/** 递归删除目录 */
function rmDir(dirPath: string) {
  if (!existsSync(dirPath)) return;
  rmSync(dirPath, { recursive: true, force: true });
}

/** 清理 standalone 目录中的非运行时文件 */
function cleanStandalone(): void {
  const standaloneDir = join(ROOT, ".next", "standalone");

  console.log("🧹 清理 standalone 非运行时文件...");

  for (const pattern of CLEANUP_PATTERNS) {
    const target = join(standaloneDir, pattern);
    if (existsSync(target)) {
      const isDir = statSync(target).isDirectory();
      if (isDir) {
        rmDir(target);
      } else {
        unlinkSync(target);
      }
      console.log(`   已删除: ${pattern}`);
    }
  }

  // 确保 .env.local 存在：从项目根目录复制（覆盖 standalone 自动 trace 的版本）
  const rootEnvLocal = join(ROOT, ".env.local");
  const standaloneEnvLocal = join(standaloneDir, ".env.local");
  if (existsSync(rootEnvLocal)) {
    writeFileSync(standaloneEnvLocal, readFileSync(rootEnvLocal));
    console.log("   .env.local 已更新（来源：项目根目录）");
  }

  console.log("✅ standalone 清理完成");
}
```

- [ ] **Step 2: 验证语法**

```bash
npx tsc --noEmit scripts/deploy.ts 2>&1 || echo "检查完毕（tsx 运行时的类型检查可能不适用）"
```

- [ ] **Step 3: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add cleanStandalone to strip non-runtime files"
```

---

### Task 8: scripts/deploy.ts — 调整 main() 流程

**Files:**
- Modify: `scripts/deploy.ts`（第 287-332 行的 `main()` 函数）

- [ ] **Step 1: 在 buildProject() 之后插入新步骤，调整注释顺序**

找到 `main()` 函数中的这段代码：

```typescript
  // 2. 构建
  buildProject();

  // 2.5. standalone 模式：复制 public 和 static 到 standalone 目录
  console.log("📋 复制 static/public 到 standalone...");
```

替换为：

```typescript
  // 2. 构建
  buildProject();

  // 2.5. 替换 better-sqlite3 为 Linux 预编译二进制
  await swapBetterSqlite3Binary();

  // 2.6. 清理 standalone 非运行时文件
  cleanStandalone();

  // 2.7. standalone 模式：复制 public 和 static 到 standalone 目录
  console.log("📋 复制 static/public 到 standalone...");
```

- [ ] **Step 2: 验证完整 TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 无类型错误（或仅有已有的无关警告）。

- [ ] **Step 3: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): wire up binary swap + cleanup in main flow"
```

---

### Task 9: 构建验证 + 本地开发测试

**Files:** 无新建/修改（验证步骤）

- [ ] **Step 1: 启动开发服务器，确认本地正常运行**

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，确认：
- 首页正常加载
- 浇花模块设备列表可访问
- 设备详情页正常
- 旅行模块正常

Expected: 所有页面正常，功能无损。

> 如果 `data/app.db` 已存在（sql.js 格式），better-sqlite3 可直接读写，文件格式相同。

- [ ] **Step 2: 运行测试**

```bash
npm run test
```

Expected: 所有现有测试通过。

- [ ] **Step 3: 验证 standalone 构建产物**

```bash
npm run build
```

构建完成后检查 `.next/standalone/`：

```bash
# 确认 better-sqlite3 在 node_modules 中
ls .next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node

# 确认 sql.js wrapper 不存在
ls lib/sqljs-wrapper.ts 2>/dev/null && echo "WARNING: wrapper still exists" || echo "OK: wrapper removed"

# 检查 standalone 体积（约 28MB，减少约 1MB）
du -sh .next/standalone/
```

Expected: standalone 目录存在，better-sqlite3 已包含，总大小约 28 MB。

- [ ] **Step 4: 本地 standalone 验证（可选）**

```bash
node .next/standalone/server.js
```

访问 [http://localhost:3000](http://localhost:3000)，确认 standalone 模式正常运行。

> 注意：`npm run build` 后不要立即 `npm run deploy`，否则 binary swap 会将其替换为 Linux 版本，导致 Windows 无法运行。如需在 Windows 上验证 standalone，建议重新 `npm run build`。

- [ ] **Step 5: 验证 scf_bootstrap 内容**

```bash
cat scf_bootstrap
```

Expected:
```
#!/bin/bash
export PORT=9000
/var/lang/node24/bin/node .next/standalone/server.js
```

- [ ] **Step 6: 提交最终状态**

```bash
git status
git add -A
git commit -m "chore: final verification after better-sqlite3 migration"
```

---

## 验证清单（部署前）

部署到 SCF 前，确认以下项目：

| 检查项 | 命令 |
|--------|------|
| `data/app.db` 可被 better-sqlite3 读写 | `npm run dev` → 浇花模块功能正常 |
| standalone 包含 Linux better-sqlite3 | 检查 `.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node` |
| standalone 不包含 sql.js | `ls .next/standalone/node_modules/sql.js/` 应报错 |
| standalone 不包含 docs/ | `ls .next/standalone/docs/` 应报错 |
| scf_bootstrap 设置了 PORT=9000 | `cat scf_bootstrap \| grep PORT` |
| `lib/sqljs-wrapper.ts` 已删除 | `ls lib/sqljs-wrapper.ts` 应报错 |
| 无残留 sql.js 引用 | `grep -r "sql.js\|sqljs-wrapper" app/ lib/ --include="*.ts"` 应无输出 |
