# 收藏列表搜索功能 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for syntax tracking.

**Goal:** 在 `/travel/list` 收藏列表顶部增加固定搜索框，支持按名称、地址、备注实时过滤。

**Architecture:** 将过滤逻辑抽成纯函数 `filterLocations(locations, keyword)` → `Location[]`，单独可测；页面组件使用 `SearchBar` + `useState` + `useMemo` 调用该函数做渲染前过滤。

**Tech Stack:** React 19, Next.js 16, antd-mobile (SearchBar, ErrorBlock), Vitest

---

## 实现前准备

### 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新增 | `app/travel/lib/filter-locations.ts` | 纯函数：按关键词过滤位置列表 |
| 新增 | `__tests__/travel/filter-locations.test.ts` | 纯函数单元测试 |
| 修改 | `app/travel/list/page.tsx` | 集成 SearchBar + 搜索状态 + 过滤逻辑 |

---

### Task 1: 编写过滤函数及其测试

**Files:**
- Create: `app/travel/lib/filter-locations.ts`
- Create: `__tests__/travel/filter-locations.test.ts`

- [ ] **Step 1: 创建过滤函数**

```typescript
// app/travel/lib/filter-locations.ts
import type { Location } from "../types";

export function filterLocations(
  locations: Location[],
  keyword: string
): Location[] {
  if (!keyword.trim()) return locations;

  const kw = keyword.toLowerCase();
  return locations.filter((loc) => {
    return (
      loc.name.toLowerCase().includes(kw) ||
      loc.address.toLowerCase().includes(kw) ||
      (loc.comments || "").toLowerCase().includes(kw)
    );
  });
}
```

- [ ] **Step 2: 编写单元测试**

```typescript
// __tests__/travel/filter-locations.test.ts
import { describe, it, expect } from "vitest";
import { filterLocations } from "@/app/travel/lib/filter-locations";
import type { Location } from "@/app/travel/types";

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "1",
    name: "故宫",
    address: "北京市东城区",
    longitude: 116.4,
    latitude: 39.9,
    checked: false,
    comments: "值得去",
    deleted: false,
    createdTime: "2026-01-01",
    ...overrides,
  };
}

const locations: Location[] = [
  makeLocation({ id: "1", name: "故宫", address: "北京市东城区", comments: "值得去" }),
  makeLocation({ id: "2", name: "长城", address: "北京市延庆区", comments: "" }),
  makeLocation({ id: "3", name: "西湖", address: "杭州市西湖区", comments: "很美" }),
];

describe("filterLocations", () => {
  it("returns all locations when keyword is empty string", () => {
    expect(filterLocations(locations, "")).toEqual(locations);
  });

  it("returns all locations when keyword is only whitespace", () => {
    expect(filterLocations(locations, "   ")).toEqual(locations);
  });

  it("matches by name (exact)", () => {
    const result = filterLocations(locations, "故宫");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("matches by name (partial)", () => {
    const result = filterLocations(locations, "长");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("matches by address", () => {
    const result = filterLocations(locations, "杭州");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("matches by comments", () => {
    const result = filterLocations(locations, "值得");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("matches across multiple locations", () => {
    const result = filterLocations(locations, "北京");
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.id).sort()).toEqual(["1", "2"]);
  });

  it("is case insensitive", () => {
    const mixed = [
      makeLocation({ id: "1", name: "Gugong", address: "Beijing", comments: "" }),
    ];
    expect(filterLocations(mixed, "gugong")).toHaveLength(1);
    expect(filterLocations(mixed, "beijing")).toHaveLength(1);
  });

  it("returns empty array when no match", () => {
    const result = filterLocations(locations, "不存在的");
    expect(result).toEqual([]);
  });

  it("handles undefined comments gracefully", () => {
    const loc = makeLocation({ id: "1", name: "test", comments: "" });
    const result = filterLocations([loc], "keyword");
    // "" includes "keyword" → false, no crash
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行测试确认失败（函数尚未创建）**

```bash
npx vitest run __tests__/travel/filter-locations.test.ts
```

- [ ] **Step 4: 确认测试通过**

```bash
npx vitest run __tests__/travel/filter-locations.test.ts
```
预期：10 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app/travel/lib/filter-locations.ts __tests__/travel/filter-locations.test.ts
git commit -m "feat(travel): add filterLocations utility with tests"
```

---

### Task 2: 在列表页面集成搜索功能

**Files:**
- Modify: `app/travel/list/page.tsx`

- [ ] **Step 1: 修改页面代码**

在 `page.tsx` 中新增 `SearchBar`，导入 `filterLocations`，用 `useState` + `useMemo` 实现实时过滤。

完整文件改动如下：

```tsx
// 第 1-13 行：在现有 import 中新增 SearchBar 和 useMemo
"use client";

import { useState, useEffect, useMemo } from "react";
import { PullToRefresh, List, DotLoading, ErrorBlock, Toast, SearchBar } from "antd-mobile";
import { useTravelContext } from "../hooks/use-locations";
import { useMoments } from "../hooks/use-moments";
import { LocationListItem } from "../components/location-list-item";
import { LocationViewPopup } from "../components/location-view-popup";
import { LocationEditPopup } from "../components/location-edit-popup";
import { MomentEditPopup } from "../components/moment-edit-popup";
import { SearchPopup } from "../components/search-popup";
import { createMoment } from "../actions";
import { filterLocations } from "../lib/filter-locations";
import type { Location, Moment } from "../types";

export default function LocationListPage() {
  const { sortedLocations, loading, add, update, remove, load } =
    useTravelContext();

  // 搜索状态
  const [searchText, setSearchText] = useState("");

  // 对已筛选列表做二次搜索过滤
  const filteredLocations = useMemo(
    () => filterLocations(sortedLocations, searchText),
    [sortedLocations, searchText]
  );

  // ... 其余状态和逻辑保持不变（Popup 状态、useMoments、事件监听、handleToggle/handleDelete/handleAdd 等）
```

渲染部分（替换原有的 106-127 行）：

```tsx
  // ── 渲染 ──

  return (
    <>
      {/* 搜索框 — 始终渲染在顶部 */}
      <SearchBar
        placeholder="搜索名称、地址、备注"
        value={searchText}
        onChange={setSearchText}
        onClear={() => setSearchText("")}
        style={{ "--background": "#f5f5f5" } as React.CSSProperties}
      />

      {loading && sortedLocations.length === 0 ? (
        <List>
          <List.Item prefix={<DotLoading />}>加载中</List.Item>
        </List>
      ) : sortedLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无位置" />
      ) : searchText.trim() && filteredLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无搜索结果" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {filteredLocations.map((location) => (
              <LocationListItem
                key={location.id}
                location={location}
                hasMoments={hasMoments(location)}
                onClick={setViewLocation}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      {/* Popup 部分保持不变 */}
      <LocationViewPopup ... />
      <LocationEditPopup ... />
      <MomentEditPopup ... />
      <SearchPopup ... />
    </>
  );
}
```

- [ ] **Step 2: TypeScript 编译检查**

```bash
npx tsc --noEmit
```
预期：无 TypeScript 错误。

- [ ] **Step 3: 运行全部测试确认无回归**

```bash
npx vitest run
```
预期：所有测试通过（含新增的 filterLocations 测试）。

- [ ] **Step 4: 提交**

```bash
git add app/travel/list/page.tsx
git commit -m "feat(travel): add search bar to collection list"
```

---

### Task 3: 手动验证（可选）

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 验证搜索行为**

在浏览器中访问 `/travel/list`，验证：
1. 搜索框显示在列表顶部
2. 输入文本后列表实时过滤
3. 清空搜索框恢复全量显示
4. 搜索无匹配时显示"暂无搜索结果"
5. 结合 URL filter（如 `?filter=checked`）搜索，结果受双重过滤
6. 下拉刷新后搜索词保持不变
