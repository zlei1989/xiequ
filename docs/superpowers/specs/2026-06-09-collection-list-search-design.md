# 收藏列表搜索功能 — 设计文档

**日期：** 2026-06-09
**范围：** `/travel/list` 收藏列表页面

---

## 1. 目标

在收藏列表顶部新增固定搜索框，支持按名称、地址、备注实时过滤已收藏的地点。

---

## 2. 需求摘要

| 维度 | 决定 |
|------|------|
| 搜索范围 | 名称（name）+ 地址（address）+ 备注（comments） |
| 与筛选交互 | 叠加筛选 — 先按 全部/已去/待去 筛选，再在结果中搜索 |
| UI 位置 | 列表顶部固定，紧贴 NavBar 下方 |
| 触发方式 | 输入即搜，实时过滤（客户端） |
| 实现方式 | 纯客户端 `useState` + `useMemo` |

---

## 3. 组件层级与数据流

```
LocationListPage
├── SearchBar              ← 新增，固定在列表顶部
│   value={searchText}
│   onChange={setSearchText}
│   onClear={() => setSearchText("")}
│
├── [加载中 / 空列表]       ← 保持不变
│
├── [搜索无结果]            ← 新增
│   └── ErrorBlock status="empty" title="暂无搜索结果"
│
├── PullToRefresh          ← 保持不变
│   └── List
│       └── LocationListItem[]  ← 由 useMemo 过滤
│
├── LocationViewPopup      ← 保持不变
├── LocationEditPopup      ← 保持不变
├── MomentEditPopup        ← 保持不变
└── SearchPopup            ← 保持不变（添加新地点的搜索）
```

**数据流：**

1. `useTravelContext()` 提供 `sortedLocations`（已按 URL `?filter=` 参数筛选）
2. 新增 `searchText` 本地状态
3. `useMemo` 对 `sortedLocations` 做二次过滤：
   ```
   sortedLocations.filter(loc =>
     loc.name.includes(searchText) ||
     loc.address.includes(searchText) ||
     loc.comments.includes(searchText)
   )
   ```
4. 搜索文本为空时，显示原始的 `sortedLocations`
5. `PullToRefresh` 下拉刷新行为不受影响

---

## 4. 边界情况

### 4.1 搜索为空
- 搜索框为空（`searchText === ""`）→ 显示 `sortedLocations` 全部，行为同当前

### 4.2 无匹配结果
- 搜索文本有值但过滤后列表为空 → 显示 `ErrorBlock`，提示"暂无搜索结果"

### 4.3 与筛选叠加
- `?filter=checked` → 仅显示已去地点，搜索在这些结果中匹配
- `?filter=uncheck` → 仅显示待去地点，搜索在这些结果中匹配
- 无 filter → 在所有未删除的地点中匹配

### 4.4 清空搜索
- 点击 SearchBar 的清空按钮 → `searchText` 置空，恢复显示当前筛选下的全部结果

### 4.5 搜索框与加载状态
- 首次加载中（`loading && sortedLocations.length === 0`）→ 显示加载动画，搜索框不隐藏
- 列表原本为空（`loading === false && sortedLocations.length === 0`）→ 显示"暂无位置"，搜索框不隐藏

---

## 5. 实现要点

### 涉及文件

| 文件 | 改动 |
|------|------|
| `app/travel/list/page.tsx` | 新增 SearchBar 组件、searchText 状态、useMemo 过滤逻辑、无结果提示 |

仅改动一个文件，无需新增组件。

### 搜索匹配
- 使用 `String.prototype.includes()` 做大小写敏感的包含匹配
- 三个字段任一匹配即命中

### 依赖
- `SearchBar` 来自 `antd-mobile`（已在项目中安装）

---

## 6. 测试考虑

- 搜索框输入后列表实时更新
- 搜索词清空后恢复全量显示
- 搜索无结果时显示空状态提示
- 结合 `filter=checked` / `filter=uncheck` 的叠加过滤
- 下拉刷新后搜索词保持，结果正确更新

---

## 7. 不复做的

- 不添加服务端搜索接口
- 不修改 URL search params
- 不改动 `useLocations` hook
- 不影响地图页面（`/travel`）
- 不修改 SearchPopup（那是添加新地点的功能）
