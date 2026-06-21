# 旅行模块地图页 — 取消自动居中

**日期**: 2026-06-21
**状态**: 设计完成

## 背景

当前地图页在加载完成、获取到 GPS 后会自动执行两步操作：放置"我的位置"橙色标记 + 将地图中心移动到该位置。用户需求：进入地图时保留标记的自动放置，但不自动居中 —— 地图中心保持 localStorage 缓存的最后位置，仅当用户从右上角菜单手动选择"我的位置"时才居中。

## 设计

### 改动：trip-map.tsx 自动定位 useEffect

**文件**：`app/travel/components/trip-map.tsx`，第 129-145 行

**当前代码**：

```ts
useEffect(() => {
  if (!mapReady || routeMode) return;
  // ...
  getCurrentPosition()
    .then((pos) => {
      placeMyLocationMarker(pos);
      mapRef.current?.setCenter(pos);     // ← 移除
      mapRef.current?.setZoom(15);        // ← 移除
    })
    .catch(/* ... */);
}, [mapReady, routeMode]);
```

**改后**：移除 `setCenter(pos)` 和 `setZoom(15)` 两行，保留 `placeMyLocationMarker(pos)`。

### 行为对比

| 场景 | 改前 | 改后 |
|------|------|------|
| 进入地图 | 标记 + 居中 + zoom | 仅标记，中心保持上次位置 |
| 菜单"我的位置" | 标记 + 居中 + zoom | 不变 |
| 手动拖拽地图 | 保存中心到 localStorage | 不变 |
| GPS 不可用 | 标记不出现，地图保持默认中心 | 不变 |

### 不影响的部分

- `goToMyLocation()` ref 方法（仍会标记 + 居中 + zoom）
- `placeMyLocationMarker()` 共享函数
- `shell.tsx` → `page.tsx` 事件通信
- 路线模式（已跳过自动定位）
- localStorage 缓存逻辑
