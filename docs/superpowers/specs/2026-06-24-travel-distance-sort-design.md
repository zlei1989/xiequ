# 旅行模块 — 收藏列表按地图中心距离排序

**日期：** 2026-06-24
**范围：** `app/travel/lib/calc-distance.ts`、`app/travel/(subpages)/favourites/page.tsx`、`app/travel/components/trip-map.tsx`

## 目标

用户在地图页面移动时，地图中心坐标已记录到 localStorage。进入收藏列表时，收藏位置按与地图中心的距离由近到远排序。不显示具体距离数值。

## 方案

新增 Haversine 公式工具函数计算球面大圆距离。收藏页读取 localStorage 中的地图中心坐标，对过滤后的位置列表升序排列。无记录时回退到北京默认中心。

## 新增文件

### `app/travel/lib/calc-distance.ts`

```typescript
/** 地图中心坐标的 localStorage key */
export const MAP_CENTER_KEY = 'TRAVEL_MAP_CENTER';

/** 地图缩放级别的 localStorage key（仅地图组件使用，此处导出为保持 key 集中管理） */
export const MAP_ZOOM_KEY = 'TRAVEL_MAP_ZOOM';

/** 默认地图中心：北京 */
export const DEFAULT_CENTER: [number, number] = [116.397477, 39.908692];

/**
 * 使用 Haversine 公式计算两点间的大圆距离
 * @param lat1 - 点 1 纬度（度）
 * @param lng1 - 点 1 经度（度）
 * @param lat2 - 点 2 纬度（度）
 * @param lng2 - 点 2 经度（度）
 * @returns 距离，单位：千米（km），保留精确浮点数供排序使用
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
 * @returns 中心坐标 [lng, lat]，读取失败时返回默认中心
 */
export function readMapCenter(): [number, number] {
  try {
    const raw = localStorage.getItem(MAP_CENTER_KEY);
    if (!raw) return DEFAULT_CENTER;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'number' &&
      typeof parsed[1] === 'number'
    ) {
      return [parsed[0], parsed[1]];
    }
    return DEFAULT_CENTER;
  } catch {
    return DEFAULT_CENTER;
  }
}
```

关键设计决策：
- `readMapCenter()` 内置 JSON 解析和类型校验，防御损坏数据和非预期类型
- `try-catch` 包裹 `JSON.parse`，处理任意损坏数据
- Haversine 公式使用 `Math.atan2` 保证数值稳定性

## 修改文件

### `app/travel/components/trip-map.tsx`

将硬编码的 localStorage key 替换为共享常量：

```diff
- const centerStr = localStorage.getItem('TRAVEL_MAP_CENTER');
- const zoomStr = localStorage.getItem('TRAVEL_MAP_ZOOM');
+ import { MAP_CENTER_KEY, MAP_ZOOM_KEY, DEFAULT_CENTER } from '@/app/travel/lib/calc-distance';
+ const centerStr = localStorage.getItem(MAP_CENTER_KEY);
+ const zoomStr = localStorage.getItem(MAP_ZOOM_KEY);

- const center: [number, number] = centerStr
-   ? (JSON.parse(centerStr) as [number, number])
-   : [116.397477, 39.908692];
+ const center: [number, number] = centerStr
+   ? (JSON.parse(centerStr) as [number, number])
+   : DEFAULT_CENTER;
```

同理，`setItem` 调用中的 key 字符串替换为常量引用。

### `app/travel/(subpages)/favourites/page.tsx`

在客户端过滤和搜索之后，添加距离排序：

```typescript
import { haversineDistance, readMapCenter } from '@/app/travel/lib/calc-distance';

// 在组件内，filteredLocations 计算之后：
const sortedLocations = useMemo(() => {
  const center = readMapCenter();
  const lng = center[0];
  const lat = center[1];
  return [...filteredLocations].sort((a, b) =>
    haversineDistance(lat, lng, a.latitude, a.longitude) -
    haversineDistance(lat, lng, b.latitude, b.longitude),
  );
}, [filteredLocations]);
```

注意事项：
- 排序发生在搜索过滤**之后**（先筛后排，避免对不需要的位置计算距离）
- `readMapCenter()` 仅在客户端执行（`useMemo` 在浏览器端计算），满足 SSR 兼容
- 使用 `[...spread]` 创建新数组，保持不可变性

## 边界情况

| 场景 | 处理方式 |
|------|---------|
| localStorage 中无记录（首次使用） | `readMapCenter()` 返回北京默认中心，静默排序 |
| localStorage 数据被篡改/损坏 | `try-catch` + 类型校验，异常时回退默认中心 |
| 位置缺少经纬度字段 | TypeScript 类型系统编译期保证 `latitude`/`longitude` 为 `number` |
| 两个位置距离相同 | `sort` 稳定排序，保持原始相对顺序 |
| 用户清除浏览器数据 | 同"无记录"场景，回退默认中心 |

## 不影响的部分

- `app/travel/actions.ts` — 无需改动
- `app/travel/services/oss.ts` — 无需改动
- `app/travel/hooks/use-locations.ts` — 无需改动
- `app/travel/hooks/use-routes.ts` — 无需改动
- `app/travel/lib/build-routes.ts` — 无需改动
- `app/travel/lib/filter-locations.ts` — 无需改动
- `app/travel/page.tsx` — 无需改动
- `app/travel/(subpages)/routes/page.tsx` — 无需改动
- `app/travel/components/location-list-item.tsx` — 无需改动
- 所有测试文件 — 无需改动

## 测试要点

- [ ] `haversineDistance` 返回 0 当两点坐标相同
- [ ] `haversineDistance` 返回合理值（如北京到上海约 1060 km）
- [ ] `readMapCenter` 在 localStorage 为空时返回默认中心
- [ ] `readMapCenter` 在数据损坏时返回默认中心（不抛异常）
- [ ] `readMapCenter` 在类型不匹配时返回默认中心（如存了字符串）
- [ ] 收藏列表按距离升序排列（最近的在最上面）
- [ ] 搜索结果也按距离排序（先筛后排）
- [ ] 地图页 localStorage key 与收藏页读取的 key 一致（共享常量）
