# 旅行模块子页面 Route Group 收敛

## 背景

当前 `app/travel/` 下 page 文件分散在多个顶层目录中，目录结构不够清晰：

```
app/travel/
  page.tsx          → /travel
  list/page.tsx     → /travel/list
  routes/page.tsx   → /travel/routes
  components/       → 组件
  hooks/            → hooks
  ...
```

目标：将子页面（非主页）收进一个 Route Group，形成主/次分层。

## 方案

### URL 变更

| 原 URL | 新 URL | 说明 |
|--------|--------|------|
| `/travel` | `/travel` | 不变 |
| `/travel/list` | `/travel/favourites` | 重命名 |
| `/travel/routes` | `/travel/routes` | 不变 |

### 目录结构

```
app/travel/
  page.tsx                  → /travel                    （地图主页，不变）
  layout.tsx                → 共享布局
  (subpages)/               → Route Group，不出现在 URL
    favourites/page.tsx     → /travel/favourites         （原 list/page.tsx，重命名）
    routes/page.tsx         → /travel/routes             （原 routes/page.tsx，移入）
  components/               → 共享组件
  hooks/                    → hooks
  services/                 → 服务层
  lib/                      → 工具函数
  types.ts
  actions.ts
  api/
```

Route Group `(subpages)` 纯粹是目录层面的组织方式，URL 不受任何影响。约定式路由完全保留——加页面只需在 `(subpages)/` 下建文件夹加 page.tsx 即可。

## 代码变更

### 1. Shell 路径常量（[shell.tsx](app/travel/components/shell.tsx)）

```diff
- const TRAVEL_LIST_PATH = '/travel/list';
+ const TRAVEL_FAVOURITES_PATH = '/travel/favourites';
  const TRAVEL_ROUTES_PATH = '/travel/routes';
```

TabBar `key` 属性同步更新：

```diff
- <TabBar.Item icon={<StarOutline />} key={TRAVEL_LIST_PATH} title="收藏" />
+ <TabBar.Item icon={<StarOutline />} key={TRAVEL_FAVOURITES_PATH} title="收藏" />
```

### 2. Import 路径更新

两个子页面的 import 路径从 `../` 变为 `../../`（多了一层 `(subpages)/`）：

**favourites/page.tsx（原 list/page.tsx）：**
```diff
- import { createMoment } from '../actions';
+ import { createMoment } from '../../actions';
  // 同理 components/, hooks/, lib/, types 全部 ../ → ../../
```

**routes/page.tsx：**
```diff
- import { RouteListItem } from '../components/route-list-item';
+ import { RouteListItem } from '../../components/route-list-item';
  // 同理 components/, hooks/, types 全部 ../ → ../../
```

### 3. 文件重命名

- `app/travel/list/page.tsx` → `app/travel/(subpages)/favourites/page.tsx`
- `app/travel/routes/page.tsx` → `app/travel/(subpages)/routes/page.tsx`

### 4. 代码内命名

`list/page.tsx` 文件头注释和组件名从 `LocationListPage` 改为 `FavouritesPage`，函数名同步更新。

## 影响范围

| 文件 | 变更类型 |
|------|----------|
| `app/travel/components/shell.tsx` | 修改路径常量 + TabBar key |
| `app/travel/list/page.tsx` | 移动到 `(subpages)/favourites/`，改 import 路径，重命名组件 |
| `app/travel/routes/page.tsx` | 移动到 `(subpages)/routes/`，改 import 路径 |

## 不变的部分

- `app/travel/page.tsx` — 地图主页，文件位置和 URL 均不变
- `app/travel/layout.tsx` — 共享布局，不受影响
- `components/`、`hooks/`、`services/`、`lib/`、`types.ts`、`actions.ts` — 位置不变
- 所有功能逻辑 — 没有任何业务行为变更
