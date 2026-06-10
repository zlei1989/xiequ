import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  readFileSync,
  readdirSync,
  createReadStream,
  createWriteStream,
  unlinkSync,
  rmSync,
  lstatSync,
} from "fs";
import { resolve, join } from "path";
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

/** 执行 next build */
function buildProject(): void {
  console.log("🔨 正在构建 Next.js 项目...");
  try {
    execSync("npx --yes next build", { cwd: ROOT, stdio: "inherit" });
    console.log("✅ 构建完成");
  } catch {
    console.error("❌ 构建失败，请检查上方错误信息");
    process.exit(1);
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
    // 添加 package.json（SCF 需要它来安装依赖）
    archive.file(join(ROOT, "package.json"), { name: "package.json" });

    // 添加 .next 生产文件（排除 dev/cache/diagnostics/trace/types）
    const nextDir = join(ROOT, ".next");
    const excludeDirs = new Set(["dev", "cache", "diagnostics", "trace", "types"]);
    for (const entry of readdirSync(nextDir)) {
      const src = join(nextDir, entry);
      const dest = `.next/${entry}`;
      if (excludeDirs.has(entry)) continue;
      if (lstatSync(src).isDirectory()) {
        archive.directory(src, dest);
      } else {
        archive.file(src, { name: dest });
      }
    }

    archive.finalize();
  });
}

// ─── 上传 COS ────────────────────────────────────────────

/** 上传 zip 到腾讯云 COS，返回对象 Key */
function uploadToCos(config: DeployConfig, zipPath: string): Promise<string> {
  const filename = zipPath.replace(/^.*[\\/]/, "");
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
