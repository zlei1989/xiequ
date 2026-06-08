# Travel 页面 antd-mobile 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app/travel` 从 antd 迁移到 antd-mobile，去掉侧边抽屉，改为 NavBar + TabBar + ActionSheet + Dialog 结构

**Architecture:** 新建 `TravelShell` 组件封装壳逻辑（NavBar、TabBar、ActionSheet、概览 Dialog），layout.tsx 轻量化仅负责数据层和 Suspense 边界，page.tsx 和 list/page.tsx 保持内容逻辑不变

**Tech Stack:** Next.js, React, antd-mobile v5.42.3, antd-mobile-icons, 高德地图 JS API

---

### Task 1: 创建 TravelShell 壳组件

**Files:**
- Create: `app/travel/components/travel-shell.tsx`

- [ ] **Step 1: 创建 travel-shell.tsx**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NavBar, TabBar, ActionSheet, Dialog, ProgressBar } from "antd-mobile";
import { EnvironmentOutline, StarOutline, MoreOutline } from "antd-mobile-icons";
import { useTravelContext } from "../hooks/use-locations";

export function TravelShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { summary } = useTravelContext();

  const [actionVisible, setActionVisible] = useState(false);

  function showOverview() {
    Dialog.show({
      title: "概览",
      content: (
        <div style={{ padding: "8px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#52c41a" }}>
                {summary.checkedCount}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>已去</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#fa8c16" }}>
                {summary.uncheckCount}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>待去</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1677ff" }}>
                {summary.count}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>总计</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>完成进度</div>
          <ProgressBar percent={summary.checkedPercentage} />
          <div
            style={{
              fontSize: 12,
              color: "#1677ff",
              textAlign: "right",
              marginTop: 4,
            }}
          >
            {summary.checkedPercentage}%
          </div>
        </div>
      ),
      closeOnAction: true,
      closeOnMaskClick: true,
    });
  }

  function handleAction(action: { key: string | number }) {
    const key = String(action.key);
    switch (key) {
      case "overview":
        showOverview();
        break;
      case "all":
        router.replace(pathname);
        break;
      case "checked":
        router.replace(pathname + "?filter=checked");
        break;
      case "uncheck":
        router.replace(pathname + "?filter=uncheck");
        break;
      case "add":
        window.dispatchEvent(new CustomEvent("travel:open-search"));
        break;
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <NavBar
        right={
          <MoreOutline
            style={{ fontSize: 24, cursor: "pointer" }}
            onClick={() => setActionVisible(true)}
          />
        }
      >
        旅行计划
      </NavBar>

      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>

      <TabBar
        activeKey={pathname}
        onChange={(key) => router.push(key)}
        safeArea
      >
        <TabBar.Item
          key="/travel"
          icon={<EnvironmentOutline />}
          title="地图"
        />
        <TabBar.Item
          key="/travel/list"
          icon={<StarOutline />}
          title="收藏"
        />
      </TabBar>

      <ActionSheet
        visible={actionVisible}
        actions={[
          { key: "overview", text: "概览" },
          { key: "all", text: "显示全部" },
          { key: "checked", text: "筛选已去" },
          { key: "uncheck", text: "筛选待去" },
          { key: "add", text: "添加位置" },
        ]}
        onAction={handleAction}
        onClose={() => setActionVisible(false)}
        closeOnAction
        safeArea
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty app/travel/components/travel-shell.tsx 2>&1 | head -20
```

Expected: 无类型错误（可能有模块解析 warning，忽略）

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/travel-shell.tsx
git commit -m "feat(travel): add TravelShell component with NavBar, TabBar, ActionSheet, and overview Dialog"
```

---

### Task 2: 重写 layout.tsx

**Files:**
- Modify: `app/travel/layout.tsx`

- [ ] **Step 1: 重写 layout.tsx，替换 antd 为 TravelShell**

完整替换文件内容为：

```tsx
"use client";

import { Suspense } from "react";
import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DotLoading } from "antd-mobile";
import { useLocations, TravelContext } from "./hooks/use-locations";
import { TravelShell } from "./components/travel-shell";

function TravelLayoutInner({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();

  const filterParam = searchParams.get("filter") as "checked" | "uncheck" | null;
  const filter: "all" | "checked" | "uncheck" = filterParam || "all";

  const data = useLocations(filter);

  return (
    <TravelContext.Provider value={data}>
      {data.loading && data.locations.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <DotLoading />
        </div>
      ) : (
        <TravelShell>{children}</TravelShell>
      )}
    </TravelContext.Provider>
  );
}

export default function TravelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <DotLoading />
        </div>
      }
    >
      <TravelLayoutInner>{children}</TravelLayoutInner>
    </Suspense>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -E "error TS" | head -20
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/travel/layout.tsx
git commit -m "refactor(travel): replace antd Layout with TravelShell in layout.tsx"
```

---

### Task 3: 简化 page.tsx

**Files:**
- Modify: `app/travel/page.tsx`

- [ ] **Step 1: 移除手动高度计算**

将 [TripMap 的 style prop](app/travel/page.tsx:69) 从 `style={{ height: "calc(100vh - 48px)" }}` 改为 `style={{ height: "100%" }}`：

```tsx
// 修改前 (line 69):
style={{ height: "calc(100vh - 48px)" }}

// 修改后:
style={{ height: "100%" }}
```

整个 page.tsx 中只有这一行需要修改。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -E "error TS" | head -20
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add app/travel/page.tsx
git commit -m "refactor(travel): remove manual height calc, let flex layout handle it"
```

---

### Task 4: 删除 nav-drawer.tsx

**Files:**
- Delete: `app/travel/components/nav-drawer.tsx`

- [ ] **Step 1: 删除文件**

```bash
rm app/travel/components/nav-drawer.tsx
```

- [ ] **Step 2: 确认没有残留引用**

```bash
grep -r "nav-drawer" app/ --include="*.tsx" --include="*.ts"
```

Expected: 无输出（无残留引用）

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/nav-drawer.tsx
git commit -m "refactor(travel): remove NavDrawer component, replaced by TravelShell TabBar"
```

---

### Task 5: 验证构建

- [ ] **Step 1: 完整 TypeScript 检查**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -E "error TS" | head -30
```

Expected: 无新增类型错误

- [ ] **Step 2: Next.js 构建检查**

```bash
npx next build 2>&1 | tail -30
```

Expected: 构建成功，无错误

- [ ] **Step 3: 启动开发服务器验证**

```bash
# 启动 dev server（后台）:
npx next dev -p 3125 &
sleep 5
# 检查页面可访问:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3125/travel
```

Expected: HTTP 200

- [ ] **Step 4: 最终 commit**

```bash
# 如有任何修复性修改，在此 commit
git add -A
git commit -m "chore(travel): final verification after antd-mobile refactor"
```
