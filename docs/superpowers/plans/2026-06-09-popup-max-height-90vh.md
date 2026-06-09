# Popup 最大高度限制为屏幕 90% 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有 antd-mobile `Popup`（旅行模块）的 `bodyStyle` 统一添加 `maxHeight: "75vh"` + `overflow: "auto"`，确保弹窗高度不超过屏幕的 90%，超出内容使用滚动条。

**Architecture:** 直接修改 4 个 Popup 组件的 `bodyStyle` 内联样式。antd-mobile 的 Popup 组件通过 `bodyStyle` prop 将样式注入到弹出内容容器，添加 `maxHeight` + `overflow` 即可约束最大高度并启用内部滚动。

**Tech Stack:** React 19 + TypeScript + antd-mobile 5.x Popup

**范围判断：** 浇水模块使用 antd `Drawer`（非 `Popup`），已通过 `size` 属性控制高度百分比（60%~80%），均在 90% 限制范围内，无需修改。本计划仅覆盖旅行模块的 4 个 antd-mobile `Popup`。

---

## 文件结构

| 文件 | 修改内容 | 职责 |
|------|----------|------|
| `app/travel/components/location-view-popup.tsx:89-94` | `maxHeight: "80vh"` → `maxHeight: "75vh"` | 位置查看弹窗 |
| `app/travel/components/location-edit-popup.tsx:51-55` | `bodyStyle` 添加 `maxHeight` + `overflow` | 位置编辑弹窗 |
| `app/travel/components/moment-edit-popup.tsx:66-70` | `bodyStyle` 添加 `maxHeight` + `overflow` | 瞬间编辑弹窗 |
| `app/travel/components/search-popup.tsx:44-48` | `bodyStyle` 添加 `maxHeight` + `overflow`，确保搜索结果区可滚动 | 搜索弹窗 |

---

### Task 1: 更新位置查看弹窗 maxHeight（80vh → 75vh）

**Files:**
- Modify: `app/travel/components/location-view-popup.tsx:89-94`

- [ ] **Step 1: 修改 bodyStyle 中的 maxHeight**

将第 92 行的 `maxHeight: "80vh"` 改为 `maxHeight: "75vh"`：

```tsx
// 修改前（第 89-94 行）
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  maxHeight: "80vh",
  overflow: "auto",
}}

// 修改后
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  maxHeight: "75vh",
  overflow: "auto",
}}
```

- [ ] **Step 2: 验证修改**

运行项目并打开旅行页面，点击地图标记弹出位置查看浮层，确认：
- 浮层高度不超过屏幕 90%
- 内容超出时可正常滚动（封面图、信息区、精彩瞬间列表、底部操作栏）

运行：`pnpm dev`
预期：Popup 显示正常，滚动正常

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/location-view-popup.tsx
git commit -m "fix(travel): update LocationViewPopup maxHeight from 80vh to 75vh"
```

---

### Task 2: 为位置编辑弹窗添加 maxHeight 和 overflow

**Files:**
- Modify: `app/travel/components/location-edit-popup.tsx:51-55`

- [ ] **Step 1: 修改 bodyStyle，添加 maxHeight + overflow**

将第 51-55 行的 `bodyStyle` 从仅有 `minHeight` 改为同时包含 `maxHeight` 和 `overflow`：

```tsx
// 修改前（第 51-55 行）
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  minHeight: "50vh",
}}

// 修改后
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  minHeight: "50vh",
  maxHeight: "75vh",
  overflow: "auto",
}}
```

- [ ] **Step 2: 验证修改**

运行项目，在旅行页面点击位置列表编辑按钮，确认：
- 弹窗高度不超过屏幕 90%
- 表单内容（名称、地址、备注输入框）可在必要时滚动

运行：`pnpm dev`
预期：Popup 表单正常，小屏设备不会被裁剪

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/location-edit-popup.tsx
git commit -m "fix(travel): add maxHeight 75vh and overflow to LocationEditPopup"
```

---

### Task 3: 为瞬间编辑弹窗添加 maxHeight 和 overflow

**Files:**
- Modify: `app/travel/components/moment-edit-popup.tsx:66-70`

- [ ] **Step 1: 修改 bodyStyle，添加 maxHeight + overflow**

将第 66-70 行的 `bodyStyle` 添加 `maxHeight` 和 `overflow`：

```tsx
// 修改前（第 66-70 行）
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  minHeight: "40vh",
}}

// 修改后
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  minHeight: "40vh",
  maxHeight: "75vh",
  overflow: "auto",
}}
```

- [ ] **Step 2: 验证修改**

运行项目，在旅行页面点击添加/编辑瞬间记录，确认：
- 弹窗高度不超过屏幕 90%
- 日期和内容输入框正常可用
- 小屏设备不会被裁剪

运行：`pnpm dev`
预期：Popup 表单正常，滚动正常

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/moment-edit-popup.tsx
git commit -m "fix(travel): add maxHeight 75vh and overflow to MomentEditPopup"
```

---

### Task 4: 为搜索弹窗添加 maxHeight 和 overflow

**Files:**
- Modify: `app/travel/components/search-popup.tsx:44-48`

- [ ] **Step 1: 修改 bodyStyle，添加 maxHeight + overflow**

将第 44-48 行的 `bodyStyle` 添加 `maxHeight` 和 `overflow`：

```tsx
// 修改前（第 44-48 行）
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  minHeight: "60vh",
}}

// 修改后
bodyStyle={{
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  minHeight: "60vh",
  maxHeight: "75vh",
  overflow: "auto",
}}
```

**注意：** 搜索弹窗内的 `<List>` 渲染搜索结果——当结果较多时，`Popup` 的 `bodyStyle` 中设置 `overflow: "auto"` 即可实现弹窗内部整体滚动，无需额外修改 List 组件。

- [ ] **Step 2: 验证修改**

运行项目，在旅行页面点击搜索按钮，搜索地点（如输入"天安门"返回大量结果），确认：
- 弹窗高度不超过屏幕 90%
- 搜索结果列表可滚动浏览
- SearchBar 固定在顶部不随列表滚动

运行：`pnpm dev`
预期：搜索弹窗正常，结果列表可滚动

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/search-popup.tsx
git commit -m "fix(travel): add maxHeight 75vh and overflow to SearchPopup"
```

---

## 验证清单

全部修改完成后，按以下清单逐一验证：

1. **位置查看弹窗** — 打开位置详情，确认高度 ≤ 75vh，内容可滚动
2. **位置编辑弹窗** — 编辑位置信息，确认高度 ≤ 75vh，表单可用
3. **瞬间编辑弹窗** — 添加/编辑瞬间记录，确认高度 ≤ 75vh
4. **搜索弹窗** — 搜索并查看结果，确认高度 ≤ 75vh，列表可滚动
5. **浇水模块 Drawer** — 确认设备编辑器的各层 Drawer 未受影响（无需修改，仅验证）

## 未修改的文件（无需变更）

| 文件 | 原因 |
|------|------|
| `app/watering/components/device-editor.tsx` | 使用 antd `Drawer` + `size` 属性（60%-80%），均在 90% 限制内 |
| `app/watering/components/voltage-config-drawer.tsx` | 使用 antd `Drawer` + `size="60%"`，在 90% 限制内 |
