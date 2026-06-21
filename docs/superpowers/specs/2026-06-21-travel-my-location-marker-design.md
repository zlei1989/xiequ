# 旅行模块地图页 — "我的位置"标记与定位

**日期**: 2026-06-21
**状态**: 实现完成

## 背景

地图页右上角菜单的"我的位置"动作已实现，但缺少地图上可见的橙色定位标记。用户 A 需求：**进入页面自动获取 GPS 并显示橙色"我的位置"标记**。

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
custom event → goToMyLocation() ──→ getCurrentPosition()
  travel:go-my-location              ↓
                                    placeMyLocationMarker (共享函数)
                                    ↓
                                   setCenter + setZoom(15)
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `types/amap.d.ts` | 补充 `Marker.setPosition`、`Geolocation.getCurrentPosition(cb)` 类型声明 |
| `marker-style.ts` | 新增 `createMyLocationMarkerIcon()`，复用 `NUMBERED_ICON_SIZE` |
| `trip-map.tsx` | 新增 `goToMyLocation()` ref + `placeMyLocationMarker` 共享函数 + 自动定位 useEffect + Toast 加载提示 |
| `page.tsx` | 监听 `travel:go-my-location` 自定义事件委托给 `goToMyLocation()` |
| `shell.tsx` | 菜单"我的位置"改为派发 `travel:go-my-location` 自定义事件 |
| `route-map-popup.tsx` | `useRef` 泛型同步 `goToMyLocation` 签名 |
| `amap.ts` | `getCurrentPosition` 改用回调模式 |

### marker-style.ts — 橙色定位图标

```ts
export function createMyLocationMarkerIcon() {
  const color = getAdmColor('--adm-color-warning', '#ff8f1f');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NUMBERED_ICON_SIZE}" height="${NUMBERED_ICON_SIZE}">
  <circle cx="14" cy="14" r="13" fill="${color}" opacity="0.3"/>
  <circle cx="14" cy="14" r="9" fill="${color}" stroke="white" stroke-width="2"/>
  <circle cx="14" cy="14" r="4" fill="white"/>
</svg>`;
  return {
    image: encodeSvgDataUrl(svg),
    size: [NUMBERED_ICON_SIZE, NUMBERED_ICON_SIZE] as [number, number],
    imageSize: [NUMBERED_ICON_SIZE, NUMBERED_ICON_SIZE] as [number, number],
  };
}
```

图标层次：半透明外圈 + 实心橙色中圈 + 白色中心点。尺寸与 `NUMBERED_ICON_SIZE` 一致，仅颜色不同。

### trip-map.tsx — 新增 goToMyLocation() ref 方法

**ref 类型**：

```ts
export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void; goToMyLocation: () => Promise<void> },
  { /* 现有 props 不变 */ }
>
```

**内部实现**：

- 新增 `myLocationMarkerRef = useRef<AMap.Marker | null>(null)`
- 提取共享函数 `placeMyLocationMarker(pos)`：已有 marker 则移动，否则创建
- `goToMyLocation` 实现：
  1. 若 AMap 未加载，提前返回
  2. `Toast.show({ icon: 'loading', content: '获取位置中…', duration: 0 })`
  3. `await getCurrentPosition()` 获取 `[lng, lat]`
  4. 调用 `placeMyLocationMarker(pos)` 创建/移动标记
  5. `map.setCenter(pos)` + `map.setZoom(15)`
  6. `handler.close()` 关闭 Toast
  7. error 时 `handler.close()` + `console.warn`（静默降级）
- **自动触发**：地图首次就绪时（`mapReady` 变为 true），effect 内调用相同逻辑完成首次定位
- 标记在 `useEffect` cleanup 中销毁
- 该标记完全独立于 MarkerEngine，不参与增量 diff

### 通信方式

shell.tsx 菜单点击 → 派发 `travel:go-my-location` 自定义事件 → page.tsx 监听 → 调用 `mapRef.current.goToMyLocation()`。

不使用 URL 参数，与 `travel:open-search` 模式一致，URL 不变。

### 与现有系统的关系

- **MarkerEngine**：不受影响，"我的位置"标记独立管理
- **路线模式**：不受影响，`goToMyLocation` 在 routeMode 下也能正常使用
- **主题跟随**：橙色使用 `getAdmColor('--adm-color-warning', …)`，自动跟随系统主题

### 错误处理

| 场景 | 处理 |
|------|------|
| GPS 不可用/用户拒绝 | handler.close() + console.warn，地图保持原状态 |
| AMap 未加载 | goToMyLocation 内 early return |
| 重复调用 | 第二次调用复用已有 marker，仅移动位置 |

## 实现中遇到的问题与解决方案

### 1. Turbopack dev 模式下 `AMap.event` 为 undefined

**问题**：`getCurrentPosition` 通过 `AMap.event.addListener(geolocation, 'complete', …)` 注册回调，但在 Turbopack dev 模式下 `AMap.event` 可能为 `undefined`，报 `TypeError: Cannot read properties of undefined (reading 'addListener')`。

**解决**：AMap v2 的 `Geolocation.getCurrentPosition` 支持直接传入回调函数 `getCurrentPosition((status, result) => {})`，无需通过 `AMap.event.addListener`。同步更新 `amap.d.ts` 类型声明。

### 2. 自动定位 useEffect 与 goToMyLocation 逻辑重复

**问题**：`useMapTheme` 之后的自动定位 useEffect 和 `useImperativeHandle` 中的 `goToMyLocation()` 包含相同的标记创建/移动逻辑（~15 行），存在维护风险。

**解决**：提取 `placeMyLocationMarker(pos: [number, number])` 内部函数，同时处理"创建新标记"和"移动已有标记"两种场景，两处调用方各缩减为一行。

### 3. Toast 全局污染风险

**问题**：最初使用 `Toast.show()` + `Toast.clear()` 管理加载提示，`Toast.clear()` 会关闭页面上所有 Toast 实例，可能影响其他组件。

**解决**：改用 `const handler = Toast.show({ … })` → `handler.close()` 模式，只关闭当前实例。

### 4. URL 参数方式触发不利于 SPA 体验

**问题**：最初设计通过 `router.replace('/travel?center=my-location')` 触发定位，会改变 URL。

**解决**：改用自定义事件 `travel:go-my-location`，与已有的 `travel:open-search` 模式一致。

## 组件依赖图

```
page.tsx
  └── TripMap (ref: goToMyLocation, setCenter)
        ├── amap.ts::getCurrentPosition()  (回调模式, 非 event 模式)
        ├── marker-style.ts::createMyLocationMarkerIcon()  (复用 NUMBERED_ICON_SIZE)
        ├── placeMyLocationMarker()  (共享函数, 消除重复)
        ├── Toast (handler.close() 局部关闭)
        ├── MarkerEngine (不变)
        └── AMap.Marker (myLocationMarker, 独立)
```
