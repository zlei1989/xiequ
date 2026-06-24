# 旅行模块 — 路线构建统一最近邻链式排序

**日期：** 2026-06-24
**范围：** `app/travel/lib/build-routes.ts`、`__tests__/travel/build-routes.test.ts`

## 目标

路线构建时，第一天有多个景区的情况下，以与 `DEFAULT_CENTER`（北京坐标）最近的作为第一个，然后按贪心最近邻链式排列后续景点。同时统一"后续天"的排序逻辑为相同的链式算法。

## 背景

当前 `sortGroupEntries` 采用混合策略：
- 第一天：保持原始顺序（日期排序），不做空间排序
- 后续天：按到前一天最后一个景点的欧几里得距离一次性升序排列

需求：第一天应以离 `DEFAULT_CENTER` 最近的景区作为起始，且组内排序统一为最近邻链式。

## 方案

### 算法变更

改造 `sortGroupEntries`，统一各组内的排序为贪心最近邻链式：

1. 按日期分组 → `Map<date, MomentEntry[]>`
2. 初始化 `prev` 为传入的起始坐标
3. 对每一天的条目集合：
   - 从剩余条目中找出离 `prev` 最近的
   - 弹出并追加到结果
   - `prev` 更新为该条目的坐标
   - 重复直到当天条目全部排完
4. 返回结果

**核心差异：**

| 对比项 | 改前 | 改后 |
|--------|------|------|
| 第一天第一个 | 原始顺序第一个 | 离 DEFAULT_CENTER 最近 |
| 第一天的后续 | 原始顺序 | 贪心链式（每个选离上一个最近的） |
| 后续天 | 一次性按到前一天最后距离排序 | 贪心链式（与第一天统一） |
| 起始点 | 无 | 第一天用 DEFAULT_CENTER，后续天自动延续 |

### 函数签名

```typescript
/**
 * 组内排序：贪心最近邻链式
 *
 * 从 startPoint 出发，每一天内依次贪心选择离上一个已确定条目最近的条目。
 * startPoint 默认使用组内第一个条目的坐标（当未传入时）。
 *
 * @param entries - 待排序的瞬间条目
 * @param startPoint - 链式排序的起始坐标 [lng, lat]，传入 DEFAULT_CENTER
 * @returns 按链式最近邻排列的条目
 */
function sortGroupEntries(
  entries: MomentEntry[],
  startPoint?: [number, number],
): MomentEntry[]
```

### 修改文件

#### `app/travel/lib/build-routes.ts`

1. 导入 `DEFAULT_CENTER`：
```typescript
import { DEFAULT_CENTER } from './calc-distance';
```

2. 重写 `sortGroupEntries` — 移除第一天/后续天分支，统一链式逻辑

3. `buildRoutes` 中调用改为：
```typescript
const sorted = sortGroupEntries(group, DEFAULT_CENTER);
```

#### `__tests__/travel/build-routes.test.ts`

- 更新 "same-day markers sorted by nearest to previous day marker" — 改用链式排序的预期
- 新增 "first day with multiple locations uses nearest to DEFAULT_CENTER as first"
- 新增 "first day chain continues from DEFAULT_CENTER to nearest then chain"

### 边界情况

| 场景 | 处理方式 |
|------|---------|
| 第一天只有 1 个景区 | 链式仅剩自己，直接选中，无影响 |
| DEFAULT_CENTER 与所有景点等距 | `Array.sort` 稳定排序，保持原始相对顺序 |
| 组内跨天，第一天排完后的 prev 传递给第二天 | 自然衔接，无需额外处理 |
| `entries` 为空数组 | 直接返回 `[]` |

## 不影响的部分

- `app/travel/lib/calc-distance.ts` — 无需改动，直接引用已有导出
- `app/travel/types.ts` — 无需改动
- `app/travel/hooks/use-routes.ts` — 无需改动
- `app/travel/(subpages)/routes/page.tsx` — 无需改动
- `app/travel/(subpages)/favourites/page.tsx` — 无需改动
- 其他所有文件 — 无需改动

## 测试要点

- [ ] 第一天 1 个景区：行为不变（链式退化）
- [ ] 第一天 3 个景区：第一个是离 DEFAULT_CENTER 最近的，后续链式
- [ ] 多天、每天多景区：链式贯穿整条路线
- [ ] DEFAULT_CENTER 等距时保持稳定排序
- [ ] 空数组不抛出异常
