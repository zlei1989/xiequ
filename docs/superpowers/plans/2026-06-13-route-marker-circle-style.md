# 路线弹出层标注改为双圈 SVG 图标 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将路线弹出层地图标注从 label（HTML div 实心圆 + 数字）改为 SVG icon（双圈 + 数字），与地图 Tab 标注样式统一。

**Architecture:** 在 `marker-style.ts` 新增 `createNumberedMarkerIcon` 函数生成含数字的双圈 SVG 图标；`trip-map.tsx` 删除 `createLabelContent`，改用新函数以 `icon` + `offset` 替代 `label`。

**Tech Stack:** React + TypeScript，高德地图 JSAPI（AMap.Icon / AMap.Marker），vitest

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/travel/services/marker-style.ts` | 修改 | 新增 `createNumberedMarkerIcon`，与现有 `createMarkerIcon` 并列 |
| `app/travel/components/trip-map.tsx` | 修改 | 删除 `createLabelContent` + `getAdmColor` 导入，改用新函数 |
| `__tests__/travel/marker-style.test.ts` | 修改 | 新增 `createNumberedMarkerIcon` 测试用例 |

---

### Task 1: 新增 `createNumberedMarkerIcon` + 测试

**Files:**
- Modify: `app/travel/services/marker-style.ts`
- Modify: `__tests__/travel/marker-style.test.ts`

- [ ] **Step 1: 先写测试**

```ts
// 在 __tests__/travel/marker-style.test.ts 中追加以下 import 和 describe 块

import { createNumberedMarkerIcon } from '@/app/travel/services/marker-style';

describe('createNumberedMarkerIcon', () => {
  it('returns icon config with warning color for active marker', () => {
    const icon = createNumberedMarkerIcon(1, true);
    expect(icon.image).toContain('data:image/svg+xml');
    expect(icon.image).toContain('%23ffc107'); // warning fallback
    expect(icon.size).toEqual([28, 28]);
    expect(icon.imageSize).toEqual([28, 28]);
  });

  it('returns icon config with primary color for inactive marker', () => {
    const icon = createNumberedMarkerIcon(2, false);
    expect(icon.image).toContain('%231677ff'); // primary fallback
  });

  it('generates SVG with circle and text elements', () => {
    const icon = createNumberedMarkerIcon(5, false);
    const decoded = decodeURIComponent(
      icon.image.replace('data:image/svg+xml;charset=utf-8,', ''),
    );
    expect(decoded).toContain('<circle');
    expect(decoded).toContain('r="13"');
    expect(decoded).toContain('<text');
    expect(decoded).toContain('>5<');
  });

  it('encodes # in colors to %23', () => {
    const icon = createNumberedMarkerIcon(1, true);
    // 不应出现未编码的 #（data URL 中 # 是 fragment 分隔符）
    expect(icon.image).not.toMatch(/(?<!%23)#/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- __tests__/travel/marker-style.test.ts
```
Expected: `createNumberedMarkerIcon` 相关测试 FAIL（函数尚未定义或导出）。

- [ ] **Step 3: 实现 `createNumberedMarkerIcon`**

在 `app/travel/services/marker-style.ts` 中：

**新增常量**（在 `const ICON_SIZE = 24;` 之后）：

```ts
/** 带编号标注的图标尺寸 */
const NUMBERED_ICON_SIZE = 28;
```

**新增函数**（在 `createMarkerIcon` 之后，`export type MarkerStatus` 之前）：

```ts
/**
 * 创建带编号的路线标注图标配置
 *
 * 用于路线弹出层地图（routeMode），生成双圈圆形 SVG + 居中数字序号。
 * 颜色对齐 antd-mobile 语义色：激活态 warning 黄，非激活态 primary 蓝。
 *
 * @param num — 序号（1-based）
 * @param isActive — 是否为当前激活的标注
 * @returns 可用于 AMap.Icon 构造的配置对象
 */
export function createNumberedMarkerIcon(num: number, isActive: boolean) {
  const varName = isActive ? '--adm-color-warning' : '--adm-color-primary';
  const fallback = isActive ? '#ffc107' : '#1677ff';
  const color = getAdmColor(varName, fallback);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NUMBERED_ICON_SIZE}" height="${NUMBERED_ICON_SIZE}">
  <circle cx="14" cy="14" r="13" fill="${color}" stroke="white" stroke-width="2"/>
  <text x="14" y="14" text-anchor="middle" dominant-baseline="central" fill="white" font-size="12" font-weight="bold">${String(num)}</text>
</svg>`;
  return {
    image: `data:image/svg+xml;charset=utf-8,${svg.replace(/#/g, '%23')}`,
    size: [NUMBERED_ICON_SIZE, NUMBERED_ICON_SIZE] as [number, number],
    imageSize: [NUMBERED_ICON_SIZE, NUMBERED_ICON_SIZE] as [number, number],
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- __tests__/travel/marker-style.test.ts
```
Expected: 全部 8 个测试 PASS（原有 4 个 + 新增 4 个）。

- [ ] **Step 5: 提交**

```bash
git add app/travel/services/marker-style.ts __tests__/travel/marker-style.test.ts
git commit -m "feat: add createNumberedMarkerIcon for route marker SVG icons"
```

---

### Task 2: 更新 trip-map.tsx 使用新图标

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

- [ ] **Step 1: 更新导入**

删除 `getAdmColor` 导入（第 18 行），新增 `createNumberedMarkerIcon` 导入。

**改前**（第 18 行）：
```ts
import { getAdmColor } from '../services/marker-style';
```

**改后**：
```ts
import { createNumberedMarkerIcon } from '../services/marker-style';
```

- [ ] **Step 2: 删除 `createLabelContent`**

删除第 191–201 行的 `createLabelContent` 函数及其上方 JSDoc 注释（第 185–190 行）。

- [ ] **Step 3: 修改路线标注创建代码**

修改第 220–237 行的标注创建段落：

**改前**（第 220–237 行）：
```ts
        // 创建路线标注（带编号，图标样式参考地图页标注）
        if (routeMarkers && routeMarkers.length > 0) {
          let index = 0;
          for (const rm of routeMarkers) {
            const i = index++;
            const marker = new window.AMap.Marker({
              position: [rm.longitude, rm.latitude],
              title: rm.name,
              label: {
                content: createLabelContent(i + 1, rm.locationId, activeMarkerId),
                offset: new window.AMap.Pixel(-10, -10),
              },
            });
            marker.on('click', () => {
              onRouteMarkerClick?.(rm);
            });
            map.add(marker);
            routeMarkersRef.current.push(marker);
          }
        }
```

**改后**：
```ts
        // 创建路线标注（带编号的双圈 SVG 图标，与地图页标注样式统一）
        if (routeMarkers && routeMarkers.length > 0) {
          let index = 0;
          for (const rm of routeMarkers) {
            const i = index++;
            const isActive = rm.locationId === activeMarkerId;
            const marker = new window.AMap.Marker({
              position: [rm.longitude, rm.latitude],
              title: rm.name,
              icon: new window.AMap.Icon(createNumberedMarkerIcon(i + 1, isActive)),
              offset: new window.AMap.Pixel(-14, -14),
            });
            marker.on('click', () => {
              onRouteMarkerClick?.(rm);
            });
            map.add(marker);
            routeMarkersRef.current.push(marker);
          }
        }
```

- [ ] **Step 4: 运行格式化与检查**

```bash
npm run format
npm run check
```

修复所有错误后才进入下一步。

- [ ] **Step 5: 运行全部测试确认无回归**

```bash
npm run test
```
Expected: 全部测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "feat: use double-circle SVG icon for route markers, unify with map tab style"
```
