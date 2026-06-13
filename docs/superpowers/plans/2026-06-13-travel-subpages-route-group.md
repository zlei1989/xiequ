# 旅行模块子页面 Route Group 收敛 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app/travel/` 下的 `list/` 和 `routes/` 子页面收进 Route Group `(subpages)/`，同时将 `list` 重命名为 `favourites`。

**Architecture:** 创建 `app/travel/(subpages)/` 路由组目录，将原 `list/page.tsx` 和 `routes/page.tsx` 移入并更新 import 路径，Shell 组件同步更新 TabBar 路径常量。零业务逻辑变更，纯目录结构调整。

**Tech Stack:** Next.js App Router Route Groups，TypeScript，React

---

### Task 1: 创建 favourites 子页面（移动并重命名 list/page.tsx）

**Files:**
- Create: `app/travel/(subpages)/favourites/page.tsx`
- Delete: `app/travel/list/page.tsx`

- [ ] **Step 1: 创建目标目录**

```bash
mkdir -p "app/travel/(subpages)/favourites" "app/travel/(subpages)/routes"
```

- [ ] **Step 2: 写入 favourites/page.tsx（完整内容）**

```tsx
/**
 * 旅行收藏页
 *
 * 以列表形式展示位置，支持搜索过滤、下拉刷新。
 * 切换"待去→已去"时自动创建一条当天日期的精彩瞬间记录。
 * 有精彩瞬间的位置锁定为"已去"状态，不可回退。
 */

'use client';

import { PullToRefresh, List, DotLoading, ErrorBlock, Toast, SearchBar } from 'antd-mobile';
import { useState, useEffect, useMemo } from 'react';

import { createMoment } from '../../actions';
import { LocationEditPopup } from '../../components/location-edit-popup';
import { LocationListItem } from '../../components/location-list-item';
import { LocationViewPopup } from '../../components/location-view-popup';
import { MomentEditPopup } from '../../components/moment-edit-popup';
import { SearchPopup } from '../../components/search-popup';
import { useTravelContext } from '../../hooks/use-locations';
import { useMoments } from '../../hooks/use-moments';
import { filterLocations } from '../../lib/filter-locations';

import type { Location, Moment } from '../../types';

export default function FavouritesPage() {
  const { sortedLocations, loading, add, update, remove, load } =
    useTravelContext();

  // 搜索状态
  const [searchText, setSearchText] = useState('');

  // 对已筛选列表做二次搜索过滤
  const filteredLocations = useMemo(
    () => filterLocations(sortedLocations, searchText),
    [sortedLocations, searchText],
  );

  // Popup 状态
  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);

  // 当前查看位置的精彩瞬间
  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
  } = useMoments(viewLocation?.id || '');

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener('travel:open-search', onOpenSearch);
    return () => { window.removeEventListener('travel:open-search', onOpenSearch); };
  }, []);

  // ── 列表操作 ──

  /**
   * 判断位置是否有精彩瞬间记录
   *
   * 有记录的位置锁定为"已去"状态，UI 上禁用切换按钮。
   * 通过检查 moments 对象是否有键来判断（而非检查数组长度），避免空对象误判。
   */
  function hasMoments(location: Location): boolean {
    const moments = location.moments;
    return !!moments && Object.keys(moments).length > 0;
  }

  /**
   * 提取错误消息
   *
   * 优先使用 Error.message，类型不确定时回退到预设文案。
   */
  function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  }

  /**
   * 切换位置打卡状态
   *
   * 从"待去"切到"已去"时自动创建一条当天日期的空文本精彩瞬间记录，
   * 确保每个已去位置至少有一笔记录。有精彩瞬间的位置锁定为已去状态，不可回退。
   * 创建记录失败时中断切换，保持原状态。
   */
  async function handleToggle(location: Location) {
    // 有精彩瞬间时状态锁定，不可切换（防御性，UI 已禁用不会触发）
    if (hasMoments(location)) return;

    // 从待去切到已去时，自动创建一条当天日期的空文本精彩瞬间
    if (!location.checked) {
      try {
        await createMoment(location.id, {
          date: new Date().toISOString().slice(0, 10),
          text: '',
        });
      } catch (err: unknown) {
        console.error('[Travel] handleToggle 创建精彩瞬间失败', {
          locationId: location.id,
          error: err,
        });
        Toast.show({ icon: 'fail', content: getErrorMessage(err, '创建记录失败') });
        return; // 创建失败则不切换状态
      }
    }

    await update(location.id, { checked: !location.checked });
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);

    // 刷新列表数据（moments 变更后需要更新 hasMoments 判断）
    await load();
  }

  /** 删除位置（软删除），同时关闭该位置的查看弹窗 */
  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  // ── 搜索添加 ──

  /**
   * 从搜索结果中添加新位置
   *
   * 创建成功后关闭搜索弹窗并打开该位置的查看弹窗。
   */
  async function handleAdd(data: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) {
    const newLoc = await add(data);
    setSearchVisible(false);
    setViewLocation(newLoc);
  }

  // ── 渲染 ──

  return (
    <>
      {/* 搜索框 — 始终渲染在顶部 */}
      <SearchBar
        placeholder="搜索名称、地址、备注"
        value={searchText}
        onChange={setSearchText}
        onClear={() => { setSearchText(''); }}
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
                hasMoments={hasMoments(location)}
                key={location.id}
                location={location}
                onClick={setViewLocation}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      <LocationViewPopup
        location={viewLocation}
        moments={moments}
        visible={!!viewLocation && !editMoment && !editLocation}
        onAddMoment={() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 非空
          setEditMoment({ locationId: viewLocation!.id, moment: null });
        }}
        onClose={() => { setViewLocation(null); }}
        onDelete={handleDelete}
        onDeleteMoment={async (m) => {
          await removeMoment(m.id);
        }}
        onEdit={(loc) => { setEditLocation(loc); }}
        onEditMoment={(m) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 非空
          setEditMoment({ locationId: viewLocation!.id, moment: m });
        }}
        onToggle={handleToggle}
      />

      <LocationEditPopup
        location={editLocation}
        visible={!!editLocation}
        onClose={() => { setEditLocation(null); }}
        onSave={update}
      />

      <MomentEditPopup
        moment={editMoment?.moment || null}
        visible={!!editMoment}
        onAdd={addMoment}
        onClose={() => { setEditMoment(null); }}
        onSave={updateMoment}
      />

      <SearchPopup
        visible={searchVisible}
        onAdd={(data) => { void handleAdd(data); }}
        onClose={() => { setSearchVisible(false); }}
      />
    </>
  );
}
```

- [ ] **Step 3: 删除旧文件**

```bash
rm "app/travel/list/page.tsx"
```

- [ ] **Step 4: 删除空的 list 目录（如果无其他文件）**

```bash
rmdir "app/travel/list" 2>/dev/null; true
```

- [ ] **Step 5: 运行 TypeScript 类型检查验证**

```bash
npx tsc --noEmit --pretty
```

Expected: 可能有 shell.tsx 还在引用旧路径导致报错，但 favourites/page.tsx 本身应无类型错误。

- [ ] **Step 6: 提交**

```bash
git add app/travel/(subpages)/favourites/page.tsx app/travel/list/page.tsx
git commit -m "refactor: 将 list/page.tsx 移入 (subpages)/favourites/，重命名为 FavouritesPage"
```

---

### Task 2: 移动 routes/page.tsx 到 (subpages)/routes/

**Files:**
- Create: `app/travel/(subpages)/routes/page.tsx`
- Delete: `app/travel/routes/page.tsx`

- [ ] **Step 1: 写入 routes/page.tsx（完整内容）**

```tsx
/**
 * 旅行路线页面
 *
 * 以列表展示所有旅行路线，点击路线弹出地图弹层。
 * 支持下拉刷新重新加载数据。
 */

'use client';

import { PullToRefresh, List, ErrorBlock, DotLoading } from 'antd-mobile';
import { useState } from 'react';

import { RouteListItem } from '../../components/route-list-item';
import { RouteMapPopup } from '../../components/route-map-popup';
import { useTravelContext } from '../../hooks/use-locations';
import { useRoutes } from '../../hooks/use-routes';

import type { Route } from '../../types';

export default function RoutesPage() {
  const { loading, load, locations } = useTravelContext();
  const { routes } = useRoutes();
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  if (loading && locations.length === 0) {
    return (
      <List>
        <List.Item prefix={<DotLoading />}>加载中</List.Item>
      </List>
    );
  }

  if (routes.length === 0) {
    return (
      <ErrorBlock
        description="添加精彩瞬间后将自动生成路线"
        status="empty"
        title="暂无路线"
      />
    );
  }

  return (
    <>
      <PullToRefresh onRefresh={load}>
        <List>
          {routes.map((route) => (
            <RouteListItem
              key={route.id}
              route={route}
              onClick={setSelectedRoute}
            />
          ))}
        </List>
      </PullToRefresh>

      <RouteMapPopup
        route={selectedRoute}
        visible={!!selectedRoute}
        onClose={() => { setSelectedRoute(null); }}
      />
    </>
  );
}
```

- [ ] **Step 2: 删除旧文件**

```bash
rm "app/travel/routes/page.tsx"
```

- [ ] **Step 3: 删除空的 routes 目录（如果无其他文件）**

```bash
rmdir "app/travel/routes" 2>/dev/null; true
```

- [ ] **Step 4: 运行 TypeScript 类型检查**

```bash
npx tsc --noEmit --pretty
```

Expected: routes/page.tsx 无类型错误（shell.tsx 旧路径引用可能仍报错，下一步修复）。

- [ ] **Step 5: 提交**

```bash
git add app/travel/(subpages)/routes/page.tsx app/travel/routes/page.tsx
git commit -m "refactor: 将 routes/page.tsx 移入 (subpages)/routes/"
```

---

### Task 3: 更新 Shell 路径常量

**Files:**
- Modify: `app/travel/components/shell.tsx:21`

- [ ] **Step 1: 修改路径常量定义**

将 `shell.tsx` 第 21 行的路径常量从 `/travel/list` 改为 `/travel/favourites`，同时更新变量名：

```diff
- const TRAVEL_LIST_PATH = '/travel/list';
+ const TRAVEL_FAVOURITES_PATH = '/travel/favourites';
```

- [ ] **Step 2: 修改 TabBar Item 引用**

将 TabBar 中使用 `TRAVEL_LIST_PATH` 的地方改为 `TRAVEL_FAVOURITES_PATH`：

```diff
- <TabBar.Item icon={<StarOutline />} key={TRAVEL_LIST_PATH} title="收藏" />
+ <TabBar.Item icon={<StarOutline />} key={TRAVEL_FAVOURITES_PATH} title="收藏" />
```

- [ ] **Step 3: 运行检查**

```bash
npm run check
```

Expected: 无错误，所有类型检查和 lint 通过。

- [ ] **Step 4: 运行格式化**

```bash
npm run format
```

- [ ] **Step 5: 再次运行检查确认**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add app/travel/components/shell.tsx
git commit -m "refactor: 将 TabBar 收藏路径从 /travel/list 改为 /travel/favourites"
```

---

### Task 4: 最终验证与清理

**Files:** 无新建，全量验证

- [ ] **Step 1: 确认旧目录已删除**

```bash
ls -d app/travel/list app/travel/routes 2>&1
```

Expected: 两个目录均不存在（报 "No such file or directory"）。

- [ ] **Step 2: 确认新目录结构正确**

```bash
ls -R "app/travel/(subpages)/"
```

Expected: 显示 `favourites/page.tsx` 和 `routes/page.tsx`。

- [ ] **Step 3: 全量类型检查 + lint**

```bash
npm run check
```

Expected: PASS

- [ ] **Step 4: 运行测试**

```bash
npm run test
```

Expected: 全部通过（无业务逻辑变更，所有现有测试应继续通过）。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore: 清理空的 list/ 和 routes/ 目录"
```
