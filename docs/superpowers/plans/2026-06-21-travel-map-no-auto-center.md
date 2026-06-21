# 地图页取消自动居中 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除地图加载后的自动居中行为，保留"我的位置"标记自动放置

**Architecture:** 在 `trip-map.tsx` 的自动定位 useEffect 中删除 `setCenter` 和 `setZoom` 调用，标记放置逻辑不变

**Tech Stack:** React + TypeScript + 高德地图 AMap

---

### Task 1: 移除自动居中逻辑

**Files:**
- Modify: `app/travel/components/trip-map.tsx:129-145`

- [ ] **Step 1: 移除 setCenter 和 setZoom，更新注释**

将自动定位 useEffect 中的两行居中代码移除，并更新注释以反映仅放置标记的行为。

**改前**（第 129-145 行）：
```tsx
      /** 地图首次就绪后自动获取 GPS 并显示"我的位置"标记（非路线模式） */
      useEffect(() => {
        if (!mapReady || routeMode) return;
        // 此处不通过 ref 调用 goToMyLocation（useImperativeHandle 已挂载但父组件尚未拿到 ref），
        // 直接内联相同逻辑完成首次自动定位
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!window.AMap) return;
        getCurrentPosition()
          .then((pos) => {
            placeMyLocationMarker(pos);
            mapRef.current?.setCenter(pos);
            mapRef.current?.setZoom(15);
          })
          .catch((err: unknown) => {
            console.warn('[Travel] 获取当前位置失败', err);
          });
      }, [mapReady, routeMode]);
```

**改后**：
```tsx
      /** 地图首次就绪后自动获取 GPS 并放置"我的位置"标记，不移动地图中心（非路线模式） */
      useEffect(() => {
        if (!mapReady || routeMode) return;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!window.AMap) return;
        getCurrentPosition()
          .then((pos) => {
            placeMyLocationMarker(pos);
          })
          .catch((err: unknown) => {
            console.warn('[Travel] 获取当前位置失败', err);
          });
      }, [mapReady, routeMode]);
```

- [ ] **Step 2: 执行格式化与检查**

```bash
npm run format
```
```bash
npm run check
```

预期：无错误

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "fix: 移除地图加载后自动居中，仅保留标记自动放置"
```
