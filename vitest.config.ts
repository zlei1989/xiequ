import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      /** antd-mobile 的 CJS 入口 require("./global.css")，node 环境无法处理，直接映射到 ESM 入口 */
      "antd-mobile": path.resolve(__dirname, "node_modules/antd-mobile/es/index.js"),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    css: true,
  },
});
