# 弹出层标题去文字 + 路线列表倒序排列 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉所有弹出层标题栏的"返回/关闭"文字只留箭头，路线列表按开始时间倒序。

**Architecture:** 纯展示层修改，无架构变更。改 3 个文件共 7 处文字删除 + 1 处排序逻辑。

**Tech Stack:** React, antd-mobile (NavBar/Popup), antd (Drawer/Button), TypeScript

---

### Task 1: route-map-popup.tsx — 去掉 NavBar 的 `back="关闭"`

**Files:**
- Modify: `app/travel/components/route-map-popup.tsx:155`
- Modify: `app/travel/components/route-map-popup.tsx:204`

- [ ] **Step 1: 删除第一个 NavBar 的 `back="关闭"` 属性**

第 155 行，将：
```tsx
        <NavBar
          onBack={onClose}
          back="关闭"
          right={
```

改为：
```tsx
        <NavBar
          onBack={onClose}
          right={
```

- [ ] **Step 2: 删除第二个 NavBar 的 `back="关闭"` 属性**

第 204 行，将：
```tsx
        <NavBar
          onBack={() => { setShowEntryList(false); }}
          back="关闭"
        >
```

改为：
```tsx
        <NavBar
          onBack={() => { setShowEntryList(false); }}
        >
```

- [ ] **Step 3: 确认此处不需要额外 import 变更**

`NavBar` 已从 `antd-mobile` 导入，无变化。

---

### Task 2: device-editor.tsx — 4 个 Drawer 的关闭按钮去掉文字

**Files:**
- Modify: `app/watering/components/device-editor.tsx:488-493`
- Modify: `app/watering/components/device-editor.tsx:529-535`
- Modify: `app/watering/components/device-editor.tsx:571-577`
- Modify: `app/watering/components/device-editor.tsx:615-621`

- [ ] **Step 1: 流程编辑 Drawer 关闭按钮去掉文字（第 488-493 行）**

将：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setProcessVisible(false); }}
              size="small"
            >
              关闭
            </Button>
```

改为：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setProcessVisible(false); }}
              size="small"
            />
```

- [ ] **Step 2: 步骤编辑 Drawer 关闭按钮去掉文字（第 529-535 行）**

将：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setStepVisible(false); }}
              size="small"
            >
              关闭
            </Button>
```

改为：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setStepVisible(false); }}
              size="small"
            />
```

- [ ] **Step 3: 中断编辑 Drawer 关闭按钮去掉文字（第 571-577 行）**

将：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setInterruptVisible(false); }}
              size="small"
            >
              关闭
            </Button>
```

改为：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setInterruptVisible(false); }}
              size="small"
            />
```

- [ ] **Step 4: 定时编辑 Drawer 关闭按钮去掉文字（第 615-621 行）**

将：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setScheduleVisible(false); }}
              size="small"
            >
              关闭
            </Button>
```

改为：
```tsx
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setScheduleVisible(false); }}
              size="small"
            />
```

---

### Task 3: voltage-config-drawer.tsx — 关闭按钮去掉文字

**Files:**
- Modify: `app/watering/components/voltage-config-drawer.tsx:63-69`

- [ ] **Step 1: 去掉关闭按钮的文字 children**

将：
```tsx
        <Button
          icon={<CloseOutlined />}
          onClick={handleClose}
          size="small"
        >
          关闭
        </Button>
```

改为：
```tsx
        <Button
          icon={<CloseOutlined />}
          onClick={handleClose}
          size="small"
        />
```

---

### Task 4: build-routes.ts — 路线列表按开始时间倒序

**Files:**
- Modify: `app/travel/lib/build-routes.ts:216`

- [ ] **Step 1: 在 `buildRoutes` 返回前加入倒序排列**

在 `.filter((route) => route.days > 2)` 之后（第 216 行），当前是 `}` 直接返回，改为：

```ts
    })
    .filter((route) => route.days > 2)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
```

改动说明：将链式调用末尾的 `;` 替换为 `.sort(...)` 链式调用。

> `startDate` 格式为 `YYYY-MM-DD` 字符串，`localeCompare` 可正确比较。V8 的 `Array.sort` 是稳定排序，同日路线保持原有顺序。

---

### Task 5: 格式化、检查、提交

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行类型检查 + Lint**

```bash
npm run check
```

预期：无错误。如 ESLint 报 `Button` 自闭合标签格式问题，`npm run format` 已自动修复。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/route-map-popup.tsx \
        app/watering/components/device-editor.tsx \
        app/watering/components/voltage-config-drawer.tsx \
        app/travel/lib/build-routes.ts
git commit -m "feat: remove close text from popup headers, sort routes by start date descending"
```
