# 首页 antd-mobile 重构设计

## 目标

将首页 (`app/page.tsx`) 从 antd 组件迁移到 antd-mobile，删除 AppCard 抽象层，使用 `List` 布局，antd-mobile-icons 图标。首页无标题栏，页面内容即为列表。

## 背景

当前首页使用 `antd` 的 `Row`/`Col` 栅格 + 自定义 `AppCard`（包装 `antd` `Card`）。项目已安装 `antd-mobile`，travel 模块已完成 antd-mobile 重构，首页也应统一迁移。

## 组件树

```
page.tsx ("use client")
└── List
    ├── List.Item prefix=EnvironmentOutline "浇花帮手"
    │   description="IoT 设备管理，远程控制浇花"
    │   clickable arrowIcon onClick → /watering
    ├── List.Item prefix=TravelOutline "旅行计划"
    │   description="地图标注，收藏想去的地方"
    │   clickable arrowIcon onClick → /travel
    └── List.Item prefix=CompassOutline "台岛遍历"
        description="将二〇一六年的行迹，悉数检点，妥为收存"
        clickable arrowIcon onClick → window.open /taiwan-1.8.4/index.html
```

## 组件映射

| UI 区域 | 原实现 | 新实现 |
|---------|--------|--------|
| 列表布局 | antd `Row` + `Col` + `Card` | antd-mobile `List` + `List.Item` |
| 图标 | emoji 字符串 | antd-mobile-icons (`fontSize: 32`) |
| 导航 | `Link` 组件 | `onClick` + `router.push` / `window.open` |

## 文件变更

| 文件 | 操作 |
|------|------|
| `app/page.tsx` | ✏️ 重写 |
| `components/ui/app-card.tsx` | 🗑 删除 |

## page.tsx 设计

### 客户端组件

使用 `"use client"` 指令，因为 `onClick` 中需要 `useRouter` 和 `window.open`。

### 数据结构

三张卡片，前两张 Next.js 路由，第三张为静态页面。

### 核心代码

```tsx
"use client";

import { List } from "antd-mobile";
import { EnvironmentOutline, TravelOutline, CompassOutline } from "antd-mobile-icons";
import { useRouter } from "next/navigation";

const iconStyle = { fontSize: 32 };

const apps = [
  {
    title: "浇花帮手",
    description: "IoT 设备管理，远程控制浇花",
    href: "/watering",
    icon: <EnvironmentOutline style={iconStyle} />,
  },
  {
    title: "旅行计划",
    description: "地图标注，收藏想去的地方",
    href: "/travel",
    icon: <TravelOutline style={iconStyle} />,
  },
  {
    title: "台岛遍历",
    description: "将二〇一六年的行迹，悉数检点，妥为收存",
    href: "/taiwan-1.8.4/index.html",
    icon: <CompassOutline style={iconStyle} />,
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
    <>
      <List>
        {apps.map((app) => (
          <List.Item
            key={app.href}
            prefix={app.icon}
            description={app.description}
            clickable
            arrowIcon
            onClick={() => handleClick(app.href)}
          >
            {app.title}
          </List.Item>
        ))}
      </List>
    </>
  );
}
```

### 样式

- 图标：`fontSize: 32`
- List.Item：`clickable` + `arrowIcon` 带点击反馈和右箭头

## 交互

- Next.js 路由（浇花帮手、旅行计划）：`onClick` → `router.push(href)`
- 静态页面（台岛遍历）：`onClick` → `window.open(href, "_self")`
- `List.Item` 自带 `clickable` 触控反馈
- `arrowIcon` 显示右侧导航箭头

## 边界情况

| 场景 | 处理 |
|------|------|
| 列表项点击 | `clickable` 自带按下背景色反馈 |
| 长标题/描述 | `description` 自然折行 |
| 屏幕旋转 | `List` 全宽自适应 |

## 测试要点

- 首页渲染三张列表项，标题、描述、图标正确显示
- 点击"浇花帮手"跳转到 `/watering`
- 点击"旅行计划"跳转到 `/travel`
- 点击"台岛遍历"通过 `window.open` 打开 `/taiwan-1.8.4/index.html`
- 页面无 NavBar 标题栏
- 页面无 antd 组件引用残留
