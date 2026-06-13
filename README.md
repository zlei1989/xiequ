# 谐趣

我的生活工具集，基于 [Next.js](https://nextjs.org) 构建的 Web 应用。

## 功能模块

### 浇花帮手

远程管理、控制浇花 IoT 设备：

- 设备注册与配置（流程编排、定时任务、电压阈值）
- 设备状态实时监控（开关、传感器、负载、在线状态）
- 设备日志查询与清空
- IoT 协议通信（设备上下线、心跳、状态推送）
- 调试工具（IoT 模拟器）
- **ESP32 固件**（[app/watering/rom-v2/](app/watering/rom-v2/)） — 自动浇花系统控制器固件（Arduino C++）
  - 4 路水泵 PWM 调速 / 开关控制，渐变启动
  - 多传感器采集：温度、水浸×2、电压×2
  - 5 路物理按钮（短按 / 长按检测，可作为流程中断源）
  - LED 状态指示灯
  - WiFi 连接服务端，异步轮询状态 + 同步推送事件
  - 多步骤浇花流程执行，支持超时和中断检测
  - 深度睡眠省电模式（服务端控制休眠时长，定时器唤醒）

### 旅行计划

地图标注、路线规划与旅行收藏：

- 地点标记与管理（名称、坐标、分类、状态）
- 旅行瞬间记录（图片上传、文字描述）
- 路线自动聚合生成（基于时间间隔和最近邻算法，从地点+瞬间动态构建）
- 路线地图弹层（带编号标注点 + 高德驾车路线连线）
- 高德地图集成（定位、搜索、驾车路线规划）
- 腾讯云 COS 图片存储

### 台岛遍历

二零一六年台湾行迹的静态存档页面，存放于 `public/taiwan-1.8.4/`。

## 技术栈

| 类别     | 技术                                        |
| -------- | ------------------------------------------- |
| 框架     | Next.js 16 (App Router)                     |
| 运行时   | React 19                                    |
| 语言     | TypeScript                                  |
| UI       | antd 6 + antd-mobile 5                      |
| 样式     | Tailwind CSS + `normalize.css` + antd 内置样式 |
| 数据库   | SQLite（node-sqlite3-wasm，WASM）           |
| 对象存储 | 腾讯云 COS                                  |
| 地图     | 高德地图 API                                |
| 测试     | Vitest                                      |
| 包管理   | npm                                         |

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 安装依赖

```bash
npm install
```

### 环境变量

复制 `.env.example` 为 `.env.local` 并按需填写，各变量说明见 `.env.example` 文件中的注释。

```bash
cp .env.example .env.local
```

### 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 其他命令

| 命令                 | 说明                              |
| -------------------- | --------------------------------- |
| `npm run dev`        | 启动开发服务器                    |
| `npm run format`     | ESLint 自动修复（提交前执行）     |
| `npm run check`      | TypeScript 类型检查 + Lint 检查   |
| `npm run lint`       | ESLint 检查                       |
| `npm run test`       | 运行测试                          |
| `npm run test:watch` | 监视模式测试                      |
| `npm run build`      | 生产环境构建                      |
| `npm start`          | 启动生产服务器                    |
| `npm run deploy`     | 部署到腾讯云                      |

## 项目结构

```
├── app/                    # Next.js App Router
│   ├── page.tsx            # 首页（模块导航）
│   ├── globals.css         # 全局样式
│   ├── watering/           # 浇花帮手模块
│   │   ├── actions.ts      # Server Actions
│   │   ├── api/            # API 路由（get-state / push-state）
│   │   ├── components/     # UI 组件
│   │   ├── debug/          # IoT 调试页
│   │   ├── devices/        # 设备详情/编辑页（动态路由）
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── logs/           # 设备日志页（动态路由）
│   │   ├── rom-v2/         # ESP32 固件（Arduino C++）
│   │   ├── services/       # 数据库操作、IoT 协议实现
│   │   └── types.ts        # 类型定义
│   └── travel/             # 旅行计划模块
│       ├── page.tsx         # 地图主页
│       ├── layout.tsx       # 模块布局（Context 注入）
│       ├── list/            # 地点列表页
│       ├── routes/          # 路线列表页
│       ├── actions.ts       # Server Actions
│       ├── api/download/    # 图片下载 API
│       ├── components/      # UI 组件（地图、弹层、列表项等）
│       ├── hooks/           # 自定义 Hooks（路线、驾车、地图主题等）
│       ├── lib/             # 路线构建、地点过滤
│       ├── services/        # 高德地图、OSS、标注引擎
│       ├── types.ts         # 类型定义
│       └── types/           # 第三方类型声明（amap.d.ts）
├── components/             # 共享组件（SSR 兼容层等）
├── lib/                    # 共享库（数据库连接、COS 客户端、工具函数）
├── __tests__/              # 测试文件
├── types/                  # 第三方 .d.ts 类型声明
├── instrumentation.ts      # 数据库初始化（启动时自动执行）
├── docs/                   # 设计文档与计划
└── public/                 # 静态资源
```

## 数据库

应用启动时通过 `instrumentation.ts` 自动初始化 SQLite 数据库表，无需手动建表。数据库文件默认位于 `data/app.db`，可通过 `DB_PATH` 环境变量自定义路径。数据库驱动为 `node-sqlite3-wasm`（WASM 模式运行）。
