# 收藏列表按地图中心距离排序 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收藏列表按与地图中心的距离由近到远排序，位置信息从 localStorage 读取，无记录时回退默认中心。

**Architecture:** 新增 `calc-distance.ts` 提供 Haversine 距离计算和安全读取地图中心的纯函数。收藏页在客户端 `useMemo` 中调用排序逻辑。`trip-map.tsx` 引用共享常量替换硬编码 key。

**Tech Stack:** TypeScript, Vitest (node environment), React `useMemo`

## Global Constraints

- 不可变数据：排序使用 `[...arr].sort()`，不修改原数组
- 无外部网络依赖：纯本地计算
- SSR 兼容：`localStorage` 访问需 guard `typeof window !== 'undefined'`
- 先筛后排：搜索过滤后执行距离排序
- 不显示距离数值

---

### Task 1: 创建 Haversine 距离计算工具模块

**Files:**
- Create: `app/travel/lib/calc-distance.ts`

**Interfaces:**
- Produces:
  - `MAP_CENTER_KEY = 'TRAVEL_MAP_CENTER'` (const)
  - `MAP_ZOOM_KEY = 'TRAVEL_MAP_ZOOM'` (const)
  - `DEFAULT_CENTER: [number, number] = [116.397477, 39.908692]` (const)
  - `haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number` — 返回千米距离
  - `readMapCenter(): [number, number]` — 安全读取 localStorage，返回 `[lng, lat]`

- [ ] **Step 1: 创建 `app/travel/lib/calc-distance.ts`**

```typescript
/**
 * 地理距离计算工具
 *
 * 提供 Haversine 公式计算球面大圆距离，以及从 localStorage 安全读取地图中心坐标。
 * 常量集中管理，供地图组件和收藏页共享引用。
 */

/** 地图中心坐标的 localStorage key */
export const MAP_CENTER_KEY = 'TRAVEL_MAP_CENTER';

/** 地图缩放级别的 localStorage key */
export const MAP_ZOOM_KEY = 'TRAVEL_MAP_ZOOM';

/** 默认地图中心：北京 */
export const DEFAULT_CENTER: [number, number] = [116.397477, 39.908692];

/**
 * 使用 Haversine 公式计算两点间的大圆距离
 *
 * @param lat1 - 点 1 纬度（度）
 * @param lng1 - 点 1 经度（度）
 * @param lat2 - 点 2 纬度（度）
 * @param lng2 - 点 2 经度（度）
 * @returns 距离，单位：千米，保留精确浮点数供排序使用
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // 地球半径（km）

  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * 从 localStorage 安全读取地图中心坐标
 *
 * 防御损坏数据、缺失字段和非预期类型。
 * SSR 环境（无 window）下返回默认中心。
 *
 * @returns 中心坐标 [lng, lat]
 */
export function readMapCenter(): [number, number] {
  // SSR guard：服务端无 localStorage
  if (typeof window === 'undefined') return DEFAULT_CENTER;

  try {
    const raw = localStorage.getItem(MAP_CENTER_KEY);
    if (!raw) return DEFAULT_CENTER;

    const parsed: unknown = JSON.parse(raw);

    // 校验数据形状：[number, number]
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'number' &&
      !Number.isNaN(parsed[0]) &&
      typeof parsed[1] === 'number' &&
      !Number.isNaN(parsed[1])
    ) {
      return [parsed[0], parsed[1]];
    }

    return DEFAULT_CENTER;
  } catch {
    // JSON.parse 异常 — 数据损坏
    return DEFAULT_CENTER;
  }
}
```

- [ ] **Step 2: 验证文件语法无误**

Run: `npx tsc --noEmit app/travel/lib/calc-distance.ts`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add app/travel/lib/calc-distance.ts
git commit -m "feat: 添加 Haversine 距离计算工具及地图中心读取函数"
```

---

### Task 2: 为 calc-distance.ts 编写测试

**Files:**
- Create: `__tests__/travel/calc-distance.test.ts`

**Interfaces:**
- Consumes: `haversineDistance`, `readMapCenter`, `MAP_CENTER_KEY`, `DEFAULT_CENTER` from `@/app/travel/lib/calc-distance`

- [ ] **Step 1: 创建 `__tests__/travel/calc-distance.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  haversineDistance,
  readMapCenter,
  MAP_CENTER_KEY,
  DEFAULT_CENTER,
} from '@/app/travel/lib/calc-distance';

// ── localStorage mock ──

function mockLocalStorage(store: Record<string, string> = {}) {
  const getItem = vi.fn((key: string) => store[key] ?? null);
  const setItem = vi.fn((key: string, value: string) => { store[key] = value; });
  const removeItem = vi.fn((key: string) => { delete store[key]; });
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem, setItem, removeItem },
    writable: true,
    configurable: true,
  });
  return { getItem, setItem, removeItem };
}

function clearLocalStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ── haversineDistance ──

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(39.9, 116.4, 39.9, 116.4)).toBe(0);
  });

  it('returns a reasonable value for known distance (Beijing → Shanghai ~1060 km)', () => {
    // 北京 (39.9, 116.4) → 上海 (31.2, 121.5)
    const distance = haversineDistance(39.9, 116.4, 31.2, 121.5);
    // 允许 ±50 km 误差（经纬度取的近似值）
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1120);
  });

  it('is symmetric (A→B equals B→A)', () => {
    const d1 = haversineDistance(39.9, 116.4, 31.2, 121.5);
    const d2 = haversineDistance(31.2, 121.5, 39.9, 116.4);
    expect(d1).toBe(d2);
  });

  it('returns positive distance for distinct nearby points', () => {
    // 两栋相邻建筑（约 100m）
    const d = haversineDistance(39.9000, 116.4000, 39.9010, 116.4010);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1); // 应小于 1 km
  });
});

// ── readMapCenter ──

describe('readMapCenter', () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  it('returns default center when localStorage is empty', () => {
    mockLocalStorage({});
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns stored center when valid data present', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify([120.15, 30.28]),
    });
    const result = readMapCenter();
    // [lng, lat]
    expect(result).toEqual([120.15, 30.28]);
  });

  it('returns default center when JSON is malformed', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: 'not-valid-json{{{',
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when stored data is not an array', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: '"just-a-string"',
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when array has wrong length', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify([120.15]),
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when array elements are not numbers', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify(['120.15', '30.28']),
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when array contains NaN', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify([NaN, 30.28]),
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center in SSR environment (no window)', () => {
    // 模拟无 localStorage 的 SSR 环境：clearLocalStorage 已清除
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });
});
```

- [ ] **Step 2: 运行测试验证全部通过**

Run: `npx vitest run __tests__/travel/calc-distance.test.ts`
Expected: 所有 10 个测试 PASS

- [ ] **Step 3: 提交**

```bash
git add __tests__/travel/calc-distance.test.ts
git commit -m "test: 添加 Haversine 距离计算和 readMapCenter 的单元测试"
```

---

### Task 3: 更新 trip-map.tsx 使用共享常量

**Files:**
- Modify: `app/travel/components/trip-map.tsx:169-189`

**Interfaces:**
- Consumes: `MAP_CENTER_KEY`, `MAP_ZOOM_KEY`, `DEFAULT_CENTER` from `@/app/travel/lib/calc-distance`

- [ ] **Step 1: 替换硬编码 key 和默认值**

在 `trip-map.tsx` 顶部添加 import：

```typescript
import { MAP_CENTER_KEY, MAP_ZOOM_KEY, DEFAULT_CENTER } from '../lib/calc-distance';
```

将第 169-173 行的：

```typescript
const centerStr = localStorage.getItem('TRAVEL_MAP_CENTER');
const zoomStr = localStorage.getItem('TRAVEL_MAP_ZOOM');
const center: [number, number] = centerStr
  ? (JSON.parse(centerStr) as [number, number])
  : [116.397477, 39.908692];
const zoom: number = zoomStr ? (JSON.parse(zoomStr) as number) : 13;
```

替换为：

```typescript
const centerStr = localStorage.getItem(MAP_CENTER_KEY);
const zoomStr = localStorage.getItem(MAP_ZOOM_KEY);
const center: [number, number] = centerStr
  ? (JSON.parse(centerStr) as [number, number])
  : DEFAULT_CENTER;
const zoom: number = zoomStr ? (JSON.parse(zoomStr) as number) : 13;
```

将第 185 行的：

```typescript
localStorage.setItem('TRAVEL_MAP_CENTER', JSON.stringify([c.lng, c.lat]));
```

替换为：

```typescript
localStorage.setItem(MAP_CENTER_KEY, JSON.stringify([c.lng, c.lat]));
```

将第 189 行的：

```typescript
localStorage.setItem('TRAVEL_MAP_ZOOM', JSON.stringify(map.getZoom()));
```

替换为：

```typescript
localStorage.setItem(MAP_ZOOM_KEY, JSON.stringify(map.getZoom()));
```

- [ ] **Step 2: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "refactor: trip-map 使用共享常量替换硬编码 localStorage key"
```

---

### Task 4: 收藏页添加距离排序

**Files:**
- Modify: `app/travel/(subpages)/favourites/page.tsx`

**Interfaces:**
- Consumes: `haversineDistance`, `readMapCenter` from `@/app/travel/lib/calc-distance`

- [ ] **Step 1: 在 `filteredLocations` 基础上添加距离排序**

在 `favourites/page.tsx` 顶部添加 import（第 20 行 `filterLocations` import 之后）：

```typescript
import { haversineDistance, readMapCenter } from '../../lib/calc-distance';
```

在 `filteredLocations` 的 `useMemo`（第 32-35 行）**之后**，`Popup 状态` 注释（第 37 行）**之前**，插入排序逻辑：

```typescript
  // 按与地图中心的距离升序排列（先筛后排）
  const sortedByDistance = useMemo(() => {
    const center = readMapCenter();
    const lng = center[0];
    const lat = center[1];
    return [...filteredLocations].sort(
      (a, b) =>
        haversineDistance(lat, lng, a.latitude, a.longitude) -
        haversineDistance(lat, lng, b.latitude, b.longitude),
    );
  }, [filteredLocations]);
```

将 JSX 中 `filteredLocations.map(...)`（第 129 行）替换为 `sortedByDistance.map(...)`：

```diff
- {filteredLocations.map((location) => (
+ {sortedByDistance.map((location) => (
```

- [ ] **Step 2: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add "app/travel/(subpages)/favourites/page.tsx"
git commit -m "feat: 收藏列表按地图中心距离由近到远排序"
```

---

### Task 5: 格式化、检查与最终验证

**Files:**
- Verify: `app/travel/lib/calc-distance.ts`
- Verify: `app/travel/components/trip-map.tsx`
- Verify: `app/travel/(subpages)/favourites/page.tsx`
- Verify: `__tests__/travel/calc-distance.test.ts`

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```
Expected: 无 ESLint/Stylelint 错误

- [ ] **Step 2: 运行类型检查 + Lint**

```bash
npm run check
```
Expected: 无错误

- [ ] **Step 3: 运行全部测试**

```bash
npm run test
```
Expected: 所有测试通过，新增 10 个测试

- [ ] **Step 4: 最终提交（如有格式化变更）**

```bash
git add -A
git commit -m "chore: 格式化与最终验证"
```
如果 Step 1-2 无变更，跳过此步。
