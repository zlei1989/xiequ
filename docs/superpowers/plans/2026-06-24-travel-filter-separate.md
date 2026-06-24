# 旅行模块筛选图标分离 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"显示全部/筛选已去/筛选待去"从"更多"ActionSheet 分离到独立的筛选图标，放在 NavBar 右侧"更多"按钮左侧。

**Architecture:** 仅修改 `shell.tsx`：新增 `FilterOutline` 图标 + 独立 ActionSheet，移除原有 ActionSheet 中的筛选项。筛选仍通过 URL 参数驱动，`layout.tsx` 以下链路不变。

**Tech Stack:** React, antd-mobile, antd-mobile-icons, Next.js App Router

## Global Constraints

- 仅修改 `app/travel/components/shell.tsx`，其他文件不动
- 筛选状态通过 URL 参数 `?filter=checked` / `?filter=uncheck` 管理
- 筛选图标仅在地图 `/travel` 和收藏 `/travel/favourites` Tab 显示，路线 `/travel/routes` 隐藏
- 筛选激活时图标变蓝（`--adm-color-primary`），默认状态为默认色
- 使用 `Space` 包裹两个图标

---

### Task 1: 新增导入和筛选状态读取

**Files:**
- Modify: `app/travel/components/shell.tsx:10-16`

**Interfaces:**
- Produces: `searchParams`, `filterParam`, `isFiltering` 变量供后续步骤使用
- Produces: `filterVisible` state + `setFilterVisible`
- Produces: `FilterOutline` 图标组件
- Produces: `Space` 组件
- Produces: `useSearchParams` hook

- [ ] **Step 1: 在 shell.tsx 顶部新增导入**

```tsx
import { ActionSheet, Card, Dialog, Grid, NavBar, ProgressBar, SafeArea, Space, TabBar } from 'antd-mobile';
import { EnvironmentOutline, FilterOutline, MoreOutline, StarOutline, AppstoreOutline, TravelOutline } from 'antd-mobile-icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
```

改动点：
- `antd-mobile` 导入增加 `Space`
- `antd-mobile-icons` 导入增加 `FilterOutline`
- `next/navigation` 导入增加 `useSearchParams`

- [ ] **Step 2: 在 Shell 组件函数体内、现有 state 之后新增筛选状态读取**

在 `const [actionVisible, setActionVisible] = useState(false);` 之后添加：

```tsx
const searchParams = useSearchParams();
const filterParam = searchParams.get('filter') as 'checked' | 'uncheck' | null;
const isFiltering = filterParam === 'checked' || filterParam === 'uncheck';
const [filterVisible, setFilterVisible] = useState(false);
```

- [ ] **Step 3: 运行类型检查确认导入和类型正确**

```bash
npx tsc --noEmit --pretty false --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo app/travel/components/shell.tsx 2>&1 | head -20
```

预期：无类型错误。

- [ ] **Step 4: 提交**

```bash
git add app/travel/components/shell.tsx
git commit -m "feat: travel shell 新增筛选图标所需导入和状态"
```

---

### Task 2: 分离 ActionSheet 内容并新增筛选 ActionSheet

**Files:**
- Modify: `app/travel/components/shell.tsx:79-123` (actions 计算逻辑 + handleAction)
- Modify: `app/travel/components/shell.tsx:150-157` (现有 ActionSheet)

**Interfaces:**
- Consumes: `filterParam`, `isFiltering`, `filterVisible`, `setFilterVisible` (Task 1)
- Consumes: `searchParams` (Task 1)
- Produces: 筛选 ActionSheet（三个选项）+ 精简后的更多 ActionSheet

- [ ] **Step 1: 从 actions 数组中移除三个筛选项**

将 `actions` 计算逻辑中 `base` 数组的三个筛选项移除：

```tsx
const base = [
  { key: 'overview', text: '概览' },
  { key: 'add', text: '添加位置' },
];
```

（从 `base` 中删除 `{ key: 'all', text: '显示全部' }`、`{ key: 'checked', text: '筛选已去' }`、`{ key: 'uncheck', text: '筛选待去' }`）

- [ ] **Step 2: 从 handleAction 中移除三个筛选项的 case 分支**

删除 `handleAction` 中以下分支：

```tsx
case 'all':
  router.replace(pathname);
  break;
case 'checked':
  router.replace(`${pathname}?filter=checked`);
  break;
case 'uncheck':
  router.replace(`${pathname}?filter=uncheck`);
  break;
```

- [ ] **Step 3: 新增筛选 ActionSheet 处理函数和组件**

在 `handleAction` 函数之后、`actions` 计算之前，新增筛选处理函数：

```tsx
/** 筛选 ActionSheet 菜单分发 */
function handleFilterAction(action: { key: string | number }) {
  const key = String(action.key);
  switch (key) {
    case 'all':
      router.replace(pathname);
      break;
    case 'checked':
      router.replace(`${pathname}?filter=checked`);
      break;
    case 'uncheck':
      router.replace(`${pathname}?filter=uncheck`);
      break;
  }
}

/** 筛选选项 */
const filterActions = [
  { key: 'all', text: '显示全部' },
  { key: 'checked', text: '筛选已去' },
  { key: 'uncheck', text: '筛选待去' },
];
```

- [ ] **Step 4: 在 JSX 中新增筛选 ActionSheet**

在现有"更多"ActionSheet 之后、`</div>` 之前，添加筛选 ActionSheet：

```tsx
<ActionSheet
  closeOnAction
  safeArea
  actions={filterActions}
  visible={filterVisible}
  onAction={handleFilterAction}
  onClose={() => { setFilterVisible(false); }}
/>
```

- [ ] **Step 5: 修改 NavBar right 属性**

将原有：

```tsx
right={
  <MoreOutline className="text-2xl" onClick={() => { setActionVisible(true); }} />
}
```

改为：

```tsx
right={
  <Space>
    {pathname !== TRAVEL_ROUTES_PATH && (
      <FilterOutline
        className="text-2xl"
        style={{ color: isFiltering ? 'var(--adm-color-primary)' : undefined }}
        onClick={() => { setFilterVisible(true); }}
      />
    )}
    <MoreOutline className="text-2xl" onClick={() => { setActionVisible(true); }} />
  </Space>
}
```

- [ ] **Step 6: 运行类型检查**

```bash
npx tsc --noEmit --pretty false --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo 2>&1 | head -20
```

预期：无类型错误。

- [ ] **Step 7: 提交**

```bash
git add app/travel/components/shell.tsx
git commit -m "feat: 旅行模块筛选图标分离，新增独立筛选 ActionSheet"
```

---

### Task 3: 格式化、全量检查与验证

**Files:**
- Modify: `app/travel/components/shell.tsx` (格式化)

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行全量检查**

```bash
npm run check
```

预期：全部通过，无类型错误和 lint 错误。

- [ ] **Step 3: 运行现有测试确认无回归**

```bash
npm run test
```

预期：所有测试通过。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: 格式化与检查通过"
```
