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
