# 首页 antd-mobile 卡片重构设计

## 目标

将首页 (`app/page.tsx`) 从 antd 组件迁移到 antd-mobile，删除 AppCard 抽象层，使用组件库默认样式。

## 背景

当前首页使用 `antd` 的 `Row`/`Col` 栅格 + 自定义 `AppCard`（包装 `antd` `Card`）。项目已安装 `antd-mobile`，travel 模块已完成 antd-mobile 重构，首页也应统一迁移。

## 组件树

```
page.tsx ("use client")
└── Space (direction="vertical", block)
    ├── AutoCenter
    │   └── h1 "个人工具箱"
    ├── Card (icon=🌱, title="浇花助手", onClick → /watering)
    │   └── "IoT 设备管理，远程控制浇花"
    ├── Card (icon=🗺️, title="旅行计划", onClick → /travel)
    │   └── "地图标注，收藏想去的地方"
    └── Card (icon=🚲, title="台岛遍历", onClick → window.open)
        └── "将二〇一六年的行迹，悉数检点，妥为收存"
```

## 组件映射

| UI 区域 | 原实现 | 新实现 |
|---------|--------|--------|
| 页面布局 | antd `Row` + `Col` | antd-mobile `Space` |
| 标题居中 | `display:flex; align-items:center; justify-content:center` | antd-mobile `AutoCenter` |
| 卡片 | `AppCard` (antd `Card` + `Link`) | antd-mobile `Card` (`onClick` + `useRouter`) |

## 文件变更

| 文件 | 操作 |
|------|------|
| `app/page.tsx` | ✏️ 重写：`"use client"`，antd-mobile `Space` + `AutoCenter` + `Card` |
| `components/ui/app-card.tsx` | 🗑 删除 |

## page.tsx 设计

### 客户端组件

使用 `"use client"` 指令，因为 `Card.onClick` 中调用 `useRouter().push()` 需要客户端环境。

### 数据结构

`apps` 数组（title / description / href / icon），新增第三项"台岛遍历"。前两项使用 Next.js 路由，第三项为静态页面使用 `window.open`。

### 核心代码

```tsx
"use client";

import { AutoCenter, Card, Space } from "antd-mobile";
import { useRouter } from "next/navigation";

const apps = [
  {
    title: "浇花助手",
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
  {
    title: "台岛遍历",
    description: "将二〇一六年的行迹，悉数检点，妥为收存",
    href: "/taiwan-1.8.4/index.html",
    icon: "🚲",
  },
];

export default function Home() {
  const router = useRouter();

  function handleClick(href: string) {
    if (href.startsWith("/taiwan")) {
      window.open(href, "_self");
    } else {
      router.push(href);
    }
  }

  return (
    <Space direction="vertical" block>
      <AutoCenter>
        <h1>个人工具箱</h1>
      </AutoCenter>
      {apps.map((app) => (
        <Card
          key={app.href}
          icon={app.icon}
          title={app.title}
          onClick={() => handleClick(app.href)}
        >
          {app.description}
        </Card>
      ))}
    </Space>
  );
}
```

### 样式

使用 antd-mobile 组件库默认样式，不添加任何自定义 CSS（无 `style` prop、无 className、无 CSS 变量覆写）。

## 交互

- Next.js 路由（浇花助手、旅行计划）：`Card.onClick` → `router.push(href)`
- 静态页面（台岛遍历）：`Card.onClick` → `window.open(href, "_self")`
- antd-mobile `Card` 自带触控按下背景色反馈
- `Space block` 保证全宽布局

## 边界情况

| 场景 | 处理 |
|------|------|
| 卡片点击 | antd-mobile Card 自带触控反馈，无 300ms 延迟 |
| 长标题/描述 | Card 默认文字折行 |
| 屏幕旋转 | `Space block` 全宽自适应 |

## 测试要点

- 首页渲染三张卡片，标题、描述、图标正确显示
- 点击"浇花助手"卡片跳转到 `/watering`
- 点击"旅行计划"卡片跳转到 `/travel`
- 点击"台岛遍历"卡片通过 `window.open` 打开 `/taiwan-1.8.4/index.html`
- 页面无 antd 组件引用残留
