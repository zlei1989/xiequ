# CLAUDE.md

请用中文交流。Next.js 规则见 [AGENTS.md](AGENTS.md)。

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 (localhost:3000) |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run test` | 运行 vitest 测试 |
| `npm run test:watch` | vitest 监视模式 |
| `npm start` | 生产模式启动（需先 build） |

> **安装依赖只能用 npm，禁止 pnpm**（pnpm 的符号链接结构与 Next.js standalone 模式不兼容）。

## 部署

项目使用 Next.js `output: 'standalone'` 模式。构建后：

```
.next/standalone/          ← 自包含部署目录（~34 MB）
  server.js                ← node server.js 直接启动
  node_modules/            ← 平铺依赖（npm 天然支持）
  .next/                   ← Next.js 运行时 + static
```

1. 拷贝 `.next/standalone/` 到目标服务器
2. `node server.js` 启动，**无需 npm install**

## 架构要点

- **Next.js 16 App Router** — 使用 Server Components、Server Actions、API Routes 混合模式
- **启动时自动初始化 SQLite** — `instrumentation.ts` 在 Node.js runtime 调用 `initDb()` 建表
- **SQLite 实现** — 使用 `sql.js`（WASM），通过 `lib/sqljs-wrapper.ts` 封装，兼容 better-sqlite3 API；`better-sqlite3` 已废弃移除（原生编译不可跨平台部署）
- **`@/` 路径别名** 指向项目根目录
- **`app/watering/`** — 浇花 IoT 模块（服务端）；**`app/watering/rom-v2/`** — ESP32 固件（Arduino C++，4 路水泵 PWM、传感器采集、WiFi 状态同步）；**`app/travel/`** — 旅行计划模块
- **`components/antd-mobile-compat.tsx`** — antd-mobile v5 与 Next.js SSR 的兼容层
- **`lib/db.ts`** — SQLite 数据库连接（sql.js）；**`lib/oss.ts`** — 腾讯云 COS 客户端
- **测试文件** 放在 `__tests__/` 目录，使用 vitest + node 环境
