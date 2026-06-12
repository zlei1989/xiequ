# 自动化部署脚本设计方案

## 概述

为 Next.js 项目设计一个 SCF（腾讯云云函数）自动化部署脚本，实现单指令部署。敏感配置通过 `.env.local` 管理，脚本本身不含密钥可安全提交 git。

## 文件结构

```
service/
├── scripts/
│   └── deploy.ts          ← 新增：部署脚本（提交到 git）
├── .env.local              ← 已有：存敏感配置（已被 .gitignore 忽略）
├── .env.example            ← 已有：加入部署相关示例变量（仅 key 名，值留空）
├── scf_bootstrap           ← 已有：SCF 启动脚本
├── serverless.yml          ← 已删除
└── package.json            ← 新增 "deploy" script
```

## 部署流程

5 个阶段，顺序执行，任一失败立即中断：

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1. 加载  │───▶│ 2. 构建  │───▶│ 3. 打包  │───▶│ 4. 上传  │───▶│ 5. 部署  │
│   配置   │    │  Next.js │    │  → zip   │    │  → COS   │    │  → SCF   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

| 阶段 | 说明 |
|------|------|
| **1. 加载配置** | 从 `.env.local` 读取所有 `DEPLOY_*` 变量，校验必填项，缺失则报错退出 |
| **2. 构建** | 执行 `next build`（等同于 `pnpm build`），失败则中断 |
| **3. 打包** | 用 `archiver` 将 `.next/` + `scf_bootstrap` + `package.json` 打成 zip，文件名含时间戳 |
| **4. 上传 COS** | 用 `cos-nodejs-sdk-v5` 上传 zip 到指定 bucket/path |
| **5. 部署 SCF** | 用 `tencentcloud-sdk-nodejs` 调用 `UpdateFunctionCode`，绑定 COS 上刚上传的对象 |

每个阶段有 `console.log` 输出进度，失败抛出明确错误信息。

## 环境变量

### `.env.local` 中新增变量（带值，不提交 git）

```bash
# ---- COS 上传 ----
DEPLOY_COS_BUCKET=xxx       # bucket 名称
DEPLOY_COS_REGION=xxx       # 地域，如 ap-guangzhou
DEPLOY_COS_SECRET_ID=xxx    # COS 访问凭证 ID
DEPLOY_COS_SECRET_KEY=xxx   # COS 访问凭证 Key

# ---- SCF 部署 ----
DEPLOY_SCF_REGION=xxx       # 云函数地域，如 ap-guangzhou
DEPLOY_SCF_SECRET_ID=xxx    # SCF 接口调用凭证 ID
DEPLOY_SCF_SECRET_KEY=xxx   # SCF 接口调用凭证 Key
DEPLOY_SCF_FUNCTION=xxx     # 函数名称
```

### `.env.example` 中新增模板（提交 git）

```bash
# ---- COS 上传 ----
DEPLOY_COS_BUCKET=
DEPLOY_COS_REGION=
DEPLOY_COS_SECRET_ID=
DEPLOY_COS_SECRET_KEY=

# ---- SCF 部署 ----
DEPLOY_SCF_REGION=
DEPLOY_SCF_SECRET_ID=
DEPLOY_SCF_SECRET_KEY=
DEPLOY_SCF_FUNCTION=
```

### 设计决策

- 使用 `DEPLOY_` 前缀，与运行时变量（如 `WATERING_*`）区分
- COS 和 SCF 凭证分开声明——多数情况相同，但允许独立配置更灵活
- 脚本启动时校验所有变量，缺哪个报哪个

## 打包内容

zip 包内结构（对应 SCF 函数运行时根目录）：

```
server_scf_20260610245959.zip
├── scf_bootstrap       # SCF 入口启动脚本（已有）
├── package.json        # 运行时依赖声明
├── node_modules/       # 生产依赖（由 SCF InstallDependency 自动安装）
└── .next/              # Next.js 构建产物
    ├── standalone/
    ├── static/
    └── ...
```

> `node_modules/` 不打入 zip 包，由 SCF 的 `InstallDependency: "TRUE"` 参数在部署时在线安装，减小包体积。

## 错误处理

| 场景 | 行为 |
|------|------|
| 配置缺失 | 脚本启动立即校验，列出所有缺失变量，`process.exit(1)` |
| `next build` 失败 | 捕获退出码，打印错误信息，中断后续步骤 |
| COS 上传失败 | 捕获 SDK 异常，打印详细错误（含网络错误、权限错误） |
| SCF 部署失败 | 捕获 SDK 异常，打印请求 ID 便于腾讯云侧排查 |
| zip 包体积 >50MB | 打印警告（SCF 代码包实际限制 500MB，但太大的包部署慢） |

## 调用方式

```bash
# package.json
"deploy": "npx tsx scripts/deploy.ts"

# 单指令部署
pnpm deploy
```

使用 `tsx` 直接执行 TypeScript 脚本，无需预编译步骤。`tsx` 需加入 devDependencies。

## 依赖关系

| 包 | 用途 | 来源 |
|---|---|---|
| `tsx` | 直接执行 .ts 脚本 | 新增 devDependencies |
| `archiver` | 创建 zip 压缩包 | 新增 devDependencies |
| `cos-nodejs-sdk-v5` | 上传文件到 COS | 已有 dependencies |
| `tencentcloud-sdk-nodejs` | 调用 SCF UpdateFunctionCode | 已有 optionalDependencies |
| `dayjs` | 时间戳生成文件名 | 已有 dependencies |
