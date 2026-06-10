# CLAUDE.md

请用中文交流。Next.js 规则见 [AGENTS.md](AGENTS.md)。

## 命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (localhost:3000) |
| `pnpm build` | 生产构建 |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 运行 vitest 测试 |
| `pnpm test:watch` | vitest 监视模式 |

## 架构要点

- **Next.js 16 App Router** — 使用 Server Components、Server Actions、API Routes 混合模式
- **启动时自动初始化 SQLite** — `instrumentation.ts` 在 Node.js runtime 调用 `initDb()` 建表
- **双 SQLite 实现** — `sql.js`（WASM，浏览器端）和 `better-sqlite3`（原生，服务端），通过 `lib/sqljs-wrapper.ts` 封装
- **`@/` 路径别名** 指向项目根目录
- **`app/watering/`** — 浇花 IoT 模块（服务端）；**`app/watering/rom-v2/`** — ESP32 固件（Arduino C++，4 路水泵 PWM、传感器采集、WiFi 状态同步）；**`app/travel/`** — 旅行计划模块
- **`components/antd-mobile-compat.tsx`** — antd-mobile v5 与 Next.js SSR 的兼容层
- **`lib/db.ts`** — better-sqlite3 数据库连接；**`lib/oss.ts`** — 腾讯云 COS 客户端
- **测试文件** 放在 `__tests__/` 目录，使用 vitest + node 环境
