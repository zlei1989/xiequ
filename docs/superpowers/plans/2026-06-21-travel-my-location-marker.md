# 旅行模块地图页 — "我的位置"标记与定位 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TripMap 新增 `goToMyLocation()` ref 方法，内部完成 GPS 获取 + 橙色标记显示 + 地图居中，进入页面自动触发。

**Architecture:** 定位逻辑封装在 TripMap 内部。新增 `myLocationMarkerRef` 独立管理"我的位置"标记，不参与 MarkerEngine 增量 diff。`page.tsx` 仅通过 ref 调用 `goToMyLocation()`。

**Tech Stack:** React forwardRef/useImperativeHandle, 高德地图 JSAPI v2, antd-mobile CSS 变量, vitest

---

### Task 1: 补充 AMap.Marker.setPosition 类型声明

**Files:**
- Modify: `app/travel/types/amap.d.ts:44-50`

- [ ] **Step 1: 在 AMap.Marker 类声明中新增 setPosition 方法**

`app/travel/types/amap.d.ts` 中 `AMap.Marker` 类目前缺少 `setPosition` 方法声明。在 `setIcon` 之后添加：

```ts
  /** 标记点 */
  class Marker {
    constructor(options: MarkerOptions);
    on(event: string, callback: () => void): void;
    setIcon(icon: Icon): void;
    setLabel(label: { content: string; offset: Pixel }): void;
    /** 更新标记点位置 */
    setPosition(position: [number, number]): void;
  }
```

- [ ] **Step 2: 运行类型检查确认无编译错误**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add app/travel/types/amap.d.ts
git commit -m "chore: 补充 AMap.Marker setPosition 类型声明"
```

---

### Task 2: 新增 createMyLocationMarkerIcon 图标函数

**Files:**
- Modify: `app/travel/services/marker-style.ts`
- Modify: `__tests__/travel/marker-style.test.ts`

- [ ] **Step 1: 在 marker-style.ts 中新增函数和常量**

在 `createNumberedMarkerIcon` 函数之后（文件末尾）添加：

```ts
/** "我的位置"定位标记图标尺寸 */
const MY_LOCATION_ICON_SIZE = 28;

/**
 * 创建"我的位置"橙色定位标记图标
 *
 * 使用 --adm-color-warning 色，三层圆形结构：
 * 半透明外圈（range）→ 实心橙色中圈 → 白色中心点，
 * 与普通位置标注（24px 蓝/绿单圈）有明显视觉区分。
 *
 * @returns 可用于 AMap.Icon 构造的配置对象
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

- [ ] **Step 2: 添加单元测试**

在 `__tests__/travel/marker-style.test.ts` 末尾（最后一个 `describe` 块之后）添加：

```ts
describe('createMyLocationMarkerIcon', () => {
  it('returns icon config with warning color', () => {
    const icon = createMyLocationMarkerIcon();
    expect(icon.image).toContain('data:image/svg+xml');
    expect(icon.image).toContain('%23ff8f1f'); // warning fallback
    expect(icon.size).toEqual([28, 28]);
    expect(icon.imageSize).toEqual([28, 28]);
  });

  it('generates SVG with three circle elements', () => {
    const icon = createMyLocationMarkerIcon();
    const decoded = decodeURIComponent(
      icon.image.replace('data:image/svg+xml;charset=utf-8,', ''),
    );
    // 应有 3 个 circle：外圈(r=13)、中圈(r=9)、内点(r=4)
    const circles = decoded.match(/<circle/g);
    expect(circles).toHaveLength(3);
    expect(decoded).toContain('r="13"');
    expect(decoded).toContain('r="9"');
    expect(decoded).toContain('r="4"');
  });

  it('encodes # in colors to %23', () => {
    const icon = createMyLocationMarkerIcon();
    expect(icon.image).not.toMatch(/(?<!%23)#/);
  });
});
```

- [ ] **Step 3: 更新测试文件顶部的 import 语句**

将 `__tests__/travel/marker-style.test.ts:3` 的 import 更新为：

```ts
import { createMarkerIcon, createMyLocationMarkerIcon, createNumberedMarkerIcon, getAdmColor } from '@/app/travel/services/marker-style';
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- __tests__/travel/marker-style.test.ts
```
Expected: 所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add app/travel/services/marker-style.ts __tests__/travel/marker-style.test.ts
git commit -m "feat: 新增 createMyLocationMarkerIcon 橙色定位标记图标"
```

---

### Task 3: TripMap 新增 goToMyLocation() ref 方法

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

- [ ] **Step 1: 更新 import 语句**

在 `trip-map.tsx` 顶部：

在 `import { createNumberedMarkerIcon } from '../services/marker-style';` 的 import 中追加 `createMyLocationMarkerIcon`：

```ts
import { createMyLocationMarkerIcon, createNumberedMarkerIcon } from '../services/marker-style';
```

在 amap 服务 import 后新增 `getCurrentPosition` 导入：

```ts
import { getCurrentPosition, loadAmap } from '../services/amap';
```

（当前 `loadAmap` 已存在于 import 中，只需追加 `getCurrentPosition`）

- [ ] **Step 2: 更新 forwardRef 泛型参数**

将第 23-24 行的 ref 类型从：

```ts
export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void },
```
改为：
```ts
export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void; goToMyLocation: () => Promise<void> },
```

- [ ] **Step 3: 新增 myLocationMarkerRef 声明**

在第 62 行 `polylinesRef` 声明之后添加：

```ts
/** "我的位置"橙色定位标记引用（独立于 MarkerEngine，不参与增量 diff） */
const myLocationMarkerRef = useRef<AMap.Marker | null>(null);
```

- [ ] **Step 4: 替换 useImperativeHandle 为包含 goToMyLocation 的版本**

替换第 75-82 行：

```ts
      useImperativeHandle(ref, () => ({
        setCenter(pos: [number, number]) {
          if (mapRef.current) {
            mapRef.current.setCenter(pos);
            mapRef.current.setZoom(15);
          }
        },
        /** 获取 GPS 位置 → 创建/移动橙色标记 → 地图居中 */
        async goToMyLocation() {
          // AMap SDK 未加载时直接返回
          if (!window.AMap) return;
          try {
            const pos = await getCurrentPosition();
            if (myLocationMarkerRef.current) {
              // 标记已存在：仅移动位置
              myLocationMarkerRef.current.setPosition(pos);
            } else if (mapRef.current) {
              // 首次定位：创建标记
              const iconConfig = createMyLocationMarkerIcon();
              const marker = new window.AMap.Marker({
                position: pos,
                title: '我的位置',
                icon: new window.AMap.Icon(iconConfig),
                offset: new window.AMap.Pixel(-14, -14),
              });
              mapRef.current.add(marker);
              myLocationMarkerRef.current = marker;
            }
            mapRef.current?.setCenter(pos);
            mapRef.current?.setZoom(15);
          } catch (err: unknown) {
            // WARN：GPS 不可用（用户拒绝或设备不支持），静默降级
            console.warn('[Travel] 获取当前位置失败', err);
          }
        },
      }));
```

- [ ] **Step 5: 新增 mapReady 后自动定位 useEffect**

在 `useMapTheme` 调用之后（第 72 行之后）、第一个 `useEffect`（地图初始化）之前添加：

```ts
      /** 地图首次就绪后自动获取 GPS 并显示"我的位置"标记 */
      useEffect(() => {
        if (!mapReady) return;
        // 通过 ref 暴露的 goToMyLocation 调用自身——用闭包引用
        // 此处不直接调用 goToMyLocation()（useImperativeHandle 未挂载），
        // 而是调用相同逻辑的内联版本
        if (!window.AMap) return;
        getCurrentPosition()
          .then((pos) => {
            if (!mapRef.current) return;
            const iconConfig = createMyLocationMarkerIcon();
            const marker = new window.AMap.Marker({
              position: pos,
              title: '我的位置',
              icon: new window.AMap.Icon(iconConfig),
              offset: new window.AMap.Pixel(-14, -14),
            });
            mapRef.current.add(marker);
            myLocationMarkerRef.current = marker;
            mapRef.current.setCenter(pos);
            mapRef.current.setZoom(15);
          })
          .catch((err: unknown) => {
            console.warn('[Travel] 获取当前位置失败', err);
          });
      }, [mapReady]);
```

- [ ] **Step 6: 在 cleanup 中销毁 myLocationMarker**

在地图初始化 useEffect 的 cleanup 函数中（第 145 行 `aborted = true;` 之后，第 148 行标注引擎清理之前）添加：

```ts
          // 清理"我的位置"标记
          if (myLocationMarkerRef.current && mapRef.current) {
            mapRef.current.remove(myLocationMarkerRef.current);
            myLocationMarkerRef.current = null;
          }
```

- [ ] **Step 7: 运行格式化和检查**

```bash
npm run format
npm run check
```
修复所有错误后再进入下一步。

- [ ] **Step 8: Commit**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "feat: TripMap 新增 goToMyLocation() ref 方法，地图首次就绪自动定位"
```

---

### Task 4: 简化 page.tsx 中的定位调用

**Files:**
- Modify: `app/travel/page.tsx`

- [ ] **Step 1: 移除 getCurrentPosition 导入**

将第 21 行的：

```ts
import { getCurrentPosition } from './services/amap';
```

移除（不再需要直接从 page.tsx 调用）。

- [ ] **Step 2: 简化 URL 参数?center=my-location 的 useEffect**

替换第 54-71 行的 useEffect 为：

```ts
  // 监听 "我的位置" 跳转（由 shell.tsx 菜单通过 URL 参数触发）
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('center') === 'my-location') {
      void mapRef.current?.goToMyLocation();
      // 清除 query 参数
      router.replace('/travel');
    }
  }, [router]);
```

- [ ] **Step 3: 运行格式化和检查**

```bash
npm run format
npm run check
```
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add app/travel/page.tsx
git commit -m "refactor: page.tsx 定位逻辑委托给 TripMap.goToMyLocation()"
```

---

### Task 5: 运行完整测试套件 + 验证

- [ ] **Step 1: 运行全部测试**

```bash
npm run test
```
Expected: 所有测试 PASS

- [ ] **Step 2: 运行类型检查**

```bash
npm run check
```
Expected: 无错误

- [ ] **Step 3: 验证构建**

```bash
npm run build
```
Expected: 构建成功

---

### 改动文件总览

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `app/travel/types/amap.d.ts` | 新增 1 行 | Marker.setPosition 类型声明 |
| `app/travel/services/marker-style.ts` | 新增 ~20 行 | createMyLocationMarkerIcon() |
| `__tests__/travel/marker-style.test.ts` | 新增 ~30 行 | 图标函数单元测试 |
| `app/travel/components/trip-map.tsx` | 新增/修改 ~40 行 | goToMyLocation() ref 方法 + 自动触发 + 标记管理 |
| `app/travel/page.tsx` | 删除/修改 ~15 行 | 简化为委托调用 |
| `app/travel/components/shell.tsx` | 无需改动 | 菜单项已存在 |
