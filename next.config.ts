import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // node-sqlite3-wasm 需要外部化：其内部通过 __dirname 定位 .wasm 文件，
  // 打包会破坏 .js 与 .wasm 的相对路径关系
  serverExternalPackages: ['node-sqlite3-wasm'],
};

export default nextConfig;
