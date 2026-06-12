# CLAUDE.md

请用中文交流。

## 约束

- **写 Next.js 代码前先读 `node_modules/next/dist/docs/` 中的相关指南** — 当前版本可能有训练数据未覆盖的破坏性变更
- **代码变更后、进入审查阶段前，必须先执行格式化与检查** — 顺序：`npm run format` → `npm run check` → 修复所有错误 → 再进入代码审查
- **只用 npm** — pnpm 符号链接与 Next.js standalone 模式不兼容

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 (localhost:3000) |
| `npm run build` | 生产构建 |
| `npm run format` | ESLint + Stylelint 自动修复 |
| `npm run check` | TypeScript 类型检查 + Lint 检查 |
| `npm run test` | 运行 vitest 测试 |

## 注释

| 规则 | 说明 |
|------|------|
| 风格 | JS/TS/TSX 用 JSDoc（`/** ... */`）；中文，简洁，先说"做什么"再说"怎么做" |
| 文件头 | 简要说明文件职责 + 注意事项 |
| 嵌套 > 2 层 | 必须注释业务含义 |
| 重要方法 | 必须注释算法思路或业务逻辑 |
| 特殊处理 | 环境判断、响应处理等需注释原因 |
| 密度 | 同文件内保持一致 |

## 日志

| 级别 | 场景 |
|------|------|
| ERROR | 业务异常、外部调用失败 — 必须打印堆栈和业务上下文 |
| WARN | 降级、重试、超时、配置缺失但可继续 |
| INFO | 请求入口、关键状态变更、外部调用耗时 >500ms |
| DEBUG | 分支走向、中间变量、循环关键节点（生产默认关闭） |

**必须打日志的点位**：请求入口（INFO + 标识）、外部调用（DEBUG 参数 + INFO 耗时）、异常捕获（ERROR + 堆栈 + 上下文）、关键分支（DEBUG + 依据）

## 技术栈

- **路由** — App Router（Server Components + Server Actions + API Routes）
- **数据库** — SQLite（WASM），初始化见 `instrumentation.ts`，连接见 `lib/db.ts`
- **存储** — 腾讯云 COS，客户端见 `lib/oss.ts`
- **UI** — antd-mobile，SSR 兼容层见 `components/antd-mobile-compat.tsx`
- **测试** — vitest + node，文件放 `__tests__/`
- **路径别名** — `@/` 指向项目根目录

## 目录

| 路径 | 说明 |
|------|------|
| `app/watering/` | 浇花 IoT 服务端 |
| `app/watering/rom-v2/` | ESP32 固件（Arduino C++） |
| `app/travel/` | 旅行计划模块 |
| `lib/db.ts` | 数据库连接 |
| `lib/oss.ts` | 对象存储客户端 |
| `components/antd-mobile-compat.tsx` | antd-mobile SSR 兼容层 |
| `__tests__/` | 测试文件 |
