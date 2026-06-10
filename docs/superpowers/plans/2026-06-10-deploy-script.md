# 自动化部署脚本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Next.js 项目添加 `pnpm deploy` 单指令 SCF 部署能力，敏感配置从 `.env.local` 读取不提交 git。

**Architecture:** 一个独立 TypeScript 脚本 `scripts/deploy.ts`，通过 `tsx` 直接执行。5 个阶段顺序执行：加载配置 → 构建 → 打包 zip → 上传 COS → 部署 SCF，任一失败中断。配置使用 `DEPLOY_*` 环境变量，脚本不含密钥可安全提交。

**Tech Stack:** tsx (脚本执行器), archiver (zip 打包), cos-nodejs-sdk-v5 (COS 上传), tencentcloud-sdk-nodejs (SCF 部署), dayjs (时间戳), Node.js child_process (执行构建)

---

## 文件总览

| 文件 | 操作 | 职责 |
|------|------|------|
| `scripts/deploy.ts` | 创建 | 部署脚本主逻辑（配置加载、构建、打包、上传、部署） |
| `package.json` | 修改 | 新增 `deploy` script、安装 `tsx` `archiver` `@types/archiver` |
| `.env.example` | 修改 | 新增 `DEPLOY_*` 变量模板 |

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: 安装 tsx、archiver、@types/archiver**

```bash
pnpm add -D tsx archiver @types/archiver
```

- [ ] **Step 2: 验证安装**

```bash
pnpm tsx --version
```

预期：输出 tsx 版本号。

---

### Task 2: 更新 .env.example 和 package.json

**Files:**
- Modify: `.env.example` (追加部署变量模板)
- Modify: `package.json` (新增 deploy script)

- [ ] **Step 1: 在 .env.example 末尾追加部署变量模板**

在 `.env.example` 文件末尾追加以下内容：

```bash
# ─── 部署：腾讯云 COS 上传 ─────────────────────────────
DEPLOY_COS_BUCKET=
DEPLOY_COS_REGION=
DEPLOY_COS_SECRET_ID=
DEPLOY_COS_SECRET_KEY=

# ─── 部署：腾讯云 SCF 云函数 ───────────────────────────
DEPLOY_SCF_REGION=
DEPLOY_SCF_SECRET_ID=
DEPLOY_SCF_SECRET_KEY=
DEPLOY_SCF_FUNCTION=
```

WaitRead the file first to see current content, then append.

Current `.env.example` content (末尾是 `WATERING_SLEEP_DURATION=300000` 行), append after the last line:

```diff
  WATERING_SLEEP_DURATION=300000     # 空闲深度睡眠时长（毫秒），默认 5 分钟
+
+ # ─── 部署：腾讯云 COS 上传 ─────────────────────────────
+ DEPLOY_COS_BUCKET=
+ DEPLOY_COS_REGION=
+ DEPLOY_COS_SECRET_ID=
+ DEPLOY_COS_SECRET_KEY=
+
+ # ─── 部署：腾讯云 SCF 云函数 ───────────────────────────
+ DEPLOY_SCF_REGION=
+ DEPLOY_SCF_SECRET_ID=
+ DEPLOY_SCF_SECRET_KEY=
+ DEPLOY_SCF_FUNCTION=
```

- [ ] **Step 2: 在 package.json 的 scripts 中新增 deploy**

```diff
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
-   "test:watch": "vitest"
+   "test:watch": "vitest",
+   "deploy": "npx tsx scripts/deploy.ts"
  },
```

- [ ] **Step 3: 提交**

```bash
git add .env.example package.json pnpm-lock.yaml
git commit -m "chore: add deploy script skeleton and env template"
```

---

### Task 3: 创建 scripts/deploy.ts — 配置加载与校验

**Files:**
- Create: `scripts/deploy.ts`

- [ ] **Step 1: 创建 scripts/ 目录**

```bash
mkdir -p scripts
```

- [ ] **Step 2: 写入配置加载与校验逻辑**

```typescript
// scripts/deploy.ts
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
  createReadStream,
  createWriteStream,
  unlinkSync,
  rmdirSync,
} from "fs";
import { resolve, join } from "path";
import archiver from "archiver";
import { createWriteStream } from "fs";
import COS from "cos-nodejs-sdk-v5";
import { scf } from "tencentcloud-sdk-nodejs";
import dayjs from "dayjs";

// ─── 配置加载 ────────────────────────────────────────────

/** 从 .env.local 文件加载环境变量（如果还未加载） */
function loadEnv() {
  const envPath = resolve(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    console.error("❌ 未找到 .env.local 文件，请先创建并配置部署变量");
    process.exit(1);
  }
  // tsx 不会自动加载 .env.local，需要手动解析
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

interface DeployConfig {
  cosBucket: string;
  cosRegion: string;
  cosSecretId: string;
  cosSecretKey: string;
  scfRegion: string;
  scfSecretId: string;
  scfSecretKey: string;
  scfFunction: string;
}

/** 读取并校验所有部署环境变量，缺失则报错退出 */
function loadConfig(): DeployConfig {
  const requiredVars: { key: string; label: string }[] = [
    { key: "DEPLOY_COS_BUCKET", label: "COS Bucket 名称" },
    { key: "DEPLOY_COS_REGION", label: "COS 地域" },
    { key: "DEPLOY_COS_SECRET_ID", label: "COS SecretId" },
    { key: "DEPLOY_COS_SECRET_KEY", label: "COS SecretKey" },
    { key: "DEPLOY_SCF_REGION", label: "SCF 地域" },
    { key: "DEPLOY_SCF_SECRET_ID", label: "SCF SecretId" },
    { key: "DEPLOY_SCF_SECRET_KEY", label: "SCF SecretKey" },
    { key: "DEPLOY_SCF_FUNCTION", label: "SCF 函数名称" },
  ];

  const missing: string[] = [];
  for (const { key, label } of requiredVars) {
    if (!process.env[key]) {
      missing.push(`  - ${key} (${label})`);
    }
  }

  if (missing.length > 0) {
    console.error("❌ 缺少以下部署配置（请检查 .env.local）：");
    console.error(missing.join("\n"));
    process.exit(1);
  }

  return {
    cosBucket: process.env.DEPLOY_COS_BUCKET!,
    cosRegion: process.env.DEPLOY_COS_REGION!,
    cosSecretId: process.env.DEPLOY_COS_SECRET_ID!,
    cosSecretKey: process.env.DEPLOY_COS_SECRET_KEY!,
    scfRegion: process.env.DEPLOY_SCF_REGION!,
    scfSecretId: process.env.DEPLOY_SCF_SECRET_ID!,
    scfSecretKey: process.env.DEPLOY_SCF_SECRET_KEY!,
    scfFunction: process.env.DEPLOY_SCF_FUNCTION!,
  };
}
```

- [ ] **Step 3: 验证脚本语法**

```bash
pnpm tsx --eval "console.log('tsx works')"
```

预期：输出 `tsx works`。

- [ ] **Step 4: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add config loading and validation"
```

---

### Task 4: 实现构建与打包阶段

**Files:**
- Modify: `scripts/deploy.ts` (追加 build 和 zip 函数)

- [ ] **Step 1: 在 scripts/deploy.ts 中追加构建函数**

在文件末尾追加以下代码：

```typescript
// ─── 构建 ────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");

/** 执行 next build */
function buildProject(): void {
  console.log("🔨 正在构建 Next.js 项目...");
  try {
    execSync("npx next build", { cwd: ROOT, stdio: "inherit" });
    console.log("✅ 构建完成");
  } catch {
    console.error("❌ 构建失败，请检查上方错误信息");
    process.exit(1);
  }
}
```

- [ ] **Step 2: 追加打包函数**

继续在文件末尾追加：

```typescript
// ─── 打包 ────────────────────────────────────────────────

const TMP_DIR = join(ROOT, ".deploy-tmp");

/** 将 .next/ + scf_bootstrap + package.json 打包为 zip */
function createZip(config: DeployConfig): string {
  const packageName = `server_scf_${dayjs().format("YYYYMMDDHHmmss")}.zip`;
  const zipPath = join(TMP_DIR, packageName);

  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }

  console.log(`📦 正在打包 → ${packageName}`);

  return new Promise<string>((resolvePromise, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      const sizeMB = (statSync(zipPath).size / (1024 * 1024)).toFixed(2);
      console.log(`✅ 打包完成 (${sizeMB} MB)`);
      if (statSync(zipPath).size > 50 * 1024 * 1024) {
        console.warn(`⚠️  包体积超过 50MB，部署可能较慢`);
      }
      resolvePromise(zipPath);
    });

    archive.on("error", (err: Error) => {
      console.error("❌ 打包失败:", err.message);
      reject(err);
    });

    archive.pipe(output);

    // 添加 .next 目录
    archive.directory(join(ROOT, ".next"), ".next");
    // 添加 scf_bootstrap（必须放在根目录，SCF 入口）
    archive.file(join(ROOT, "scf_bootstrap"), { name: "scf_bootstrap" });
    // 添加 package.json（SCF 需要它来安装依赖）
    archive.file(join(ROOT, "package.json"), { name: "package.json" });

    archive.finalize();
  });
}
```

- [ ] **Step 3: 验证语法可解析并检查逻辑**

```bash
npx tsx --eval "import './scripts/deploy.ts'; console.log('syntax ok')"
```

> 注意：此时因缺少 `.env.local` 中 `DEPLOY_*` 变量，脚本会报配置错误 — 这是预期行为，说明校验逻辑生效。

- [ ] **Step 4: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add build and zip packaging stages"
```

---

### Task 5: 实现 COS 上传阶段

**Files:**
- Modify: `scripts/deploy.ts` (追加 uploadToCos 函数)

- [ ] **Step 1: 追加 COS 上传函数**

在 `scripts/deploy.ts` 末尾追加：

```typescript
// ─── 上传 COS ────────────────────────────────────────────

/** 上传 zip 到腾讯云 COS，返回对象 Key */
function uploadToCos(config: DeployConfig, zipPath: string): Promise<string> {
  const filename = zipPath.split("/").pop() || zipPath.split("\\").pop()!;
  const objectKey = `deploy/${filename}`;

  console.log(`☁️  正在上传到 COS → ${config.cosBucket}/${objectKey}`);

  const cos = new COS({
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey,
  });

  return new Promise<string>((resolvePromise, reject) => {
    cos.putObject(
      {
        Bucket: config.cosBucket,
        Region: config.cosRegion,
        Key: objectKey,
        Body: createReadStream(zipPath),
        ContentLength: statSync(zipPath).size,
      },
      (err, data) => {
        if (err) {
          console.error("❌ COS 上传失败:", err.message || err);
          reject(err);
          return;
        }
        console.log(`✅ COS 上传完成 (${data.statusCode})`);
        resolvePromise(objectKey);
      }
    );
  });
}
```

- [ ] **Step 2: 验证语法**

```bash
npx tsx --eval "import './scripts/deploy.ts'; console.log('syntax ok')"
```

- [ ] **Step 3: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add COS upload stage"
```

---

### Task 6: 实现 SCF 部署阶段与主流程

**Files:**
- Modify: `scripts/deploy.ts` (追加 deployToScf 函数和 main 入口)

- [ ] **Step 1: 追加 SCF 部署函数**

在 `scripts/deploy.ts` 末尾追加：

```typescript
// ─── 部署 SCF ────────────────────────────────────────────

/** 调用 SCF API 更新函数代码 */
async function deployToScf(config: DeployConfig, objectKey: string): Promise<void> {
  console.log(`🚀 正在部署到 SCF → ${config.scfFunction}`);

  const ScfClient = scf.v20180416.Client;
  const client = new ScfClient({
    credential: {
      secretId: config.scfSecretId,
      secretKey: config.scfSecretKey,
    },
    region: config.scfRegion,
  });

  try {
    const result = await client.UpdateFunctionCode({
      FunctionName: config.scfFunction,
      CosBucketName: config.cosBucket,
      CosBucketRegion: config.cosRegion,
      CosObjectName: objectKey,
      InstallDependency: "TRUE",
    });
    console.log("✅ 部署成功");
    console.log(`   RequestId: ${result.RequestId}`);
  } catch (err: any) {
    console.error("❌ SCF 部署失败:", err.message || err);
    if (err.requestId) {
      console.error(`   RequestId: ${err.requestId}`);
    }
    process.exit(1);
  }
}
```

- [ ] **Step 2: 追加主流程入口函数**

继续在文件末尾追加 main 函数：

```typescript
// ─── 主流程 ──────────────────────────────────────────────

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

  // 3. 打包
  const zipPath = await createZip(config);

  // 4. 上传 COS
  const objectKey = await uploadToCos(config, zipPath);

  // 5. 部署 SCF
  await deployToScf(config, objectKey);

  // 清理临时文件
  try {
    unlinkSync(zipPath);
    rmdirSync(TMP_DIR);
    console.log("🧹 已清理临时文件");
  } catch {
    // 清理失败不影响整体结果
  }

  console.log("═══════════════════════════════════════");
  console.log("   🎉 部署完成！");
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ 部署异常:", err.message || err);
  process.exit(1);
});
```

- [ ] **Step 3: 验证完整脚本语法**

```bash
npx tsx --eval "import './scripts/deploy.ts'; console.log('syntax ok')"
```

预期：因缺少 `.env.local` 中 `DEPLOY_*` 变量，脚本报配置错误并退出 — 语法正确。

- [ ] **Step 4: 提交**

```bash
git add scripts/deploy.ts
git commit -m "feat(deploy): add SCF deployment stage and main flow"
```

---

### Task 7: 端到端验证

**Files:** 无新建，确认完整流程

- [ ] **Step 1: 确认 .env.local 中有部署变量**

检查 `.env.local` 中是否包含所有 `DEPLOY_*` 变量。如未配置，参考 `.env.example` 中的 `DEPLOY_*` 模板填入真实值。

- [ ] **Step 2: 执行完整部署**

```bash
pnpm deploy
```

预期输出：
```
═══════════════════════════════════════
   Next.js SCF 自动化部署
═══════════════════════════════════════
📍 COS: xxx (ap-xxx)
📍 SCF: xxx (ap-xxx)
🔨 正在构建 Next.js 项目...
✅ 构建完成
📦 正在打包 → server_scf_20260610235959.zip
✅ 打包完成 (X.XX MB)
☁️  正在上传到 COS → xxx/deploy/server_scf_20260610235959.zip
✅ COS 上传完成 (200)
🚀 正在部署到 SCF → xxx
✅ 部署成功
   RequestId: xxx
🧹 已清理临时文件
═══════════════════════════════════════
   🎉 部署完成！
═══════════════════════════════════════
```

- [ ] **Step 3: 确认 .deploy-tmp/ 未被 git 追踪**

```bash
git status
```

预期：`scripts/deploy.ts` 被追踪，`.deploy-tmp/` 和 `.env.local` 不在 git 中。（`.deploy-tmp` 已在 `.gitignore` 的 `**/.tmp` 规则下被忽略，或脚本运行后自动清理）

---

## 清理说明

部署完成后 `main()` 末尾会删除 zip 文件和 `.deploy-tmp/` 目录。如果脚本被 Ctrl+C 中断，`.deploy-tmp/` 目录可能残留，下次部署会复用该目录，不影响功能。如需手动清理：`rm -rf .deploy-tmp`。
