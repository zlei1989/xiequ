/**
 * Next.js → 腾讯云 SCF 自动化部署脚本
 *
 * 完整流水线：加载配置 → 构建 → 清理 standalone → 修复符号链接 → 打包 zip
 *            → 上传 COS → 更新 SCF 函数代码
 *
 * 环境变量要求（来自 .env.local）：
 *   COS 相关: DEPLOY_COS_BUCKET, DEPLOY_COS_REGION, DEPLOY_COS_SECRET_ID, DEPLOY_COS_SECRET_KEY
 *   SCF 相关: DEPLOY_SCF_REGION, DEPLOY_SCF_SECRET_ID, DEPLOY_SCF_SECRET_KEY, DEPLOY_SCF_FUNCTION
 *
 * 技术栈：archiver (zip), cos-nodejs-sdk-v5 (上传), tencentcloud-sdk-nodejs (SCF)
 */

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
  lstatSync,
  readlinkSync,
} from "fs";
import { resolve, join, basename, relative, dirname } from "path";
import archiver from "archiver";
import COS from "cos-nodejs-sdk-v5";
import { scf } from "tencentcloud-sdk-nodejs";
import dayjs from "dayjs";

// ─── 配置加载 ────────────────────────────────────────────

/**
 * 从 .env.local 手动解析并加载环境变量
 *
 * tsx 不会自动加载 .env.local，需要逐行解析 KEY=VALUE 格式。
 * 已存在的环境变量不会被覆盖（命令行注入优先）。
 */
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

/**
 * 读取并校验所有部署环境变量
 *
 * 逐一检查 requiredVars 列表中的变量，缺失则收集后统一报错退出。
 * 返回类型安全的 DeployConfig 对象。
 */
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

// ─── 部署包精简 ────────────────────────────────────────────

/** 需从 standalone 中删除的非运行时文件列表 */
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

/**
 * 递归删除目录（不存在则静默跳过）
 *
 * 使用 rmSync 的 recursive + force 选项，无需手动遍历。
 */
function rmDir(dirPath: string) {
  if (!existsSync(dirPath)) return;
  rmSync(dirPath, { recursive: true, force: true });
}

/**
 * 清理 standalone 目录中的非运行时文件
 *
 * 按 CLEANUP_PATTERNS 列表删除文档、配置、源码等不参与运行的冗余文件，
 * 并确保 .env.local 以项目根目录版本为准（覆盖 Next.js trace 生成的版本）。
 */
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

// ─── 工具 ────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");

/**
 * 递归复制目录（不存在则静默跳过）
 *
 * 使用同步 I/O 逐个文件复制，适用于部署脚本中少量目录的拷贝。
 */
function copyDir(src: string, dest: string) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

/** 递归遍历目录，将指向外部（非 standalone 内）的绝对路径符号链接
 *  替换为实际文件副本。
 *  Turbopack 为 serverExternalPackages 创建绝对路径符号链接（如
 *  node-sqlite3-wasm-c23ad69eff3ea050 → /d/.../node_modules/node-sqlite3-wasm/），
 *  这些符号链接在 Linux 生产环境中无法解析，导致 require() 失败。
 *  选择复制而非相对符号链接，是因为 Windows 创建符号链接需要管理员权限。
 */
function resolveSymlinks(standaloneDir: string): void {
  console.log("🔗 解析 standalone 中的外部符号链接...");
  let fixed = 0;

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        // lstatSync 对断链或无权限的文件会抛出异常，跳过这些项
        continue;
      }
      if (stat.isSymbolicLink()) {
        const linkTarget = readlinkSync(fullPath);
        const resolvedTarget = resolve(dirname(fullPath), linkTarget);
        // 仅处理指向 standalone 目录外部的符号链接
        if (!resolvedTarget.startsWith(standaloneDir)) {
          // 查找 standalone 内是否存在对应的实际文件
          // 符号链接名称如 "node-sqlite3-wasm-c23ad69eff3ea050"，
          // 实际包可能在 standalone/node_modules/ 下
          const packageName = entry.replace(/-[0-9a-f]{16}$/, "");
          const possibleTarget = join(standaloneDir, "node_modules", packageName);
          if (existsSync(possibleTarget) && statSync(possibleTarget).isDirectory()) {
            // 删除断链，复制实际文件
            unlinkSync(fullPath);
            copyDir(possibleTarget, fullPath);
            console.log(`   修复: ${relative(standaloneDir, fullPath)} ← ${possibleTarget}`);
            fixed++;
          } else {
            console.warn(`   ⚠️  外部符号链接无内部对应: ${entry} → ${linkTarget}`);
          }
        }
      } else if (stat.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(standaloneDir);
  if (fixed > 0) {
    console.log(`✅ 已修复 ${fixed} 个外部符号链接`);
  } else {
    console.log("✅ 无需修复的外部符号链接");
  }
}

// ─── 构建 ────────────────────────────────────────────────

/**
 * 执行 next build
 *
 * 带 EBUSY 自动重试机制（Windows 下 .next 目录可能被杀毒软件锁定）。
 * 优先用 bash 执行避免 cmd 中文路径编码问题。
 */
function buildProject(): void {
  console.log("🔨 正在构建 Next.js 项目...");
  const buildStart = Date.now();
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Windows 下用 cmd rd 清理旧构建产物（bash rm -rf 可能失败）
      if (existsSync(join(ROOT, ".next"))) {
        if (process.platform === "win32") {
          execSync("cmd /c rd /s /q .next 2>nul", { cwd: ROOT, stdio: "ignore" });
        } else {
          execSync("rm -rf .next", { cwd: ROOT, stdio: "ignore" });
        }
      }
      // 用 pipe 模式捕获错误输出，检测 EBUSY 以触发重试
      // Windows 下优先使用 bash 避免 cmd 的中文路径编码导致 EBUSY；
      // 若 bash 不可用（如纯 PowerShell 环境）则回退到默认 shell
      let shell: string | boolean = true;
      if (process.platform === "win32") {
        // 探测可用的 bash：先试 SHELL 环境变量，再试 bash.exe
        const bashPath = process.env.SHELL || "bash.exe";
        try {
          execSync(`"${bashPath}" --version`, { stdio: "ignore", timeout: 5000 });
          shell = bashPath;
        } catch {
          // bash 不可用 → 回退默认 shell，中文路径项目可能构建失败
          console.warn("⚠️  bash 不可用，回退到默认 shell（若路径含中文可能失败）");
        }
      }
      const result = execSync("npx next build", { cwd: ROOT, stdio: "pipe", encoding: "utf-8", shell });
      process.stdout.write(result);
      const elapsed = ((Date.now() - buildStart) / 1000).toFixed(1);
      console.log(`✅ 构建完成 (${elapsed}s)`);
      return;
    } catch (err: any) {
      // 打印输出（pipe 模式下不会自动显示）
      if (err.stdout) process.stdout.write(err.stdout);
      if (err.stderr) process.stderr.write(err.stderr);
      const msg = (err.stderr || err.message || "").toString();
      if (msg.includes("EBUSY") && attempt < maxRetries) {
        console.log(`⚠️  构建目录被锁定，2 秒后重试 (${attempt}/${maxRetries})...`);
        execSync("cmd /c rd /s /q .next 2>nul", { cwd: ROOT, stdio: "ignore" });
        // 等待 2 秒让文件锁释放（spin-wait 兼容所有平台）
        const end = Date.now() + 2000;
        while (Date.now() < end) { /* wait */ }
      } else {
        // ERROR: 构建失败，打印堆栈方便追溯到具体阶段
        console.error("❌ 构建失败，请检查上方错误信息");
        if (err.stack) console.error(err.stack);
        process.exit(1);
      }
    }
  }
}

// ─── 打包 ────────────────────────────────────────────────

const TMP_DIR = join(ROOT, ".deploy-tmp");

/**
 * 将 .next/standalone/ + scf_bootstrap 打包为 zip
 *
 * 使用 archiver 流式压缩，输出到临时目录 .deploy-tmp/。
 * 压缩级别 1（最快），文件命名含时间戳以区分版本。
 *
 * @returns zip 文件本地路径
 */
function createZip(config: DeployConfig): Promise<string> {
  const packageName = `server_scf_${dayjs().format("YYYYMMDDHHmmss")}.zip`;
  const zipPath = join(TMP_DIR, packageName);

  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }

  console.log(`📦 正在打包 → ${packageName}`);
  const packStart = Date.now();

  return new Promise<string>((resolvePromise, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });

    output.on("close", () => {
      const size = statSync(zipPath).size;
      const sizeMB = (size / (1024 * 1024)).toFixed(2);
      const elapsed = ((Date.now() - packStart) / 1000).toFixed(1);
      console.log(`✅ 打包完成 (${sizeMB} MB, ${elapsed}s)`);
      if (size > 50 * 1024 * 1024) {
        console.warn(`⚠️  包体积超过 50MB，部署可能较慢`);
      }
      resolvePromise(zipPath);
    });

    output.on("error", (err: Error) => {
      console.error("❌ 写入文件失败:", err.message);
      if (err.stack) console.error(err.stack);
      reject(err);
    });

    archive.on("error", (err: Error) => {
      console.error("❌ 打包失败:", err.message);
      if (err.stack) console.error(err.stack);
      reject(err);
    });

    archive.on("progress", (progress: any) => {
      const pct = progress.entries.processed;
      const total = progress.entries.total;
      if (total > 0 && pct % 100 === 0) {
        console.log(`   打包进度: ${pct}/${total} 文件`);
      }
    });

    archive.pipe(output);

    // 添加 scf_bootstrap（必须放在根目录，SCF 入口）
    archive.file(join(ROOT, "scf_bootstrap"), { name: "scf_bootstrap" });
    // 添加 .next/standalone（standalone 模式下的运行目录）
    archive.directory(join(ROOT, ".next", "standalone"), ".next/standalone");

    archive.finalize();
  });
}

// ─── 上传 COS ────────────────────────────────────────────

/**
 * 上传 zip 到腾讯云 COS
 *
 * 通过 cos-nodejs-sdk-v5 以流式上传部署包到指定 Bucket。
 * 上传成功后在 COS 控制台可直接下载 zip。
 *
 * @param config - 含 COS 密钥和 Bucket 的部署配置
 * @param zipPath - 本地 zip 文件路径
 * @returns COS 对象 Key（用于 SCF 部署引用）
 */
function uploadToCos(config: DeployConfig, zipPath: string): Promise<string> {
  const filename = basename(zipPath);
  const objectKey = `deploy/${filename}`;
  const fileSizeMB = (statSync(zipPath).size / (1024 * 1024)).toFixed(2);

  console.log(`☁️  正在上传到 COS → ${config.cosBucket}/${objectKey} (${fileSizeMB} MB)`);
  const uploadStart = Date.now();

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
          // SDK 回调错误为 CosSdkError 对象（非 Error 实例），打印完整 JSON 以获取上下文
          console.error(`❌ COS 上传失败 (${config.cosRegion}/${config.cosBucket}/${objectKey}):`, err.message || err);
          try { console.error(JSON.stringify(err)); } catch { /* 序列化失败不阻断流程 */ }
          reject(err);
          return;
        }
        const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
        console.log(`✅ COS 上传完成 (${elapsed}s, statusCode=${data.statusCode})`);
        resolvePromise(objectKey);
      }
    );
  });
}

// ─── 部署 SCF ────────────────────────────────────────────

/**
 * 调用 SCF API 更新函数代码
 *
 * 通过 tencentcloud-sdk-nodejs 的 UpdateFunctionCode 接口，
 * 将 COS 上的 zip 包部署到指定云函数。
 * InstallDependency=TRUE 表示 SCF 在部署时自动 npm install。
 */
async function deployToScf(config: DeployConfig, objectKey: string): Promise<void> {
  console.log(`🚀 正在部署到 SCF → ${config.scfFunction}`);
  const deployStart = Date.now();

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
    const elapsed = ((Date.now() - deployStart) / 1000).toFixed(1);
    console.log(`✅ 部署成功 (${elapsed}s)`);
    console.log(`   RequestId: ${result.RequestId}`);
  } catch (err: any) {
    // 打印异常上下文：函数名、地域、COS 对象，方便在 SCF 控制台追溯
    console.error(`❌ SCF 部署失败 (函数=${config.scfFunction}, 地域=${config.scfRegion}, COS=${objectKey}):`, err.message || err);
    if (err.stack) console.error(err.stack);
    if (err.requestId) {
      console.error(`   RequestId: ${err.requestId}`);
    }
    process.exit(1);
  }
}

// ─── 主流程 ──────────────────────────────────────────────

/**
 * 部署流水线入口
 *
 * 按顺序执行：配置加载 → 构建 → 清理 → 修复符号链接 → 复制静态资源
 *            → 打包 → COS 上传 → SCF 部署 → 清理临时文件
 *
 * 任一步骤失败均会直接退出（process.exit(1)），不继续后续步骤。
 */
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("   Next.js SCF 自动化部署");
  console.log("═══════════════════════════════════════");
  const totalStart = Date.now();

  // 1. 加载配置
  loadEnv();
  const config = loadConfig();
  console.log(`📍 COS: ${config.cosBucket} (${config.cosRegion})`);
  console.log(`📍 SCF: ${config.scfFunction} (${config.scfRegion})`);

  // 2. 构建
  buildProject();

  // 2.5. 清理 standalone 非运行时文件
  cleanStandalone();

  // 2.55. 修复 Turbopack 为 serverExternalPackages 创建的绝对路径符号链接
  // 这些符号链接在 Linux 生产环境中无法解析，需替换为相对路径
  const standaloneDir = join(ROOT, ".next", "standalone");
  resolveSymlinks(standaloneDir);

  // 2.6. standalone 模式：复制 public 和 static 到 standalone 目录
  console.log("📋 复制 static/public 到 standalone...");
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

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log("═══════════════════════════════════════");
  console.log(`   🎉 部署完成！总耗时 ${totalElapsed}s`);
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ 部署异常（未在子步骤中捕获）:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
