# 路线构建器统一最近邻链式排序 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造 `sortGroupEntries` 为统一的贪心最近邻链式排序，第一天以 `DEFAULT_CENTER` 为起始参考点。

**Architecture:** 给 `sortGroupEntries` 增加可选的 `startPoint` 参数，内部用贪心链式替换原有的"第一天保持原序 + 后续天一次性排序"逻辑。`buildRoutes` 调用时传入 `DEFAULT_CENTER`。

**Tech Stack:** TypeScript、Vitest

## 全局约束

- 纯函数，不依赖外部状态
- 不可变操作（`[...arr]`、新数组，不修改输入）
- 禁止 non-null assertion（`!`）
- 注释风格：中文 JSDoc，先说"做什么"再说"怎么做"

---

### Task 1: 更新测试 — 新增第一天多景点链式排序用例

**Files:**
- Modify: `__tests__/travel/build-routes.test.ts`

**Interfaces:**
- Consumes: `buildRoutes`（现有导出）
- Produces: 无（测试文件，不产出接口）

- [ ] **Step 1: 在现有测试文件末尾添加两个新测试用例**

在 `describe('buildRoutes', () => {` 块的最后一个 `it(...)` 之后、`});` 之前插入：

```typescript
  it('first day multiple locations: nearest to DEFAULT_CENTER becomes first, then chain', () => {
    // 西湖离北京远（约 1130 km），故宫离北京近（约 0 km）
    // DEFAULT_CENTER = [116.397477, 39.908692]（北京）
    // 旧行为：第一天按原始数组顺序 → 西湖在前
    // 新行为：故宫离 DEFAULT_CENTER 最近 → 故宫第一
    const locs = [
      makeLocation({ id: '1', name: '西湖', longitude: 120.2, latitude: 30.3, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '3', name: '外滩', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-02') }),
      makeLocation({ id: '4', name: '长城', longitude: 116.0, latitude: 40.4, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    // 故宫离 DEFAULT_CENTER 最近，链式第一；然后西湖（day1 剩余）；外滩（day2）；长城（day3）
    expect(r.markers.map((m) => m.name)).toEqual(['故宫', '西湖', '外滩', '长城']);
  });

  it('first day single location: chain degrades to identity', () => {
    const locs = [
      makeLocation({ id: '1', name: '故宫', longitude: 116.4, latitude: 39.9, moments: mm('2024-01-01') }),
      makeLocation({ id: '2', name: '南京', longitude: 118.8, latitude: 32.1, moments: mm('2024-01-02') }),
      makeLocation({ id: '3', name: '上海', longitude: 121.5, latitude: 31.2, moments: mm('2024-01-03') }),
    ];
    const routes = buildRoutes(locs);
    expect(routes).toHaveLength(1);
    const r = routes[0] as Route;
    // 每天一个景点，链式退化，与原始顺序一致
    expect(r.markers.map((m) => m.name)).toEqual(['故宫', '南京', '上海']);
  });
```

- [ ] **Step 2: 运行测试确认新测试 FAIL**

```bash
npm run test -- __tests__/travel/build-routes.test.ts
```

预期：新测试 FAIL，因为 `sortGroupEntries` 尚未改造。

- [ ] **Step 3: 提交**

```bash
git add __tests__/travel/build-routes.test.ts
git commit -m "test: 添加第一天多景点链式排序测试用例（RED）"
```

---

### Task 2: 重构 `sortGroupEntries` — 统一贪心最近邻链式

**Files:**
- Modify: `app/travel/lib/build-routes.ts`

**Interfaces:**
- Consumes: `DEFAULT_CENTER`（从 `./calc-distance` 导入）
- Produces: `sortGroupEntries(entries: MomentEntry[], startPoint?: [number, number]): MomentEntry[]`

- [ ] **Step 1: 添加 `DEFAULT_CENTER` 导入**

在文件顶部的 import 块中添加：

```typescript
import { DEFAULT_CENTER } from './calc-distance';
```

- [ ] **Step 2: 重写 `sortGroupEntries` 函数**

将原来的函数（第 93-131 行）替换为：

```typescript
/**
 * 组内排序：贪心最近邻链式
 *
 * 从 startPoint 出发，每一天内依次贪心选择离上一个已确定条目最近的条目。
 * 链式贯穿所有天——每天的最后一个条目会成为下一天的参考点。
 * startPoint 未传入时回退到第一个条目的坐标。
 *
 * @param entries - 待排序的瞬间条目（已按日期升序排列）
 * @param startPoint - 链式起始坐标 [lng, lat]
 * @returns 按最近邻链式排列的条目
 */
function sortGroupEntries(
  entries: MomentEntry[],
  startPoint?: [number, number],
): MomentEntry[] {
  if (entries.length <= 1) return entries;

  // 按日期分组（保持插入顺序即日期升序）
  const byDate = new Map<string, MomentEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) {
      list.push(e);
    } else {
      byDate.set(e.date, [e]);
    }
  }

  const result: MomentEntry[] = [];
  // 起始坐标：传入的 startPoint 或第一个条目的坐标
  const first = entries[0];
  let prevCoords: [number, number] = startPoint ?? [first.longitude, first.latitude];

  for (const [, dayEntries] of byDate) {
    const remaining = [...dayEntries];

    while (remaining.length > 0) {
      // 贪心选择离上一个已确定坐标最近的条目
      const firstRemaining = remaining[0];
      let nearestIdx = 0;
      let nearestDist = Math.hypot(
        firstRemaining.longitude - prevCoords[0],
        firstRemaining.latitude - prevCoords[1],
      );

      for (let i = 1; i < remaining.length; i++) {
        const curr = remaining[i];
        const dist = Math.hypot(
          curr.longitude - prevCoords[0],
          curr.latitude - prevCoords[1],
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      const picked = remaining[nearestIdx];
      result.push(picked);
      // 更新参考点，链式延续
      prevCoords = [picked.longitude, picked.latitude];
      remaining.splice(nearestIdx, 1);
    }
  }

  return result;
}
```

- [ ] **Step 3: 更新 `buildRoutes` 中的调用**

将第 187 行：

```typescript
const sorted = sortGroupEntries(group);
```

改为：

```typescript
const sorted = sortGroupEntries(group, DEFAULT_CENTER);
```

- [ ] **Step 4: 运行测试确认 PASS**

```bash
npm run test -- __tests__/travel/build-routes.test.ts
```

预期：全部测试 PASS（包括旧测试和新增的两个测试）。

- [ ] **Step 5: 格式化 + 检查**

```bash
npm run format
npm run check
```

修复所有 ESLint/TypeScript 错误。

- [ ] **Step 6: 提交**

```bash
git add app/travel/lib/build-routes.ts
git commit -m "feat: 路线构建统一最近邻链式排序，第一天以 DEFAULT_CENTER 为起始点"
```

---

### Task 3: 代码审查

**Files:**
- 审查: `app/travel/lib/build-routes.ts`
- 审查: `__tests__/travel/build-routes.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: 审查结论

- [ ] **Step 1: 使用 code-reviewer agent 审查改动**

审查要点：
- `startPoint` 默认值逻辑是否正确（`entries[0]` 在 `entries.length <= 1` 早返回后保证存在）
- 贪心链式循环是否无限循环风险（`while (remaining.length > 0)` + `splice` 保证每轮减少一个元素）
- `DEFAULT_CENTER` 的使用是否符合 spec 要求
- 测试覆盖是否充分

- [ ] **Step 2: 修复审查发现的问题**

如有 CRITICAL 或 HIGH 问题，修复后重新运行测试和格式化。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: 代码审查后修复"
```

（仅当有修复时执行此步骤）
