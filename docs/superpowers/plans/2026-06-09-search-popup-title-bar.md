# SearchPopup 标题栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「添加位置」搜索弹出层（SearchPopup）添加标题栏（左侧返回按钮 + 中间标题），同时移除搜索框的取消按钮（已有标题栏返回按钮替代）。

**Architecture:** 在现有 `SearchPopup` 组件的 `Popup` 内部顶部添加 antd-mobile `NavBar`，复用 `LocationEditPopup` 已有的标题栏模式。`NavBar` 的 `onBack` 调用已有的 `onClose` 关闭弹窗，children 显示标题文字。同时移除 `SearchBar` 的 `showCancelButton` 属性，因为返回按钮已由 NavBar 提供。

**Tech Stack:** React 19, Next.js 16, antd-mobile 5.x, TypeScript

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/travel/components/search-popup.tsx` | 修改 | 搜索弹出层，本次添加 NavBar 标题栏 |

---

### Task 1: 在 SearchPopup 中添加 NavBar 标题栏

**Files:**
- Modify: `app/travel/components/search-popup.tsx`

- [ ] **Step 1: 添加 NavBar 到 import**

将 `NavBar` 加入 antd-mobile 的 import 语句。

在 [search-popup.tsx:4](app/travel/components/search-popup.tsx#L4)，将：

```tsx
import { DotLoading, ErrorBlock, List, Popup, SearchBar, Toast } from "antd-mobile";
```

改为：

```tsx
import { DotLoading, ErrorBlock, List, NavBar, Popup, SearchBar, Toast } from "antd-mobile";
```

- [ ] **Step 2: 在 Popup 内部顶部添加 NavBar 标题栏**

在 [search-popup.tsx:53](app/travel/components/search-popup.tsx#L53)（Popup 的 children 起始处，`<SearchBar>` 之前），插入 NavBar 组件。

将：

```tsx
      <SearchBar placeholder="选择位置" onSearch={handleSearch} showCancelButton />
```

改为：

```tsx
      <NavBar onBack={onClose}>添加位置</NavBar>
      <SearchBar placeholder="选择位置" onSearch={handleSearch} />
```

- [ ] **Step 3: 验证修改后的文件**

完整文件应为：

```tsx
"use client";

import { useState } from "react";
import { DotLoading, ErrorBlock, List, NavBar, Popup, SearchBar, Toast } from "antd-mobile";
import { searchPlace } from "../services/amap";
import type { AMapPoiItem } from "../services/amap";

export function SearchPopup({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) => void;
}) {
  const [results, setResults] = useState<AMapPoiItem[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(keyword: string) {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const items = await searchPlace(keyword);
      setResults(items);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "搜索失败";
      Toast.show({ icon: "fail", content: "搜索失败: " + message });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        minHeight: "60vh",
        maxHeight: "75vh",
        overflow: "auto",
      }}
    >
      <NavBar onBack={onClose}>添加位置</NavBar>
      <SearchBar placeholder="选择位置" onSearch={handleSearch} />
      {searching ? (
        <List>
          <List.Item prefix={<DotLoading />}>搜索中</List.Item>
        </List>
      ) : results.length === 0 ? (
        <ErrorBlock status="empty" title="暂无搜索结果" />
      ) : (
        <List>
          {results.map((item) => (
            <List.Item
              key={item.id}
              description={item.address}
              clickable
              onClick={() =>
                onAdd({
                  name: item.name,
                  address: item.address,
                  longitude: item.longitude,
                  latitude: item.latitude,
                })
              }
            >
              {item.name}
            </List.Item>
          ))}
        </List>
      )}
    </Popup>
  );
}
```

- [ ] **Step 4: 运行 TypeScript 类型检查确认无编译错误**

```bash
npx tsc --noEmit --pretty
```

预期：无类型错误，编译通过。

- [ ] **Step 5: 手动验证 UI**

启动 dev server：

```bash
npm run dev
```

在浏览器中：
1. 打开旅行页面 `/travel`
2. 点击底部 "更多" 按钮（MoreOutline 图标）
3. 在 ActionSheet 中选择 "添加位置"
4. 确认弹出层顶部出现标题栏：
   - 左侧显示返回箭头 `<`，点击可关闭弹窗
   - 中间显示标题文字「添加位置」
     - 搜索框右侧无取消按钮（已由标题栏返回按钮替代）
5. 点击返回箭头，确认弹窗关闭
6. 点击蒙层，确认弹窗也能正常关闭
7. 搜索一个地点，确认搜索结果列表正常显示在标题栏下方

- [ ] **Step 6: Commit**

```bash
git add app/travel/components/search-popup.tsx
git commit -m "feat(travel): add NavBar title bar to SearchPopup, remove SearchBar cancel button"
```

---

## 自检

1. **Spec coverage:** 需求为"左侧返回按钮 + 中间标题"→ Task 1 Step 2 实现了 `<NavBar onBack={onClose}>添加位置</NavBar>`，满足需求。
2. **Placeholder scan:** 无 TBD/TODO/占位符。所有步骤都包含具体代码。
3. **Type consistency:** `NavBar` 来自 antd-mobile，`onBack` 接收 `onClose` 函数（`() => void` 类型），已在 `LocationEditPopup` 中验证过相同模式。
