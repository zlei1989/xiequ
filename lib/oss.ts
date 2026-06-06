/**
 * OSS 对象存储客户端封装
 *
 * 使用时需要配置以下环境变量：
 * - OSS_REGION: 区域
 * - OSS_ACCESS_KEY_ID: AccessKey ID
 * - OSS_ACCESS_KEY_SECRET: AccessKey Secret
 * - OSS_BUCKET: Bucket 名称
 * - OSS_ENDPOINT: 自定义 Endpoint（可选）
 */

export interface OssConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
}

export function getOssConfig(): OssConfig {
  const config: OssConfig = {
    region: process.env.OSS_REGION || "",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
    bucket: process.env.OSS_BUCKET || "",
    endpoint: process.env.OSS_ENDPOINT,
  };

  if (!config.region || !config.accessKeyId || !config.accessKeySecret || !config.bucket) {
    throw new Error("OSS 配置不完整，请检查环境变量");
  }

  return config;
}
