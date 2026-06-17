# 所有弹出层接入返回键拦截 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目中所有 antd-mobile `Popup` 和 antd `Drawer` 接入全局返回键拦截栈

**Architecture:** 纯增量接入——不改 `lib/back-button.ts` 的 hook 实现，只在 4 个文件中各加 `import` 和 `useBackButton(visible, onClose)` 调用。hook 的全局栈自动处理嵌套 LIFO 顺序。

**Tech Stack:** React 19 + antd-mobile 5 + antd 6 + TypeScript

---

### Task 1: RouteMapPopup 外层弹窗和入口列表面板

**Files:**
- Modify: `app/travel/components/route-map-popup.tsx`

- [ ] **Step 1: 添加 import**

在 `route-map-popup.tsx` 的现有 import 块中插入 `useBackButton` 导入。在第 10 行（`'use client'` 之后的第一条 import）之后添加：

```tsx
import { useBackButton } from '@/lib/back-button';
```

- [ ] **Step 2: 为外层 RouteMapPopup 添加 hook 调用**

在 `RouteMapPopup` 函数体内，第 33 行 `const { locations, update, remove } = useTravelContext();` 之前插入：

```tsx
  useBackButton(visible, onClose);
```

- [ ] **Step 3: 为入口列表面板（右侧 Popup）添加 hook 调用**

在 `RouteMapPopup` 函数体内，步骤 2 刚添加的行之后继续插入：

```tsx
  useBackButton(showEntryList, () => { setShowEntryList(false); });
```

- [ ] **Step 4: 运行类型检查和格式化**

```bash
npm run format
npm run check
```

修复所有错误后继续。

- [ ] **Step 5: Commit**

```bash
git add app/travel/components/route-map-popup.tsx
git commit -m "feat: add back-button interception to RouteMapPopup and entry list panel"
```

---

### Task 2: EventButtons bootstrap 和 change 弹窗

**Files:**
- Modify: `app/watering/debug/components/event-buttons.tsx`

- [ ] **Step 1: 添加 import**

在 `event-buttons.tsx` 第 7 行 `'use client'` 之后的 import 块中添加：

```tsx
import { useBackButton } from '@/lib/back-button';
```

- [ ] **Step 2: 为 bootstrap Popup 添加 hook 调用**

在 `EventButtons` 函数体内（第 54 行 `const [popupType, setPopupType] = useState<PopupType>(null);` 之后）插入：

```tsx
  useBackButton(popupType === 'bootstrap', closePopup);
```

- [ ] **Step 3: 为 change Popup 添加 hook 调用**

在步骤 2 刚添加的行之后继续插入：

```tsx
  useBackButton(popupType === 'change', closePopup);
```

- [ ] **Step 4: 运行类型检查和格式化**

```bash
npm run format
npm run check
```

修复所有错误后继续。

- [ ] **Step 5: Commit**

```bash
git add app/watering/debug/components/event-buttons.tsx
git commit -m "feat: add back-button interception to debug bootstrap and change popups"
```

---

### Task 3: DeviceEditor 四层嵌套 Drawer

**Files:**
- Modify: `app/watering/components/device-editor.tsx`

- [ ] **Step 1: 添加 import**

在 `device-editor.tsx` 第 11 行 `'use client'` 之后的 import 块中添加：

```tsx
import { useBackButton } from '@/lib/back-button';
```

- [ ] **Step 2: 为流程编辑 Drawer 添加 hook 调用**

在 `DeviceEditor` 函数体内，第 91 行 `const [processVisible, setProcessVisible] = useState(false);` 下方添加：

```tsx
  useBackButton(processVisible, () => { setProcessVisible(false); });
```

- [ ] **Step 3: 为步骤编辑 Drawer 添加 hook 调用**

接上：

```tsx
  useBackButton(stepVisible, () => { setStepVisible(false); });
```

- [ ] **Step 4: 为中断编辑 Drawer 添加 hook 调用**

接上：

```tsx
  useBackButton(interruptVisible, () => { setInterruptVisible(false); });
```

- [ ] **Step 5: 为计划任务 Drawer 添加 hook 调用**

接上：

```tsx
  useBackButton(scheduleVisible, () => { setScheduleVisible(false); });
```

- [ ] **Step 6: 运行类型检查和格式化**

```bash
npm run format
npm run check
```

修复所有错误后继续。

- [ ] **Step 7: Commit**

```bash
git add app/watering/components/device-editor.tsx
git commit -m "feat: add back-button interception to device editor nested drawers"
```

---

### Task 4: VoltageConfigDrawer

**Files:**
- Modify: `app/watering/components/voltage-config-drawer.tsx`

- [ ] **Step 1: 添加 import**

在 `voltage-config-drawer.tsx` 第 5 行 `'use client'` 之后的 import 块中添加：

```tsx
import { useBackButton } from '@/lib/back-button';
```

- [ ] **Step 2: 添加 hook 调用**

在 `VoltageConfigDrawer` 函数体内（第 34 行 `const config = ...` 之后）添加：

```tsx
  useBackButton(open, onClose);
```

- [ ] **Step 3: 运行类型检查和格式化**

```bash
npm run format
npm run check
```

修复所有错误后继续。

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/voltage-config-drawer.tsx
git commit -m "feat: add back-button interception to voltage config drawer"
```

---

### Task 5: 最终验证

- [ ] **Step 1: 全量类型检查和格式化**

```bash
npm run format
npm run check
```

预期：0 错误。

- [ ] **Step 2: 运行现有测试**

```bash
npm run test
```

预期：全部通过，特别是 `__tests__/lib/back-button.test.ts` 的 8 个用例。

- [ ] **Step 3: 检查改动范围**

```bash
git diff --stat origin/master
```

预期：仅 4 个文件被修改，无其他意外改动。
