# 路线列表增强 + 驾车路线接入设计文档

**日期**：2026-06-13
**状态**：待实施
**依赖**：`docs/superpowers/specs/2026-06-13-travel-routes-design.md`（已实施的旅行路线）

---

## 概述

对已实施的旅行路线功能进行三项增强：
1. **列表项增加位置数**：描述文案从"X天 · 日期范围"改为"X天 · Y个位置 · 日期范围"
2. **连线改为驾车路线**：用高德地图 `AMap.Driving` API 的真实驾车路线替代当前的最短邻直线连线
3. **过滤短路线**：≤ 2 天的路线不展示

---

## 文件变更

### 修改

| 文件 | 变更 |
|------|------|
| `app/travel/types.ts` | `Route` 新增 `locationCount` 字段 |
| `app/travel/lib/build-routes.ts` | 移除 `buildPolyline`；polyline 固定 `[]`；过滤 `days <= 2` |
| `app/travel/components/route-list-item.tsx` | 描述增加位置数 |
| `app/travel/components/route-map-popup.tsx` | 集成 `useDrivingRoute` Hook |
| `app/travel/services/amap.ts` | `loadAmap` 的 plugins 增加 `AMap.Driving` |
| `__tests__/travel/build-routes.test.ts` | 移除 polyline 测试；新增过滤测试 |

### 新建

| 文件 | 职责 |
|------|------|
| `app/travel/hooks/use-driving-route.ts` | 封装 AMap.Driving 异步调用、分段、错误处理 |

---

## 数据流

```
buildRoutes (同步纯函数)
  → 过滤 days <= 2
  → polyline = []
  → routes[] (含 locationCount)

RouteMapPopup 打开 (visible=true)
  → useDrivingRoute(markers)
    → 分段（每段起点 + ≤ 16 途经点 + 终点）
    → 串行请求 AMap.Driving
    → 拼接 path[] 坐标数组
    → 返回 { path, loading, error }
  → 加载中：标注 + Spin
  → 成功：标注 + 驾车路线 polyline
  → 失败：标注（无连线）+ Toast "路线加载失败"
```

---

## 类型变更

`Route` 新增字段：

```ts
type Route = {
  // ... 现有字段不变
  /** 路线中去重后的位置数量 */
  locationCount: number;
};
```

---

## 算法细节

### buildRoutes 变更

1. **移除 `buildPolyline` 函数**，`polyline` 固定为 `[]`
2. **新增过滤**：`routes.filter(r => r.days > 2)`（≤ 2 天不展示）
3. **新增字段**：`locationCount = markers.length`

### useDrivingRoute 分段策略

输入 `RouteMarker[]`（时间顺序），输出 `{ path, loading, error }`。

AMap.Driving 途经点上限 16 个，单段最多 18 个点（起 + 16 + 终）。超出时分段：

```
markers = [A, B, ..., S, T, ..., Z]  (n 个，n > 18)

分段：段 1: A(起) → B…R(16途经) → S(终)
      段 2: S(起) → T…Z(途经) → Z(终)
      ...
```

**串行请求**：上一段 complete → 下一段 search。全部完成后拼接所有 path 坐标。

### 驾车路线结果提取

从 `DrivingResult.routes[0].steps` 提取每个 step 的 polyline path 坐标，拼接为单一 `[number, number][]`。

### 加载态与错误态

| 状态 | 地图显示 | 用户提示 |
|------|---------|---------|
| loading | 标注（无连线） | 地图上 Spin |
| success | 标注 + 驾车路线 | 无 |
| error/no_data | 标注（无连线） | `Toast.show({ icon: 'fail', content: '路线加载失败' })` |

**触发时机**：`visible=true` 才开始请求，避免无效 API 调用。

---

## 组件变更

### RouteListItem

描述从 `"3天 · 2024-01-01 至 2024-01-03"` 改为 `"3天 · 5个位置 · 2024-01-01 至 2024-01-03"`。

### RouteMapPopup

新增 `useDrivingRoute` Hook 调用：

```tsx
const { path, loading, error } = useDrivingRoute(route?.markers ?? [], visible);
```

- `visible=true` 触发请求
- loading 时 TripMap 只显示标注
- 成功后 `polylines=[{ path, color: '#1677ff' }]`
- 失败后 `Toast.show` + `polylines=[]`

### TripMap

**无需改动**。`polylines=[]` 时只显示标注，现有能力已支持。

---

## AMap 插件变更

`loadAmap` 的 plugins 数组增加 `AMap.Driving`。

---

## 测试

### buildRoutes 测试变更

- **移除**：polyline 最近邻排序相关测试
- **新增**：
  - `days <= 2` 的路线被过滤
  - `days > 2` 的路线正常保留
  - `locationCount` 等于 `markers.length`

### useDrivingRoute（如可行）

- 模拟 AMap.Driving mock 测试分段逻辑
- 若无 mock 能力，依赖集成测试
