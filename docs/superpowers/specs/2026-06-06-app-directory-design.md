# App 目录结构设计

## 概述

个人工具箱项目，基于 Next.js 16 App Router + antd 6 + better-sqlite3。采用**模块同位（Colocation）**模式，每个功能模块是一个自包含的路由目录，路由和业务代码在一起。首页为卡片导航，点击进入子应用。

## 目录结构

```
app/
├── page.tsx                          # 首页 — 子应用卡片导航
├── layout.tsx                        # 根布局（字体、全局样式、antd ConfigProvider）
├── globals.css
│
├── watering/                         # 浇花模块
│   ├── layout.tsx                    #   模块布局（侧边菜单 + 返回首页）
│   ├── page.tsx                      #   /watering — 设备列表
│   ├── devices/
│   │   └── [chipId]/
│   │       └── page.tsx              #   /watering/devices/:chipId — 设备详情/编辑
│   ├── logs/
│   │   └── [chipId]/
│   │       └── page.tsx              #   /watering/logs/:chipId — 设备日志
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── types.ts
│
├── travel/                           # 旅行模块
│   ├── layout.tsx                    #   模块布局
│   ├── page.tsx                      #   /travel — 地图视图（默认页）
│   ├── list/
│   │   └── page.tsx                  #   /travel/list — 位置列表视图
│   ├── locations/
│   │   └── [id]/
│   │       └── page.tsx              #   /travel/locations/:id — 位置详情
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── types.ts
│
lib/                                  # 跨模块共享代码
├── db.ts                             #   better-sqlite3 连接封装
├── oss.ts                            #   OSS 客户端初始化（凭证、bucket 配置）
└── utils.ts                          #   工具函数

components/                           # 跨模块共享 UI 组件
└── ui/
    └── app-card.tsx                  #   首页卡片组件
```

## 导航与布局

### 首页（`app/page.tsx`）

全屏卡片导航页，antd `Card` + `Row/Col` 网格排列，每个模块一张卡片，点击进入对应子应用。

### 根布局（`app/layout.tsx`）

只管全局样式、字体、antd `ConfigProvider`。不渲染导航——首页不需要侧边栏，子应用才有。

### 模块布局（`app/watering/layout.tsx` 等）

使用 antd `Layout` + `Sider` + `Menu`，提供：

- 左侧菜单（模块内页面导航）
- 顶部栏（返回首页 + 模块名称）
- Content 区域渲染子页面

每个模块的 `layout.tsx` 独立定义自己的侧边菜单和布局结构，互不影响。

## 依赖规则

```
app/watering/  ←→  app/travel/      禁止互相引用
app/watering/   →  lib/             可引用
app/watering/   →  components/      可引用
app/travel/     →  lib/             可引用
app/travel/     →  components/      可引用
lib/            →  app/watering/    禁止反向依赖
components/     →  app/watering/    禁止反向依赖
```

- `lib/` 放纯逻辑（不关心 UI），如 db 封装、工具函数
- `components/` 放跨模块复用的 UI 组件，如首页卡片
- 只有一个模块用的东西，放在模块内部；两个以上模块都用，才提升到 `lib/` 或 `components/`
- 避免过早抽象

## 数据层

每个模块管理自己的表，`lib/db.ts` 只负责初始化连接和提供通用方法：

- `lib/db.ts` — 创建连接、暴露 `getDb()` 方法
- `app/watering/services/db.ts` — 浇花模块建表（devices, logs）、CRUD
- `app/travel/services/oss.ts` — 旅行模块数据存储（位置数据读写、图片上传/下载），全部走 OSS

原则：

- 模块只操作自己的表，不读写其他模块的表
- `lib/db.ts` 不知道有哪些表
- 建表语句放在各模块 `services/db.ts` 里，各模块导出 `initDb()` 函数，在 Next.js `instrumentation.ts`（或根 layout 服务端初始化）中统一调用

数据流：`page.tsx → hooks/ → services/ → lib/db.ts → better-sqlite3`

路由页面不直接调 services，通过 hooks 暴露数据和操作。

## 浇花模块 — 功能与路由

### 功能清单

| 功能 | 说明 |
|------|------|
| 设备列表 | 展示所有设备，含在线状态、当前运行流程，自动刷新 |
| 设备开关 | 远程开关设备、指定执行哪个流程 |
| 设备配置编辑 | 编辑设备名称、流程（步骤+中断）、定时任务、空闲休眠 |
| 设备删除 | 删除设备配置 |
| 运行日志 | 按时间查看设备日志（bootstrap/execute/terminate 等），支持清空 |
| 设备状态推送 | IoT 设备上报状态（bootstrap/finish/GPIO） |
| 设备状态拉取 | IoT 设备长轮询获取指令（开关、流程下发） |

### 路由结构

```
app/watering/
├── layout.tsx                    # 模块布局（侧边菜单 + 返回首页）
├── page.tsx                      # /watering — 设备列表
├── devices/[chipId]/
│   └── page.tsx                  # /watering/devices/:chipId — 设备详情/编辑
└── logs/[chipId]/
    └── page.tsx                  # /watering/logs/:chipId — 设备日志
```

### 组件

```
app/watering/components/
├── device-card.tsx               # 设备卡片（名称、在线状态、开关）
├── device-editor.tsx             # 设备配置编辑器
├── process-editor.tsx            # 流程编辑器（步骤 + 中断）
├── process-step-editor.tsx       # 单个步骤编辑
├── process-interrupt-editor.tsx  # 中断条件编辑
├── schedule-editor.tsx           # 定时任务编辑
└── log-viewer.tsx                # 日志查看器
```

### Hooks

```
app/watering/hooks/
├── use-devices.ts                # 设备列表 + 自动刷新
├── use-device-config.ts          # 单个设备配置 CRUD
└── use-device-logs.ts            # 设备日志查询/清空
```

### Services

```
app/watering/services/
├── db.ts                         # 建表（devices, logs）、CRUD
└── iot-protocol.ts               # IoT 设备通信协议（状态推送/拉取）
```

### 数据模型

```ts
// 设备配置
type DeviceConfig = {
  chipId: string;               // 芯片标识
  name: string;                 // 设备名称
  macAddress: string;           // 网卡标识
  processes: Process[];         // 流程设定
  idleSleep: boolean;           // 空闲睡眠
  idleTimeout: number;          // 空闲超时
  bootExec: number;             // 开机执行（-1 不执行）
  execDelay: number;            // 延迟执行
  schedules: Schedule[];        // 定时任务
  createdTime: string;
  lastWriteTime: string;
};

// 设备状态
type DeviceState = {
  chipId: string;
  stateId: string;              // 变更标识
  switch: 'on' | 'off';
  buttons?: Record<string, number>;
  sensors?: Record<string, number>;
  loads?: Record<string, number>;
  index?: number;               // 当前任务标识
  process?: Process;            // 当前执行流程
  message?: string;
  lastWriteTime: string;
};

// 流程
type Process = {
  name: string;
  steps: Step[];
};

// 步骤
type Step = {
  name: string;
  component: string;            // 触发负载组件
  value: { begin: any; end: any };
  delay?: number;
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};

// 中断
type Interrupt = {
  name: string;
  component: string;            // 监视传感器组件
  state: number | boolean;
  intercept?: number;           // 过滤抖动间隔
  delay?: number;
  duration?: number;
  disabled?: boolean;
};

// 定时任务
type Schedule = {
  type: 'minute' | 'day' | 'week' | 'month';
  day?: number;
  week?: number;
  month?: number;
  value: number;
  interval: number;             // 间隔周期
  process: number;              // 执行流程索引
  disabled?: boolean;
};
```

## 旅行模块 — 功能与路由

### 功能清单

| 功能 | 说明 |
|------|------|
| 地图视图 | 高德地图标注所有位置，点击查看详情 |
| 位置列表 | 按距离排序的位置卡片列表 |
| 位置管理 | 新增/编辑/删除位置（名称、地址、经纬度、备注） |
| 位置筛选 | 全部 / 已去 / 待去 |
| 精彩瞬间 | 为位置添加瞬间记录（日期 + 文字） |
| 图片上传 | 位置封面图上传/下载 |
| 我的位置 | GPS 定位当前用户位置 |
| 搜索地点 | 高德 PlaceSearch 搜索添加位置 |

### 路由结构

```
app/travel/
├── layout.tsx                    # 模块布局
├── page.tsx                      # /travel — 地图视图（默认页）
├── list/
│   └── page.tsx                  # /travel/list — 位置列表视图
└── locations/[id]/
    └── page.tsx                  # /travel/locations/:id — 位置详情（瞬间列表）
```

### 组件

```
app/travel/components/
├── trip-map.tsx                  # 高德地图 + 标注点
├── location-card.tsx             # 位置卡片
├── location-drawer.tsx           # 位置详情抽屉
├── location-form.tsx             # 位置新增/编辑表单
├── location-list.tsx             # 位置列表
├── moment-form.tsx               # 瞬间新增/编辑表单
├── search-dialog.tsx             # 地点搜索弹窗
└── upload-image.tsx              # 图片上传组件
```

### Hooks

```
app/travel/hooks/
├── use-locations.ts              # 位置列表 + 筛选 + 排序
└── use-moments.ts                # 瞬间 CRUD
```

### Services

```
app/travel/services/
├── amap.ts                       # 高德地图 SDK 封装（搜索、定位、地理编码）
└── oss.ts                        # OSS 对象存储封装（位置数据读写、签名 URL 上传/下载、图片裁剪）
```

### 数据模型

```ts
// 位置
type Location = {
  id: string;
  name: string;
  address: string;
  longitude: number;             // 经度 x
  latitude: number;              // 纬度 y
  checked: boolean;              // 是否已去
  comments: string;              // 备注
  posterUrl?: string;            // 封面图
  deleted: boolean;
  createdTime: string;
};

// 精彩瞬间
type Moment = {
  id: string;
  locationId: string;
  date: string;                  // YYYY-MM-DD
  text: string;
  createdTime: string;
};

// 概览统计
type Summary = {
  uncheckCount: number;
  uncheckPercentage: number;
  checkedCount: number;
  checkedPercentage: number;
  count: number;
};
```

## 与旧项目的关键差异

| 方面 | 旧项目 | 新项目 |
|------|--------|--------|
| 存储 | OSS 对象存储（文件） | 混合：better-sqlite3（结构化数据）+ OSS 对象存储（图片/文件） |
| 服务端 | 独立 Node 服务 + 自定义 Controller | Next.js API Routes / Server Actions |
| 客户端 | Vue 3 + Element Plus | React 19 + antd 6 |
| 实时通信 | 长轮询 + 全局回调 Map | Server Actions + 轮询 / SSE |
| 图片存储 | OSS 签名 URL | OSS 签名 URL（与旧项目一致） |

## 扩展新模块

1. 在 `app/` 下创建新模块目录（照现有模块结构）
2. 在首页 `app/page.tsx` 加一张卡片
3. 如需 SQLite，在启动初始化中调用新模块的 `initDb()`
4. 不需要改其他模块的任何代码
