# 谐趣

个人生活工具集，基于 [Next.js](https://nextjs.org) 构建的 Web 应用。

## 功能模块

### 浇花帮手

IoT 设备管理平台，远程控制浇花：

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

地图标注与旅行收藏：

- 地点标记与管理（名称、坐标、分类、状态）
- 旅行瞬间记录（图片上传、文字描述）
- 高德地图集成（定位、搜索）
- 腾讯云 COS 图片存储

### 台岛遍历

2016 年台湾行迹的静态存档页面，存放于 `public/taiwan-1.8.4/`。

## 技术栈

| 类别     | 技术                                        |
| -------- | ------------------------------------------- |
| 框架     | Next.js 16 (App Router)                     |
| 运行时   | React 19                                    |
| 语言     | TypeScript                                  |
| UI       | antd 6 + antd-mobile 5                      |
| 样式     | Tailwind CSS 4                              |
| 数据库   | SQLite（sql.js / better-sqlite3）           |
| 对象存储 | 腾讯云 COS                                  |
| 地图     | 高德地图 API                                |
| 测试     | Vitest                                      |
| 包管理   | pnpm                                        |

## 快速开始

### 环境要求

- Node.js 20+
- pnpm

### 安装依赖

```bash
pnpm install
```

### 环境变量

复制 `.env.example` 为 `.env.local` 并按需填写：

```bash
cp .env.example .env.local
```

| 变量                        | 说明                             | 必填 |
| --------------------------- | -------------------------------- | ---- |
| `DB_PATH`                   | SQLite 数据库路径，默认 `./data/app.db` | 否   |
| `OSS_ENDPOINT`              | 腾讯云 COS 地域端点              | 否   |
| `OSS_SECRET_ID`             | 腾讯云 COS SecretId              | 否   |
| `OSS_SECRET_KEY`            | 腾讯云 COS SecretKey             | 否   |
| `OSS_BUCKET`                | 腾讯云 COS 存储桶名称            | 否   |
| `OSS_TRAVEL_LOCATIONS_KEY`  | 旅行地点数据 OSS 路径            | 否   |
| `OSS_TRAVEL_POSTERS_PREFIX` | 旅行图片 OSS 前缀                | 否   |
| `NEXT_PUBLIC_AMAP_KEY`      | 高德地图 JS API Key              | 否   |

### 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 其他命令

| 命令              | 说明           |
| ----------------- | -------------- |
| `pnpm build`      | 生产环境构建   |
| `pnpm start`      | 启动生产服务器 |
| `pnpm lint`       | 代码检查       |
| `pnpm test`       | 运行测试       |
| `pnpm test:watch` | 监视模式测试   |

## 项目结构

```
├── app/                    # Next.js App Router
│   ├── layout.tsx          # 根布局（antd 配置、主题）
│   ├── page.tsx            # 首页（模块导航）
│   ├── globals.css         # 全局样式
│   ├── watering/           # 浇花帮手模块
│   │   ├── page.tsx        # 设备列表页
│   │   ├── layout.tsx      # 浇花模块布局
│   │   ├── types.ts        # 类型定义
│   │   ├── actions.ts      # Server Actions
│   │   ├── devices/[chipId]/ # 设备详情/编辑页
│   │   ├── logs/[chipId]/  # 设备日志页
│   │   ├── debug/          # IoT 调试页
│   │   ├── api/            # API 路由（状态推送/拉取）
│   │   ├── components/     # UI 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── services/       # 数据库、IoT 协议
│   │   └── rom-v2/         # ESP32 固件（Arduino C++）
│   └── travel/             # 旅行计划模块
│       ├── page.tsx        # 旅行首页
│       ├── list/page.tsx   # 地点列表页
│       ├── layout.tsx      # 旅行模块布局
│       ├── types.ts        # 类型定义
│       ├── actions.ts      # Server Actions
│       ├── api/            # API 路由（图片下载）
│       ├── components/     # UI 组件
│       ├── hooks/          # 自定义 Hooks
│       ├── lib/            # 工具函数
│       └── services/       # 高德地图、OSS
├── components/             # 共享组件
│   ├── antd-mobile-compat.tsx # antd-mobile 兼容层
│   └── ui/                 # 通用 UI 组件
├── lib/                    # 共享库
│   ├── db.ts               # 数据库连接
│   ├── oss.ts              # COS 客户端
│   └── sqljs-wrapper.ts    # sql.js 封装
├── data/                   # 本地数据（SQLite 数据库文件）
├── types/                  # 第三方类型声明
├── docs/                   # 设计文档与计划
└── public/                 # 静态资源
```

## 数据库

应用启动时自动初始化 SQLite 数据库表，无需手动建表。数据库文件默认位于 `data/app.db`，可通过 `DB_PATH` 环境变量自定义路径。

### 浇花模块表

- `watering_devices` — 设备配置（流程、定时、电压等）
- `watering_device_state` — 设备运行时状态
- `watering_logs` — 设备事件日志
