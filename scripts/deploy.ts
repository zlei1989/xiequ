import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
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

// ─── 构建 ────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");

/** 执行 next build（Windows 下 .next/standalone 可能被锁定，自动重试） */
function buildProject(): void {
  console.log("🔨 正在构建 Next.js 项目...");
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
      // Windows 下指定 bash 避免 cmd 的中文路径 EBUSY 问题
      const shell = process.platform === "win32" ? process.env.SHELL || "bash.exe" : true;
      const result = execSync("npx next build", { cwd: ROOT, stdio: "pipe", encoding: "utf-8", shell });
      process.stdout.write(result);
      console.log("✅ 构建完成");

      // standalone 模式：复制 public 和 static 到 standalone 目录
      console.log("📋 复制 static/public 到 standalone...");
      const standaloneDir = join(ROOT, ".next", "standalone");
      execSync(`cp -r public "${standaloneDir}/"`, { cwd: ROOT, stdio: "ignore" });
      execSync(`mkdir -p "${standaloneDir}/.next" && cp -r .next/static "${standaloneDir}/.next/"`, { cwd: ROOT, stdio: "ignore" });
      console.log("✅ 复制完成");
      return;
    } catch (err: any) {
      // 打印输出（pipe 模式下不会自动显示）
      if (err.stdout) process.stdout.write(err.stdout);
      if (err.stderr) process.stderr.write(err.stderr);
      const msg = (err.stderr || err.message || "").toString();
      if (msg.includes("EBUSY") && attempt < maxRetries) {
        console.log(`⚠️  构建目录被锁定，2 秒后重试 (${attempt}/${maxRetries})...`);
        execSync("cmd /c rd /s /q .next 2>nul", { cwd: ROOT, stdio: "ignore" });
        // 等待 2 秒让文件锁释放
        // 等待 2 秒让文件锁释放（spin-wait 兼容所有平台）
        const end = Date.now() + 2000;
        while (Date.now() < end) { /* wait */ }
      } else {
        console.error("❌ 构建失败，请检查上方错误信息");
        process.exit(1);
      }
    }
  }
}

// ─── 打包 ────────────────────────────────────────────────

const TMP_DIR = join(ROOT, ".deploy-tmp");

/** 将 .next/ + scf_bootstrap + package.json 打包为 zip */
function createZip(config: DeployConfig): Promise<string> {
  const packageName = `server_scf_${dayjs().format("YYYYMMDDHHmmss")}.zip`;
  const zipPath = join(TMP_DIR, packageName);

  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }

  console.log(`📦 正在打包 → ${packageName}`);

  return new Promise<string>((resolvePromise, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });

    output.on("close", () => {
      const size = statSync(zipPath).size;
      const sizeMB = (size / (1024 * 1024)).toFixed(2);
      console.log(`✅ 打包完成 (${sizeMB} MB)`);
      if (size > 50 * 1024 * 1024) {
        console.warn(`⚠️  包体积超过 50MB，部署可能较慢`);
      }
      resolvePromise(zipPath);
    });

    output.on("error", (err: Error) => {
      console.error("❌ 写入文件失败:", err.message);
      reject(err);
    });

    archive.on("error", (err: Error) => {
      console.error("❌ 打包失败:", err.message);
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
    // 添加 serverless.yml
    archive.file(join(ROOT, "serverless.yml"), { name: "serverless.yml" });
    // 添加 .next/standalone（standalone 模式下的运行目录）
    archive.directory(join(ROOT, ".next", "standalone"), ".next/standalone");

    archive.finalize();
  });
}

// ─── 上传 COS ────────────────────────────────────────────

/** 上传 zip 到腾讯云 COS，返回对象 Key */
function uploadToCos(config: DeployConfig, zipPath: string): Promise<string> {
  const filename = basename(zipPath);
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
    rmSync(TMP_DIR, { recursive: true, force: true });
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
