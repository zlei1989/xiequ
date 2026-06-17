# 项目脚手架与首页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建项目基础架构——根布局、首页卡片导航、共享代码层（lib/ + components/），为两个子模块提供运行基础。

**Architecture:** Next.js 16 App Router + antd 6 + better-sqlite3。首页为卡片导航入口，根布局仅管全局样式和 ConfigProvider，子模块布局各自独立。共享代码放在 lib/（纯逻辑）和 components/（共享 UI）。

**Tech Stack:** Next.js 16, React 19, antd 6, better-sqlite3, TypeScript, Tailwind CSS 4

---

### Task 1: 清理默认脚手架

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 清空默认页面内容，替换为空白首页**

Replace `app/page.tsx` with:

```tsx
export default function Home() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <h1>个人工具箱</h1>
    </div>
  );
}
```

- [ ] **Step 2: 更新根布局，添加 antd ConfigProvider**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "个人工具箱",
  description: "日常工具集合",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConfigProvider locale={zhCN}>{children}</ConfigProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: 精简 globals.css，移除 Next.js 默认样式**

Replace `app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 4: 启动 dev 验证页面正常**

Run: `pnpm dev`

Expected: 浏览器打开 http://localhost:3000 显示"个人工具箱"标题，无报错。

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx app/globals.css
git commit -m "chore: 清理默认脚手架，添加 antd ConfigProvider"
```

---

### Task 2: 创建共享代码层（lib/）

**Files:**
- Create: `lib/db.ts`
- Create: `lib/oss.ts`
- Create: `lib/utils.ts`

- [ ] **Step 1: 创建 lib/db.ts — SQLite 连接封装**

```ts
import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

const DB_PATH = path.join(process.cwd(), "data", "app.db");

export function getDb(): Database.Database {
  if (!db) {
    // 确保 data 目录存在
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    // 启用 WAL 模式提升并发性能
    db.pragma("journal_mode = WAL");
  }
  return db;
}
```

- [ ] **Step 2: 创建 lib/oss.ts — OSS 客户端初始化**

```ts
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
```

- [ ] **Step 3: 创建 lib/utils.ts — 工具函数**

```ts
/**
 * 生成唯一 ID（8 位字母数字）
 */
export function newId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 格式化日期时间为 ISO 字符串
 */
export function formatDateTime(date: Date): string {
  return date.toISOString();
}
```

- [ ] **Step 4: 创建 .env.example 文件**

```env
# OSS 对象存储配置
OSS_REGION=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=
OSS_ENDPOINT=
```

- [ ] **Step 5: 将 data/ 加入 .gitignore**

在 `.gitignore` 末尾追加：

```
# SQLite 数据库
data/
```

- [ ] **Step 6: 验证 TypeScript 无报错**

Run: `pnpm tsc --noEmit`

Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add lib/ .env.example .gitignore
git commit -m "feat: 添加共享代码层 lib/（db、oss、utils）"
```

---

### Task 3: 创建共享 UI 组件（components/）

**Files:**
- Create: `components/ui/app-card.tsx`

- [ ] **Step 1: 创建首页卡片组件**

```tsx
import { Card } from "antd";
import Link from "next/link";

export interface AppCardProps {
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
}

export function AppCard({ title, description, href, icon }: AppCardProps) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Card hoverable style={{ height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {icon && <div style={{ fontSize: 32 }}>{icon}</div>}
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          <p style={{ margin: 0, color: "#666" }}>{description}</p>
        </div>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 无报错**

Run: `pnpm tsc --noEmit`

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add components/
git commit -m "feat: 添加共享 UI 组件 app-card"
```

---

### Task 4: 实现首页卡片导航

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 实现首页卡片导航**

Replace `app/page.tsx` with:

```tsx
import { Row, Col } from "antd";
import { AppCard } from "@/components/ui/app-card";

const apps = [
  {
    title: "浇花帮手",
    description: "IoT 设备管理，远程控制浇花",
    href: "/watering",
    icon: "🌱",
  },
  {
    title: "旅行计划",
    description: "地图标注，收藏想去的地方",
    href: "/travel",
    icon: "🗺️",
  },
];

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "0 24px",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 32 }}>个人工具箱</h1>
      <Row gutter={[24, 24]} style={{ maxWidth: 800, width: "100%" }}>
        {apps.map((app) => (
          <Col key={app.href} xs={24} sm={12}>
            <AppCard
              title={app.title}
              description={app.description}
              href={app.href}
              icon={app.icon}
            />
          </Col>
        ))}
      </Row>
    </div>
  );
}
```

- [ ] **Step 2: 启动 dev 验证首页**

Run: `pnpm dev`

Expected: 首页显示"个人工具箱"标题和两张卡片（浇花帮手、旅行计划），点击可跳转（目前 404 正常）。

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: 实现首页卡片导航"
```

---

### Task 5: 创建浇花模块骨架路由

**Files:**
- Create: `app/watering/layout.tsx`
- Create: `app/watering/page.tsx`
- Create: `app/watering/devices/[chipId]/page.tsx`
- Create: `app/watering/logs/[chipId]/page.tsx`
- Create: `app/watering/types.ts`

- [ ] **Step 1: 创建浇花模块类型定义**

Create `app/watering/types.ts`:

```ts
// 流程步骤
export type Step = {
  name: string;
  component: string;
  value: { begin: unknown; end: unknown };
  delay?: number;
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};

// 中断
export type Interrupt = {
  name: string;
  component: string;
  state: number | boolean;
  intercept?: number;
  delay?: number;
  duration?: number;
  disabled?: boolean;
};

// 流程
export type Process = {
  name: string;
  steps: Step[];
};

// 计划任务
export type Schedule = {
  type: "minute" | "day" | "week" | "month";
  day?: number;
  week?: number;
  month?: number;
  value: number;
  interval: number;
  process: number;
  disabled?: boolean;
};

// 设备配置
export type DeviceConfig = {
  chipId: string;
  name: string;
  macAddress: string;
  processes: Process[];
  idleSleep: boolean;
  idleTimeout: number;
  bootExec: number;
  execDelay: number;
  schedules: Schedule[];
  createdTime: string;
  lastWriteTime: string;
};

// 设备状态
export type DeviceState = {
  chipId: string;
  stateId: string;
  switch: "on" | "off";
  buttons?: Record<string, number>;
  sensors?: Record<string, number>;
  loads?: Record<string, number>;
  index?: number;
  process?: Process;
  message?: string;
  lastWriteTime: string;
};

// 设备列表项（配置 + 状态 + 在线信息）
export type DeviceItem = DeviceConfig & {
  state?: DeviceState;
  lastTickTime?: number;
  isOnline?: boolean;
};
```

- [ ] **Step 2: 创建浇花模块布局**

Create `app/watering/layout.tsx`:

```tsx
"use client";

import { Layout, Menu, Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: "/watering", label: "设备列表" },
  { key: "/watering/logs", label: "运行日志", disabled: true },
];

export default function WateringLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 根据路径确定当前选中菜单
  const selectedKey = menuItems.find((item) => pathname.startsWith(item.key))?.key || "/watering";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f0f0f0" }}>
        <Button type="text" icon={<HomeOutlined />} onClick={() => router.push("/")} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>浇花帮手</span>
      </Header>
      <Layout>
        <Sider width={200} theme="light" style={{ borderRight: "1px solid #f0f0f0" }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => router.push(key)}
            style={{ height: "100%", borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: "#fff" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 3: 创建浇花首页（设备列表占位）**

Create `app/watering/page.tsx`:

```tsx
export default function WateringPage() {
  return <div>设备列表（待实现）</div>;
}
```

- [ ] **Step 4: 创建设备详情页占位**

Create `app/watering/devices/[chipId]/page.tsx`:

```tsx
export default function DeviceDetailPage({ params }: { params: Promise<{ chipId: string }> }) {
  return <div>设备详情（待实现）</div>;
}
```

- [ ] **Step 5: 创建设备日志页占位**

Create `app/watering/logs/[chipId]/page.tsx`:

```tsx
export default function DeviceLogsPage({ params }: { params: Promise<{ chipId: string }> }) {
  return <div>设备日志（待实现）</div>;
}
```

- [ ] **Step 6: 启动 dev 验证浇花模块路由**

Run: `pnpm dev`

Expected:
- 首页点击"浇花帮手"跳转到 /watering，显示侧边栏布局 + "设备列表（待实现）"
- 顶部有返回首页按钮

- [ ] **Step 7: Commit**

```bash
git add app/watering/
git commit -m "feat: 创建浇花模块骨架路由和布局"
```

---

### Task 6: 创建旅行模块骨架路由

**Files:**
- Create: `app/travel/layout.tsx`
- Create: `app/travel/page.tsx`
- Create: `app/travel/list/page.tsx`
- Create: `app/travel/locations/[id]/page.tsx`
- Create: `app/travel/types.ts`

- [ ] **Step 1: 创建旅行模块类型定义**

Create `app/travel/types.ts`:

```ts
// 位置
export type Location = {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  checked: boolean;
  comments: string;
  posterUrl?: string;
  deleted: boolean;
  createdTime: string;
};

// 精彩瞬间
export type Moment = {
  id: string;
  locationId: string;
  date: string;
  text: string;
  createdTime: string;
};

// 概览统计
export type Summary = {
  uncheckCount: number;
  uncheckPercentage: number;
  checkedCount: number;
  checkedPercentage: number;
  count: number;
};
```

- [ ] **Step 2: 创建旅行模块布局**

Create `app/travel/layout.tsx`:

```tsx
"use client";

import { Layout, Menu, Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: "/travel", label: "地图视图" },
  { key: "/travel/list", label: "位置列表" },
];

export default function TravelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const selectedKey = menuItems.find((item) => pathname.startsWith(item.key))?.key || "/travel";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f0f0f0" }}>
        <Button type="text" icon={<HomeOutlined />} onClick={() => router.push("/")} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>旅行计划</span>
      </Header>
      <Layout>
        <Sider width={200} theme="light" style={{ borderRight: "1px solid #f0f0f0" }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => router.push(key)}
            style={{ height: "100%", borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: "#fff" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 3: 创建旅行首页占位**

Create `app/travel/page.tsx`:

```tsx
export default function TravelPage() {
  return <div>地图视图（待实现）</div>;
}
```

- [ ] **Step 4: 创建位置列表页占位**

Create `app/travel/list/page.tsx`:

```tsx
export default function LocationListPage() {
  return <div>位置列表（待实现）</div>;
}
```

- [ ] **Step 5: 创建位置详情页占位**

Create `app/travel/locations/[id]/page.tsx`:

```tsx
export default function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <div>位置详情（待实现）</div>;
}
```

- [ ] **Step 6: 启动 dev 验证旅行模块路由**

Run: `pnpm dev`

Expected:
- 首页点击"旅行计划"跳转到 /travel，显示侧边栏布局 + "地图视图（待实现）"
- 侧边栏可切换到位置列表
- 顶部有返回首页按钮

- [ ] **Step 7: Commit**

```bash
git add app/travel/
git commit -m "feat: 创建旅行模块骨架路由和布局"
```

---

### Task 7: 创建浇花模块 services 和 hooks 占位

**Files:**
- Create: `app/watering/services/db.ts`
- Create: `app/watering/services/iot-protocol.ts`
- Create: `app/watering/hooks/use-devices.ts`
- Create: `app/watering/hooks/use-device-config.ts`
- Create: `app/watering/hooks/use-device-logs.ts`

- [ ] **Step 1: 创建浇花模块数据库服务**

Create `app/watering/services/db.ts`:

```ts
import { getDb } from "@/lib/db";
import type { DeviceConfig, DeviceState, DeviceItem } from "../types";

/**
 * 初始化浇花模块数据库表
 */
export function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_devices (
      chipId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      macAddress TEXT NOT NULL,
      processes TEXT NOT NULL DEFAULT '[]',
      idleSleep INTEGER NOT NULL DEFAULT 0,
      idleTimeout INTEGER NOT NULL DEFAULT 30000,
      bootExec INTEGER NOT NULL DEFAULT -1,
      execDelay INTEGER NOT NULL DEFAULT 0,
      schedules TEXT NOT NULL DEFAULT '[]',
      createdTime TEXT NOT NULL,
      lastWriteTime TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_device_state (
      chipId TEXT PRIMARY KEY,
      stateId TEXT NOT NULL,
      switch TEXT NOT NULL DEFAULT 'off',
      buttons TEXT,
      sensors TEXT,
      loads TEXT,
      currentIndex INTEGER,
      currentProcess TEXT,
      message TEXT,
      lastTickTime INTEGER DEFAULT 0,
      lastWriteTime TEXT NOT NULL,
      FOREIGN KEY (chipId) REFERENCES watering_devices(chipId)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chipId TEXT NOT NULL,
      event TEXT NOT NULL,
      state TEXT,
      createdTime TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watering_logs_chipId
    ON watering_logs(chipId, createdTime DESC)
  `);
}

/**
 * 获取所有设备（含状态和在线信息）
 */
export function getAllDevices(): DeviceItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.*, s.stateId, s.switch, s.buttons, s.sensors, s.loads,
           s.currentIndex, s.currentProcess, s.message,
           s.lastTickTime as stateLastTickTime, s.lastWriteTime as stateLastWriteTime
    FROM watering_devices d
    LEFT JOIN watering_device_state s ON d.chipId = s.chipId
    ORDER BY d.name
  `).all() as any[];

  const now = Date.now();
  return rows.map((row) => {
    const config: DeviceConfig = {
      chipId: row.chipId,
      name: row.name,
      macAddress: row.macAddress,
      processes: JSON.parse(row.processes),
      idleSleep: !!row.idleSleep,
      idleTimeout: row.idleTimeout,
      bootExec: row.bootExec,
      execDelay: row.execDelay,
      schedules: JSON.parse(row.schedules),
      createdTime: row.createdTime,
      lastWriteTime: row.lastWriteTime,
    };

    const item: DeviceItem = { ...config };

    if (row.stateId) {
      item.state = {
        chipId: row.chipId,
        stateId: row.stateId,
        switch: row.switch,
        buttons: row.buttons ? JSON.parse(row.buttons) : undefined,
        sensors: row.sensors ? JSON.parse(row.sensors) : undefined,
        loads: row.loads ? JSON.parse(row.loads) : undefined,
        index: row.currentIndex ?? undefined,
        process: row.currentProcess ? JSON.parse(row.currentProcess) : undefined,
        message: row.message ?? undefined,
        lastWriteTime: row.stateLastWriteTime,
      };
      item.lastTickTime = row.stateLastTickTime;
      // 60 秒内心跳视为在线
      item.isOnline = row.stateLastTickTime && (now - row.stateLastTickTime) <= 60 * 1000;
    }

    return item;
  });
}

/**
 * 获取单个设备配置
 */
export function getDeviceConfig(chipId: string): DeviceConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_devices WHERE chipId = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chipId,
    name: row.name,
    macAddress: row.macAddress,
    processes: JSON.parse(row.processes),
    idleSleep: !!row.idleSleep,
    idleTimeout: row.idleTimeout,
    bootExec: row.bootExec,
    execDelay: row.execDelay,
    schedules: JSON.parse(row.schedules),
    createdTime: row.createdTime,
    lastWriteTime: row.lastWriteTime,
  };
}

/**
 * 保存设备配置
 */
export function saveDeviceConfig(config: DeviceConfig) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_devices (chipId, name, macAddress, processes, idleSleep, idleTimeout, bootExec, execDelay, schedules, createdTime, lastWriteTime)
    VALUES (@chipId, @name, @macAddress, @processes, @idleSleep, @idleTimeout, @bootExec, @execDelay, @schedules, @createdTime, @lastWriteTime)
    ON CONFLICT(chipId) DO UPDATE SET
      name=@name, macAddress=@macAddress, processes=@processes, idleSleep=@idleSleep,
      idleTimeout=@idleTimeout, bootExec=@bootExec, execDelay=@execDelay,
      schedules=@schedules, lastWriteTime=@lastWriteTime
  `).run({
    ...config,
    processes: JSON.stringify(config.processes),
    idleSleep: config.idleSleep ? 1 : 0,
    schedules: JSON.stringify(config.schedules),
  });
}

/**
 * 删除设备
 */
export function deleteDevice(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_device_state WHERE chipId = ?").run(chipId);
  db.prepare("DELETE FROM watering_devices WHERE chipId = ?").run(chipId);
}

/**
 * 获取设备日志
 */
export function getDeviceLogs(chipId: string, limit = 100) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM watering_logs WHERE chipId = ? ORDER BY createdTime DESC LIMIT ?"
  ).all(chipId, limit);
}

/**
 * 写入设备日志
 */
export function writeDeviceLog(chipId: string, event: string, state?: Record<string, unknown>) {
  const db = getDb();
  db.prepare("INSERT INTO watering_logs (chipId, event, state, createdTime) VALUES (?, ?, ?, ?)").run(
    chipId,
    event,
    state ? JSON.stringify(state) : null,
    new Date().toISOString()
  );
}

/**
 * 清空设备日志
 */
export function clearDeviceLogs(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_logs WHERE chipId = ?").run(chipId);
}
```

- [ ] **Step 2: 创建 IoT 通信协议占位**

Create `app/watering/services/iot-protocol.ts`:

```ts
/**
 * IoT 设备通信协议
 *
 * 负责：
 * - 设备状态推送（设备 → 服务器）
 * - 设备状态拉取（设备 ← 服务器，长轮询/SSE）
 * - 设备指令下发（开关、流程指定）
 *
 * 具体协议细节待后续实现时补充
 */

export type DeviceEvent = "bootstrap" | "finish" | "heartbeat";

export type PushStatePayload = {
  chipId: string;
  macAddress: string;
  event: DeviceEvent;
  switch?: "on" | "off";
  cause?: string;
  [key: string]: unknown;
};
```

- [ ] **Step 3: 创建 hooks 占位文件**

Create `app/watering/hooks/use-devices.ts`:

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { DeviceItem } from "../types";

/**
 * 设备列表 hook（含自动刷新）
 * 后续实现时连接 Server Actions
 */
export function useDevices(intervalMs = 15000) {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取设备列表
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { devices, loading, refresh };
}
```

Create `app/watering/hooks/use-device-config.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import type { DeviceConfig } from "../types";

/**
 * 单个设备配置 CRUD hook
 * 后续实现时连接 Server Actions
 */
export function useDeviceConfig(chipId: string) {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取设备配置
    setLoading(false);
  }, [chipId]);

  const save = useCallback(async (data: DeviceConfig) => {
    setLoading(true);
    // TODO: 调用 Server Action 保存设备配置
    setLoading(false);
  }, []);

  const remove = useCallback(async () => {
    // TODO: 调用 Server Action 删除设备
  }, [chipId]);

  return { config, loading, load, save, remove };
}
```

Create `app/watering/hooks/use-device-logs.ts`:

```ts
"use client";

import { useState, useCallback } from "react";

/**
 * 设备日志 hook
 * 后续实现时连接 Server Actions
 */
export function useDeviceLogs(chipId: string) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取日志
    setLoading(false);
  }, [chipId]);

  const clear = useCallback(async () => {
    // TODO: 调用 Server Action 清空日志
  }, [chipId]);

  return { logs, loading, load, clear };
}
```

- [ ] **Step 4: 验证 TypeScript 无报错**

Run: `pnpm tsc --noEmit`

Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add app/watering/services/ app/watering/hooks/
git commit -m "feat: 添加浇花模块 services 和 hooks 占位"
```

---

### Task 8: 创建旅行模块 services 和 hooks 占位

**Files:**
- Create: `app/travel/services/amap.ts`
- Create: `app/travel/services/oss.ts`
- Create: `app/travel/hooks/use-locations.ts`
- Create: `app/travel/hooks/use-moments.ts`

- [ ] **Step 1: 创建高德地图 SDK 封装占位**

Create `app/travel/services/amap.ts`:

```ts
/**
 * 高德地图 SDK 封装
 *
 * 负责：
 * - 地图加载
 * - 位置搜索（PlaceSearch）
 * - GPS 定位（Geolocation）
 * - 地理编码（Geocoder）
 *
 * 需要 AMap API Key 环境变量：NEXT_PUBLIC_AMAP_KEY
 */

export function getAmapKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_KEY || "";
}
```

- [ ] **Step 2: 创建 OSS 服务封装占位**

Create `app/travel/services/oss.ts`:

```ts
import { getOssConfig } from "@/lib/oss";
import type { Location, Moment } from "../types";

/**
 * 旅行模块 OSS 数据存储
 *
 * 负责：
 * - 位置数据读写（JSON 文件存储在 OSS）
 * - 图片上传（签名 URL）
 * - 图片下载（带裁剪参数的签名 URL）
 *
 * 具体实现待后续补充，与旧项目保持相同的 OSS 存储结构
 */
```

- [ ] **Step 3: 创建 hooks 占位文件**

Create `app/travel/hooks/use-locations.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import type { Location, Summary } from "../types";

/**
 * 位置列表 hook（含筛选、排序）
 * 后续实现时连接 Server Actions / OSS 数据
 */
export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "checked" | "uncheck">("all");

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取位置列表
    setLoading(false);
  }, []);

  const add = useCallback(async (data: Partial<Location>) => {
    // TODO: 调用 Server Action 新增位置
  }, []);

  const update = useCallback(async (id: string, data: Partial<Location>) => {
    // TODO: 调用 Server Action 更新位置
  }, []);

  const remove = useCallback(async (id: string) => {
    // TODO: 调用 Server Action 删除位置
  }, []);

  const filteredLocations = locations.filter((loc) => {
    if (loc.deleted) return false;
    if (filter === "checked") return loc.checked;
    if (filter === "uncheck") return !loc.checked;
    return true;
  });

  const summary: Summary = {
    uncheckCount: locations.filter((l) => !l.deleted && !l.checked).length,
    uncheckPercentage: 0,
    checkedCount: locations.filter((l) => !l.deleted && l.checked).length,
    checkedPercentage: 0,
    count: locations.filter((l) => !l.deleted).length,
  };
  if (summary.count > 0) {
    summary.uncheckPercentage = Math.floor((summary.uncheckCount / summary.count) * 100);
    summary.checkedPercentage = Math.floor((summary.checkedCount / summary.count) * 100);
  }

  return { locations: filteredLocations, loading, filter, setFilter, load, add, update, remove, summary };
}
```

Create `app/travel/hooks/use-moments.ts`:

```ts
"use client";

import { useState, useCallback } from "react";
import type { Moment } from "../types";

/**
 * 精彩瞬间 CRUD hook
 * 后续实现时连接 Server Actions / OSS 数据
 */
export function useMoments(locationId: string) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // TODO: 调用 Server Action 获取瞬间列表
    setLoading(false);
  }, [locationId]);

  const add = useCallback(async (data: { date: string; text: string }) => {
    // TODO: 调用 Server Action 新增瞬间
  }, [locationId]);

  const update = useCallback(async (id: string, data: { date?: string; text?: string }) => {
    // TODO: 调用 Server Action 更新瞬间
  }, [locationId]);

  const remove = useCallback(async (id: string) => {
    // TODO: 调用 Server Action 删除瞬间
  }, [locationId]);

  return { moments, loading, load, add, update, remove };
}
```

- [ ] **Step 4: 验证 TypeScript 无报错**

Run: `pnpm tsc --noEmit`

Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add app/travel/services/ app/travel/hooks/
git commit -m "feat: 添加旅行模块 services 和 hooks 占位"
```

---

### Task 9: 创建数据库初始化入口

**Files:**
- Create: `instrumentation.ts`

- [ ] **Step 1: 创建 instrumentation.ts 用于启动时初始化**

Create `instrumentation.ts`:

```ts
export async function register() {
  // 仅在 Node.js 环境执行（非 Edge）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initDb } = await import("./app/watering/services/db");
    initDb();
  }
}
```

- [ ] **Step 2: 启动 dev 验证数据库初始化**

Run: `pnpm dev`

Expected: 启动无报错，`data/app.db` 文件自动创建。

- [ ] **Step 3: Commit**

```bash
git add instrumentation.ts
git commit -m "feat: 添加数据库初始化入口 instrumentation.ts"
```
