# 首页 antd-mobile 重构实施计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐步实施此计划。

**目标：** 将首页从 antd Row/Col + AppCard 重构为 antd-mobile List，新增台岛遍历卡片，删除 AppCard 组件。

**架构：** `"use client"` 单页面，`List` 布局，`List.Item` 三张应用卡片（大图标 prefix + description + arrowIcon），前两张 `router.push`，第三张 `window.open`。首页无标题栏。

**技术栈：** Next.js 16, React 19, antd-mobile 5, antd-mobile-icons, TypeScript

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `app/page.tsx` | 首页组件，List 布局（无标题栏） | ✏️ 重写 |
| `components/ui/app-card.tsx` | 旧 AppCard（antd Card 包装） | 🗑 删除 |

---

### Task 1: 重写首页 + 删除 AppCard

**文件：**
- 修改：`app/page.tsx`
- 删除：`components/ui/app-card.tsx`

- [ ] **Step 1: 重写 `app/page.tsx`**

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

- [ ] **Step 2: 验证 TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 删除 AppCard**

```bash
rm components/ui/app-card.tsx
```

- [ ] **Step 4: 再次验证 TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: 运行测试**

```bash
npm test
```

- [ ] **Step 6: 提交**

```bash
git add app/page.tsx components/ui/app-card.tsx
git commit -m "refactor(home): migrate to antd-mobile NavBar + List, add taiwan card"
```
