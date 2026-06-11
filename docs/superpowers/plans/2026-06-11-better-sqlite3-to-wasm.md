# better-sqlite3 → node-sqlite3-wasm 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将数据库层从 better-sqlite3（原生 C++ 模块）替换为 node-sqlite3-wasm（WASM），彻底解决跨平台部署时的 ELF/GLIBC/Node-ABI 不兼容问题。

**Architecture:** 替换依赖 → 改写 `lib/db.ts`（2 行代码改动）→ 删除 `scripts/deploy.ts` 中所有原生二进制处理代码（~160 行）→ 清理配置和注释。业务层 API 零改动。

**Tech Stack:** node-sqlite3-wasm (WASM, SQLite 3.53.2), Next.js 16 standalone, TypeScript, 腾讯云 SCF

**Root cause:** better-sqlite3 预编译二进制由 GitHub Actions（Ubuntu, GLIBC 2.29+）构建，而腾讯云 SCF 运行环境基于 TencentOS（GLIBC 2.28），导致 `GLIBC_2.29 not found`。升级 Node 版本不改变底层 GLIBC，且 better-sqlite3 v11.10.0 无 Node 24 (ABI 135) 预编译二进制。原生模块部署到 SCF 有三重不兼容：ELF 格式（已解决）、GLIBC 版本（当前问题）、Node ABI。

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 替换依赖声明 |
| `lib/db.ts` | 修改 | 改 import + pragma（2 行） |
| `app/watering/services/db.ts` | 修改 | 更新注释（1 行） |
| `next.config.ts` | 修改 | 删除 `serverExternalPackages` |
| `scripts/deploy.ts` | 修改 | 删除所有 better-sqlite3 二进制处理代码 |
| `package-lock.json` | 更新 | npm 自动生成 |

### 未修改文件

- `instrumentation.ts` — `await initDb()` 行为不变
- `app/watering/` 其他文件 — `getDb()` 返回类型在 node-sqlite3-wasm 内置 `.d.ts` 中兼容
- `scf_bootstrap` — 无需特殊处理原生模块

---

### Task 1: 替换依赖 — package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 卸载 better-sqlite3，安装 node-sqlite3-wasm**

```bash
npm uninstall better-sqlite3 @types/better-sqlite3
npm install node-sqlite3-wasm
```

- [ ] **Step 2: 验证 package.json 变更**

```bash
node -e "const p = require('./package.json'); console.log('node-sqlite3-wasm:', p.dependencies['node-sqlite3-wasm']); console.log('better-sqlite3 present:', 'better-sqlite3' in p.dependencies); console.log('@types/better-sqlite3 present:', '@types/better-sqlite3' in (p.devDependencies || {}))"
```

Expected:
```
node-sqlite3-wasm: ^0.8.58
better-sqlite3 present: false
@types/better-sqlite3 present: false
```

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "deps: replace better-sqlite3 with node-sqlite3-wasm (WASM)"
```

---

### Task 2: 重写 lib/db.ts

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: 改写 import 和 pragma**

将 `lib/db.ts` 第 1 行的 import 和第 15 行的 pragma 调用改为：

```typescript
import { Database } from "node-sqlite3-wasm";
import path from "path";
import { mkdirSync } from "fs";

let db: Database | null = null;

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");

export function getDb(): Database {
  if (db) return db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  // node-sqlite3-wasm 通过 exec() 执行 PRAGMA（无 pragma() 方法）
  db.exec("PRAGMA journal_mode = WAL");
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

> **改动说明：**
> - 第 1 行：`import Database from "better-sqlite3"` → `import { Database } from "node-sqlite3-wasm"`（named export）
> - 第 15 行：`db.pragma("journal_mode = WAL")` → `db.exec("PRAGMA journal_mode = WAL")`
> - 其余代码完全不变

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit lib/db.ts
```

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add lib/db.ts
git commit -m "refactor(db): switch lib/db.ts from better-sqlite3 to node-sqlite3-wasm"
```

---

### Task 3: 更新注释 — app/watering/services/db.ts

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 更新第 6 行注释**

将 `app/watering/services/db.ts` 第 6 行：

```
 * better-sqlite3 将 JSON/TEXT 列作为字符串返回，需手动解析。
```

改为：

```
 * SQLite WASM 将 JSON/TEXT 列作为字符串返回，需手动解析。
```

> 代码逻辑无需任何改动。`db.prepare(...).all()`, `.get()`, `.run()`, `db.exec(...)`, 命名参数 `@name` — 所有这些 API 在 node-sqlite3-wasm 中语法完全一致。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit app/watering/services/db.ts
```

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add app/watering/services/db.ts
git commit -m "docs(watering): update db comment for node-sqlite3-wasm"
```

---

### Task 4: 删除 serverExternalPackages — next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: 删除 serverExternalPackages 配置**

`next.config.ts` 当前内容：

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

改为：

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

> WASM 包不需要 `serverExternalPackages`，Next.js 可以正常打包。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit next.config.ts
```

Expected: 无类型错误。

- [ ] **Step 3: 提交**

```bash
git add next.config.ts
git commit -m "chore: remove serverExternalPackages config (no native module)"
```

---

### Task 5: 精简 deploy.ts — 删除二进制处理代码

**Files:**
- Modify: `scripts/deploy.ts`

> `scripts/deploy.ts` 中有约 160 行代码专门处理 better-sqlite3 原生二进制的跨平台问题。切换到 WASM 后这些全部不再需要。

- [ ] **Step 1: 删除 `gunzipSync` import**

删除第 19 行：

```typescript
import { gunzipSync } from "zlib";
```

- [ ] **Step 2: 删除 better-sqlite3 二进制替换代码块**

删除从第 95 行 `// ─── better-sqlite3 二进制替换 ───` 到第 191 行 `swapBetterSqlite3Binary()` 函数结束的整段代码。具体包括：

- `NODE_ABI_MAP` 常量（第 98-100 行）
- `parseScfNodeVersion()` 函数（第 103-112 行）
- `extractNodeFromTar()` 函数（第 114-136 行）
- `swapBetterSqlite3Binary()` 函数（第 139-191 行）

删除后，第 193 行的 `// ─── 部署包精简 ───` 注释紧接在 `loadConfig()` 函数之后。

- [ ] **Step 3: 删除 resolveSymlinks() 函数**

删除 `resolveSymlinks()` 函数（第 225-272 行）。该函数用于解析 Turbopack 对 native 模块创建的符号链接 — WASM 包不会被 Turbopack 创建 symlink，此函数不再需要。

- [ ] **Step 4: 删除 ELF_MAGIC 常量和 verifyBetterSqlite3Binary() 函数**

删除 `ELF_MAGIC` 常量（第 274 行）和 `verifyBetterSqlite3Binary()` 函数（第 277-315 行）。

- [ ] **Step 5: 删除 main() 中对已删除函数的调用**

在 `main()` 函数中：

删除第 558-559 行：
```typescript
  // 2.5. 替换 better-sqlite3 为 Linux 预编译二进制
  await swapBetterSqlite3Binary();
```

删除第 564-565 行：
```typescript
  // 2.65. 验证 standalone 中无 Windows 原生模块残留
  verifyBetterSqlite3Binary();
```

`main()` 函数变为：

```typescript
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("   Next.js SCF 自动化部署");
  console.log("═══════════════════════════════════════");

  // 1. 加载配置
  loadEnv();
  const config = loadConfig();
  console.log(`📍 COS: ${config.cosBucket} (${config.cosRegion})`);
  console.log(`📍 SCF: ${config.scfFunction} (${config.scfRegion})`);

  // 2. 构建
  buildProject();

  // 2.5. 清理 standalone 非运行时文件
  cleanStandalone();

  // 2.6. standalone 模式：复制 public 和 static 到 standalone 目录
  console.log("📋 复制 static/public 到 standalone...");
  const standaloneDir = join(ROOT, ".next", "standalone");
  copyDir(join(ROOT, "public"), join(standaloneDir, "public"));
  const staticSrc = join(ROOT, ".next", "static");
  const staticDst = join(standaloneDir, ".next", "static");
  mkdirSync(join(standaloneDir, ".next"), { recursive: true });
  copyDir(staticSrc, staticDst);
  console.log("✅ 复制完成");

  // 3. 打包
  const zipPath = await createZip(config);

  // 4. 上传 COS
  const objectKey = await uploadToCos(config, zipPath);

  // 5. 部署 SCF
  await deployToScf(config, objectKey);

  // 清理临时文件
  try {
    unlinkSync(zipPath);
    rmSync(TMP_DIR, { recursive: true, force: true });
    console.log("🧹 已清理临时文件");
  } catch {
    // 清理失败不影响整体结果
  }

  console.log("═══════════════════════════════════════");
  console.log("   🎉 部署完成！");
  console.log("═══════════════════════════════════════");
}
```

- [ ] **Step 6: 删除不再需要的 fs import**

`lstatSync` 不再被任何代码使用（`resolveSymlinks()` 是唯一使用者），从 import 中删除：

第 13 行 `lstatSync,` 删除。

- [ ] **Step 7: 验证 deploy.ts 语法**

```bash
npx tsx --eval "import './scripts/deploy'" 2>&1 | head -5
```

Expected: 无语法错误（仅可能因缺少 .env.local 报配置错误，可忽略）。

- [ ] **Step 8: 提交**

```bash
git add scripts/deploy.ts
git commit -m "refactor(deploy): remove better-sqlite3 binary handling (WASM, ~160 lines)"
```

---

### Task 6: 构建验证 + 本地测试

**Files:** 无新建/修改（验证步骤）

- [ ] **Step 1: 运行全量 TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 2: 运行测试**

```bash
npm run test
```

Expected: 所有现有测试通过。

- [ ] **Step 3: 启动开发服务器**

```bash
npm run dev
```

打开 http://localhost:3000，确认：
- 首页正常加载
- `/watering` 浇花模块设备列表可访问
- `/watering/devices/[chipId]` 设备详情页正常
- `/travel` 旅行模块正常

Expected: 所有页面正常，功能无损。

> 如果 `data/app.db` 已存在（better-sqlite3 格式），node-sqlite3-wasm 可直接读写，SQLite 文件格式相同。

- [ ] **Step 4: 验证 standalone 构建产物**

```bash
npm run build
```

构建完成后检查：

```bash
# 确认 standalone 目录存在
ls .next/standalone/server.js

# 确认 better-sqlite3 不在 standalone 中
ls .next/standalone/node_modules/better-sqlite3/ 2>/dev/null && echo "WARNING: better-sqlite3 still present" || echo "OK: better-sqlite3 absent"

# 确认 node-sqlite3-wasm 在 standalone 中
ls .next/standalone/node_modules/node-sqlite3-wasm/ 2>/dev/null && echo "OK: node-sqlite3-wasm present" || echo "WARNING: node-sqlite3-wasm missing"
```

Expected:
```
OK: better-sqlite3 absent
OK: node-sqlite3-wasm present
```

- [ ] **Step 5: 提交**

```bash
git status
git add -A
git commit -m "chore: final verification after WASM migration"
```

---

### Task 7: 部署到 SCF

**Files:** 无（验证步骤）

- [ ] **Step 1: 执行部署**

```bash
npx tsx scripts/deploy.ts
```

Expected: 构建 → 清理 → 打包 → 上传 COS → 部署 SCF，全程无报错。

- [ ] **Step 2: 验证 SCF 运行**

部署完成后访问 SCF 提供的 API 端点，确认服务正常响应，无 `invalid ELF header` 或 `GLIBC_2.29 not found` 错误。

---

## 验证清单（部署前）

| 检查项 | 命令/方法 |
|--------|----------|
| better-sqlite3 不在 dependencies 中 | `node -e "console.log('better-sqlite3' in require('./package.json').dependencies)"` → false |
| node-sqlite3-wasm 在 dependencies 中 | `node -e "console.log(require('./package.json').dependencies['node-sqlite3-wasm'])"` → ^0.8.58 |
| lib/db.ts 导入 node-sqlite3-wasm | `grep "node-sqlite3-wasm" lib/db.ts` |
| lib/db.ts 不再导入 better-sqlite3 | `grep "better-sqlite3" lib/db.ts` → 无输出 |
| next.config.ts 无 serverExternalPackages | `grep "serverExternalPackages" next.config.ts` → 无输出 |
| deploy.ts 无 better-sqlite3 引用 | `grep -c "better-sqlite3\|swapBetter\|verifyBetter\|ELF_MAGIC\|parseScfNode\|NODE_ABI_MAP\|extractNodeFromTar\|gunzipSync\|resolveSymlinks\|lstatSync" scripts/deploy.ts` → 0 |
| deploy.ts 无 zlib import | `grep "gunzipSync" scripts/deploy.ts` → 无输出 |
| `npm run build` 成功 | 执行构建 |
| standalone 不含 better-sqlite3 | `ls .next/standalone/node_modules/better-sqlite3/` → 报错不存在 |
| standalone 含 node-sqlite3-wasm | `ls .next/standalone/node_modules/node-sqlite3-wasm/` → 存在 |
| `npm run test` 通过 | 执行测试 |

---

## 解决的错误

| 部署错误 | 根因 | 如何解决 |
|---------|------|---------|
| `invalid ELF header` | 本地构建的 PE32+ 二进制被部署到 Linux | ✅ node-sqlite3-wasm 是 WASM，无原生二进制 |
| `GLIBC_2.29 not found` | GitHub Actions 编译的 .node 文件链接 GLIBC 2.29，SCF 只有 2.28 | ✅ WASM 不依赖 GLIBC |
| Node ABI 不匹配 | better-sqlite3 v11.10.0 无 Node 24 (ABI 135) 预编译包 | ✅ WASM 无 Node ABI 依赖 |

## 净变化

| 指标 | 数值 |
|------|------|
| 修改文件 | 5 个 |
| 代码改动（增/删） | +3 行 / -165 行 |
| 净代码减少 | ~162 行 |
| 依赖减少 | 2 个包（better-sqlite3 + @types/better-sqlite3） |
| 部署步骤减少 | 2 步（二进制下载 + 验证） |
