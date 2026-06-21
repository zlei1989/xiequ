# 旅行模块位置切换逻辑优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一地图页和收藏页的位置状态切换逻辑，移除精彩瞬间导致的切换禁用限制。

**Architecture:** 在 `useMoments` Hook 中新增 `toggleChecked` 方法收敛切换逻辑；地图页和收藏页的 `handleToggle` 统一调用；`LocationListItem` 和 `LocationViewPopup` 移除切换禁用/隐藏。

**Tech Stack:** React + Next.js App Router + TypeScript，antd-mobile UI 组件库

**Spec:** `docs/superpowers/specs/2026-06-21-travel-toggle-moment-design.md`

---

### 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/travel/hooks/use-moments.ts` | 修改 | 新增 `toggleChecked` 方法 |
| `app/travel/page.tsx` | 修改 | 地图页 `handleToggle` 改用 `toggleChecked` |
| `app/travel/(subpages)/favourites/page.tsx` | 修改 | 收藏页 `handleToggle` 改用 `toggleChecked`，删除 `hasMoments` |
| `app/travel/components/location-list-item.tsx` | 修改 | 移除 `hasMoments` prop，始终渲染切换按钮 |
| `app/travel/components/location-view-popup.tsx` | 修改 | 移除 `disabled={moments.length > 0}` |

---

### Task 1: 在 `useMoments` Hook 中新增 `toggleChecked` 方法

**Files:**
- Modify: `app/travel/hooks/use-moments.ts`

- [ ] **Step 1: 确认 `createMoment` 已导入**

`use-moments.ts` 当前第13-14行导入已包含 `createMoment`，无需修改。

- [ ] **Step 2: 在 `add` 回调之后插入 `toggleChecked` 方法**

在第78行（`}, [locationId, load]);` 之后）插入。注意 `toggleChecked` 直接调用 Server Action `createMoment`（而非 Hook 的 `add`），因为 `add` 绑定的是 `viewLocation?.id`，与列表页左滑切换的场景不匹配。

```typescript
  /**
   * 切换位置打卡状态（收敛地图页和收藏页的共同逻辑）
   *
   * 待去 → 已去：检查是否存在精彩瞬间，不存在则自动创建当天日期的空文本记录；
   * 已存在则直接切换，不重复创建。
   * 已去 → 待去：直接切换，无任何限制。
   * 完成后刷新数据以同步 moments 列表。
   *
   * @param location - 当前被切换的位置对象
   * @param onUpdate - useLocations 的 update 方法，用于持久化 checked 状态
   */
  const toggleChecked = useCallback(async (
    location: Location,
    onUpdate: (id: string, data: Partial<Location>) => Promise<Location>,
  ) => {
    try {
      // 待去 → 已去：检查是否需要自动创建精彩瞬间
      if (!location.checked) {
        const has = location.moments && Object.keys(location.moments).length > 0;
        if (!has) {
          // 不存在精彩瞬间，自动创建当天日期的空文本记录
          // 直接调 Server Action（不用 Hook 的 add，add 绑定的是 viewLocation?.id）
          await createMoment(location.id, {
            date: new Date().toISOString().slice(0, 10),
            text: '',
          });
        }
      }
      // 切换 checked 状态（useLocations.update → editLocation Server Action）
      await onUpdate(location.id, { checked: !location.checked });
      // 刷新数据以同步 moments 列表
      await load();
    } catch (err) {
      console.error('[Travel] toggleChecked 失败:', { locationId: location.id, error: err });
      if (err instanceof Error && err.stack) console.error(err.stack);
      throw err;
    }
  }, [locationId, load]);
```

- [ ] **Step 3: 更新文件顶部类型导入**

`Location` 类型已在 `import('../types')` 路径可用，但当前只导入了 `Moment`。在 `toggleChecked` 函数签名中用到了 `Location`，需要在第16行添加：

```typescript
import type { Location, Moment } from '../types';
```

替换原有的：
```typescript
import type { Moment } from '../types';
```

- [ ] **Step 4: 在返回值中添加 `toggleChecked`**

修改第112行的 `return` 语句：

```typescript
  return { moments, loading, load, add, update, remove, toggleChecked };
```

- [ ] **Step 5: Commit**

```bash
git add app/travel/hooks/use-moments.ts
git commit -m "feat: useMoments 新增 toggleChecked 方法统一位置切换逻辑"
```

---

### Task 2: 地图页 `handleToggle` 改用 `toggleChecked`

**Files:**
- Modify: `app/travel/page.tsx`

- [ ] **Step 1: 从 `useMoments` 解构中取出 `toggleChecked`**

修改第38-43行：

```typescript
  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
    toggleChecked,
  } = useMoments(viewLocation?.id || '');
```

- [ ] **Step 2: 替换 `handleToggle` 函数**

替换第77-87行的整个 `handleToggle`：

```typescript
  /**
   * 切换位置打卡状态
   *
   * 统一使用 useMoments.toggleChecked，待去→已去时自动检查并创建精彩瞬间。
   * 更新后同步刷新当前打开的弹窗中的位置数据。
   */
  async function handleToggle(location: Location) {
    await toggleChecked(location, update);
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }
```

- [ ] **Step 3: Commit**

```bash
git add app/travel/page.tsx
git commit -m "feat: 地图页切换位置状态改用 toggleChecked 统一逻辑"
```

---

### Task 3: 收藏页 `handleToggle` 改用 `toggleChecked`，删除 `hasMoments`

**Files:**
- Modify: `app/travel/(subpages)/favourites/page.tsx`

- [ ] **Step 1: 从 `useMoments` 解构中取出 `toggleChecked`**

修改第49-54行：

```typescript
  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
    toggleChecked,
  } = useMoments(viewLocation?.id || '');
```

- [ ] **Step 2: 删除 `hasMoments` 和 `getErrorMessage` 函数**

删除第67-86行的整个代码块：

```typescript
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
```

替换为仅保留分隔注释：

```typescript
  // ── 列表操作 ──
```

- [ ] **Step 3: 移除 `createMoment` 导入**

删除第14行（`import { createMoment } from '../../actions';`）。不再直接调用 `createMoment`，该调用已收敛到 `useMoments.toggleChecked` 内部。

- [ ] **Step 4: 替换 `handleToggle` 函数**

替换第88-122行的整个 `handleToggle` 函数：

```typescript
  /**
   * 切换位置打卡状态
   *
   * 统一使用 useMoments.toggleChecked，待去→已去时自动检查并创建精彩瞬间。
   * 更新后同步刷新弹窗数据和全量位置列表。
   */
  async function handleToggle(location: Location) {
    await toggleChecked(location, update);
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
    // 刷新全量位置数据（使列表项反映最新 checked 状态）
    await load();
  }
```

- [ ] **Step 5: 移除 `LocationListItem` 的 `hasMoments` prop 传递**

修改第173-181行的 JSX：

```tsx
            {filteredLocations.map((location) => (
              <LocationListItem
                key={location.id}
                location={location}
                onClick={setViewLocation}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
```

- [ ] **Step 6: Commit**

```bash
git add app/travel/(subpages)/favourites/page.tsx
git commit -m "feat: 收藏页切换位置状态改用 toggleChecked，移除 hasMoments 限制"
```

---

### Task 4: `LocationListItem` 移除 `hasMoments` prop，始终显示切换按钮

**Files:**
- Modify: `app/travel/components/location-list-item.tsx`

- [ ] **Step 1: 更新文件头注释**

修改第1-3行：

```typescript
/**
 * 位置列表项 — 支持左滑操作（切换状态/删除）
 */
```

- [ ] **Step 2: 从 Props 中移除 `hasMoments`**

修改 Props 解构（第25-37行）：

```typescript
export function LocationListItem({
  location,
  onClick,
  onToggle,
  onDelete,
}: {
  location: Location;
  onClick: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
}) {
```

- [ ] **Step 3: 始终渲染切换按钮**

修改第77-84行的 `rightActions`：

```tsx
        rightActions={[
          {
            key: 'toggle',
            text: location.checked ? '标记待去' : '标记已去',
            color: 'light' as const,
            onClick: handleToggle,
          },
          {
            key: 'delete',
            text: '删除',
            color: 'danger' as const,
            onClick: handleDelete,
          },
        ]}
```

- [ ] **Step 4: Commit**

```bash
git add app/travel/components/location-list-item.tsx
git commit -m "feat: LocationListItem 移除 hasMoments 禁用限制，始终显示切换按钮"
```

---

### Task 5: `LocationViewPopup` 移除 Switch 禁用逻辑

**Files:**
- Modify: `app/travel/components/location-view-popup.tsx`

- [ ] **Step 1: 更新组件 JSDoc 注释**

修改第27-30行：

```typescript
/**
 * 位置详情弹窗
 *
 * 展示封面图（支持上传替换）、名称、地址、坐标、备注、精彩瞬间列表和状态开关。
 */
```

- [ ] **Step 2: 移除 Switch `disabled` 属性**

修改第179-193行：

```tsx
      <List>
        <List.Item
          extra={
            <Switch
              checked={loc.checked}
              checkedText="已去"
              uncheckedText="待去"
              onChange={handleToggle}
            />
          }
        >
          状态
        </List.Item>
      </List>
```

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/location-view-popup.tsx
git commit -m "feat: LocationViewPopup 移除 Switch 禁用限制，状态始终可切换"
```

---

### Task 6: 格式化、类型检查与验证

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行类型检查与 Lint**

```bash
npm run check
```

预期：0 错误。如有错误，逐一修复后重新运行直到通过。

- [ ] **Step 3: 运行测试**

```bash
npm run test
```

预期：全部通过。

- [ ] **Step 4: 手动验证清单**

1. **地图页**：点击没有精彩瞬间的"待去"位置标记 → 标记为"已去"，自动创建一条当天瞬间
2. **地图页**：点击有精彩瞬间的"待去"位置标记 → 标记为"已去"，不创建第二条瞬间
3. **地图页**：点击有精彩瞬间的"已去"位置标记 → 可切换回"待去"
4. **收藏页左滑**：所有位置均显示"标记已去"/"标记待去"按钮
5. **收藏页详情弹窗**：Switch 始终可操作，无禁用态
6. **地图页标记点**：切换后地图标记颜色同步更新

- [ ] **Step 5: 最终 commit**

```bash
git add -A
git commit -m "chore: 格式化与检查修复"
```
