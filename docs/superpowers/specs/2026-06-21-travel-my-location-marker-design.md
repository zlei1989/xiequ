# 旅行模块地图页 — "我的位置"标记与定位

**日期**: 2026-06-21
**状态**: 设计完成

## 背景

地图页右上角菜单的"我的位置"动作已实现（`shell.tsx` 通过 URL 参数触发 `page.tsx` 中 useEffect 调用 `getCurrentPosition` → `setCenter`），但缺少地图上可见的橙色定位标记。用户 A 需求：**进入页面自动获取 GPS 并显示橙色"我的位置"标记**。

## 设计

### 架构：定位逻辑封装在 TripMap 内部

TripMap 新增 `goToMyLocation()` ref 方法，内部完成三件事：

1. 调用 `getCurrentPosition()` 获取 GPS 坐标
2. 在地图上创建/更新橙色"我的位置"标记
3. 将地图中心移动到该坐标 + setZoom(15)

父组件 `page.tsx` 仅需调用 `mapRef.current.goToMyLocation()`。

```
page.tsx                          TripMap (ref)
────────                          ──────────────
useEffect → goToMyLocation()  ──→ getCurrentPosition()
                                   ↓
url ?center=my-location →      ──→ 创建/更新 Marker (独立于 MarkerEngine)
                                   ↓
                                  setCenter + setZoom(15)
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `marker-style.ts` | 新增 `createMyLocationMarkerIcon()` |
| `trip-map.tsx` | 新增 `goToMyLocation()` ref 方法 + myLocation marker 管理 |
| `page.tsx` | 简化：useEffect + URL 监听都改为调 `goToMyLocation()` |
| `shell.tsx` | 无需改动 |

### marker-style.ts — 橙色定位图标

```ts
const MY_LOCATION_ICON_SIZE = 28;

/**
 * 创建"我的位置"橙色定位标记图标
 * 使用 --adm-color-warning（#ff8f1f），圆形外圈 + 中心实心圆 + 白色内点
 */
export function createMyLocationMarkerIcon() {
  const color = getAdmColor('--adm-color-warning', '#ff8f1f');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MY_LOCATION_ICON_SIZE}" height="${MY_LOCATION_ICON_SIZE}">
  <circle cx="14" cy="14" r="13" fill="${color}" opacity="0.3"/>
  <circle cx="14" cy="14" r="9" fill="${color}" stroke="white" stroke-width="2"/>
  <circle cx="14" cy="14" r="4" fill="white"/>
</svg>`;
  return {
    image: encodeSvgDataUrl(svg),
    size: [MY_LOCATION_ICON_SIZE, MY_LOCATION_ICON_SIZE] as [number, number],
    imageSize: [MY_LOCATION_ICON_SIZE, MY_LOCATION_ICON_SIZE] as [number, number],
  };
}
```

图标层次：半透明外圈（指示精度范围）+ 实心橙色中圈 + 白色中心点。与现有的绿色/蓝色圆形标记（24px）有区分度（28px + 不同形状）。

### trip-map.tsx — 新增 goToMyLocation() ref 方法

**新增 props**：

```ts
export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void; goToMyLocation: () => Promise<void> },
  { /* 现有 props 不变 */ }
>
```

**内部实现**：

- 新增 `myLocationMarkerRef = useRef<AMap.Marker | null>(null)`
- `goToMyLocation` 实现：
  1. 若 AMap 未加载，提前返回
  2. `await getCurrentPosition()` 获取 `[lng, lat]`
  3. 若已有 marker：调用 `marker.setPosition()` 移动
  4. 若没有 marker：创建新 `AMap.Marker`（icon 使用 `createMyLocationMarkerIcon()`），`map.add()`
  5. `map.setCenter([lng, lat])` + `map.setZoom(15)`
  6. error 时 console.warn（不做 UI 提示，静默降级）
- **自动触发**：地图首次就绪时（`mapReady` 变为 true），内部自动调用 `goToMyLocation()` — 确保页面加载即看到"我的位置"
- 标记在 `useEffect` cleanup 中销毁
- 该标记完全独立于 MarkerEngine，不参与增量 diff

### page.tsx — 简化调用

- **进入页面时自动定位**：由 TripMap 内部在 mapReady 后自动触发，page.tsx 无需额外处理
- URL 参数 `?center=my-location` 的 useEffect：改为 `mapRef.current?.goToMyLocation()`（移除当前页面中的 `getCurrentPosition` 导入和坐标处理逻辑）

### 错误处理

| 场景 | 处理 |
|------|------|
| GPS 不可用/用户拒绝 | console.warn，地图保持原状态，不显示标记 |
| AMap 未加载 | goToMyLocation 内 early return |
| 重复调用 | 第二次调用复用已有 marker，仅移动位置 |

### 与现有系统的关系

- **MarkerEngine**：不受影响，"我的位置"标记独立管理
- **路线模式**：不受影响，`goToMyLocation` 在 routeMode 下也能正常使用
- **主题跟随**：橙色使用 `getAdmColor('--adm-color-warning', …)`，自动跟随系统主题

## 组件依赖图

```
page.tsx
  └── TripMap (ref: goToMyLocation)
        ├── amap.ts::getCurrentPosition()
        ├── marker-style.ts::createMyLocationMarkerIcon()
        ├── MarkerEngine (不变)
        └── AMap.Marker (myLocationMarker, 独立)
```
