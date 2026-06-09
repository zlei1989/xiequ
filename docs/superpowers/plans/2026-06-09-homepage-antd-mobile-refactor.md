# 首页 antd-mobile 卡片重构实施计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐步实施此计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标：** 将首页从 antd Row/Col + AppCard 重构为 antd-mobile Space + AutoCenter + Card，新增台岛遍历卡片，删除 AppCard 组件。

**架构：** 单页面组件，`"use client"` 模式，antd-mobile `Space` 垂直布局 + `AutoCenter` 居中标题 + `Card` 三张应用卡片。前两张走 Next.js `router.push`，第三张静态页面走 `window.open`。

**技术栈：** Next.js 16, React 19, antd-mobile 5, TypeScript

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `app/page.tsx` | 首页组件，三张入口卡片 | ✏️ 重写 |
| `components/ui/app-card.tsx` | 旧 AppCard（antd Card 包装） | 🗑 删除 |

---

### Task 1: 重写首页组件

**文件：**
- 修改：`app/page.tsx`

- [ ] **Step 1: 重写 `app/page.tsx`**

用以下代码完整替换现有文件内容：

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

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 3: 删除 AppCard 组件文件**

```bash
rm components/ui/app-card.tsx
```

- [ ] **Step 4: 验证无残留引用**

```bash
npx tsc --noEmit
```

预期：无类型错误（确保没有其他地方引用 `AppCard`）。

- [ ] **Step 5: 提交**

```bash
git add app/page.tsx components/ui/app-card.tsx
git commit -m "refactor(home): migrate homepage to antd-mobile Card, add taiwan card"
```
