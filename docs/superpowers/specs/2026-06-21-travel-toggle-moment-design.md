# 旅行模块 — 位置切换 "已去" 状态逻辑优化

**日期**: 2026-06-21
**状态**: approved

## 背景

当前旅行模块中，位置在"待去"↔"已去"之间切换时有以下问题：

1. **切换锁定过严**：有精彩瞬间的位置被锁定为"已去"，无法回退到"待去"（UI 禁用 Switch + 隐藏左滑按钮）
2. **逻辑分散**：地图页 (`page.tsx`) 的 `handleToggle` 缺少"待去→已去时自动创建瞬间"的逻辑，与收藏页不一致
3. **体验不佳**：用户删除所有瞬间后仍想回退状态，或者误操作后想修正，都被禁用限制阻止

## 目标

- 统一地图页和收藏页的切换逻辑
- 待去 → 已去：检查是否存在精彩瞬间，**不存在**则自动插入当天日期的瞬间；**已存在**则直接切换
- 已去 → 待去：直接切换，无任何限制
- 移除所有基于"是否有精彩瞬间"的禁用/隐藏限制

## 设计

### 核心逻辑：`toggleChecked` in `useMoments`

在 `useMoments` Hook 中新增 `toggleChecked` 方法，收敛切换逻辑：

```
toggleChecked(location, onUpdate):
  if location.checked == false (待去 → 已去):
    hasMoments = location.moments 存在且非空
    if !hasMoments:
      add({ date: today, text: "" })   // 自动创建当天瞬间
    // 已有瞬间 → 直接切换，不重复创建
  // 已去 → 待去：直接切换，无条件
  onUpdate(location.id, { checked: !location.checked })
  load()  // 刷新数据以同步 hasMoments 状态
```

### 改动清单

| 文件 | 改动 |
|------|------|
| `hooks/use-moments.ts` | 新增 `toggleChecked` 方法，接收 `location` + `onUpdate` 回调 |
| `page.tsx` | 地图页 `handleToggle` 改用 `toggleChecked(location, update)` |
| `(subpages)/favourites/page.tsx` | 收藏页 `handleToggle` 改用 `toggleChecked(location, update)`；删除独立的 `hasMoments` 函数 |
| `components/location-list-item.tsx` | 移除 `hasMoments` prop，始终渲染切换按钮 |
| `components/location-view-popup.tsx` | 移除 `disabled={moments.length > 0}`，Switch 始终可操作 |

### 不变的部分

- `actions.ts` — Server Actions 无需改动
- `services/oss.ts` — OSS CRUD 无需改动
- `types.ts` — 类型定义无需改动
- `use-locations.ts` — 位置数据管理无需改动

### 数据流

```
用户点击切换
  → LocationListItem / LocationViewPopup Switch
    → page.handleToggle
      → useMoments.toggleChecked(location, update)
        → [待去→已去] 检查 location.moments
          → 无 → add({ date: today, text: "" })  → createMoment Server Action
          → 有 → 跳过
        → update(location.id, { checked: !checked })  → editLocation Server Action
        → load() 刷新 moments 列表 + 位置数据
```

### 错误处理

- 创建瞬间失败：不切换状态，Toast 提示用户
- 更新位置失败：由 `useLocations.update` 内抛出，上层 Toast 提示

## 影响范围

- **UI 变化**：所有位置的切换按钮/Switch 始终可用，不再有禁用态
- **行为变化**：有瞬间的"已去"位置可回退为"待去"；地图页支持自动创建瞬间
- **无破坏性变更**：已有数据不受影响，仅交互逻辑调整
