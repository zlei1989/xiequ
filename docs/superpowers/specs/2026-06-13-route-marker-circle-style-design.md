# 路线弹出层标注改为双圈 SVG 图标

**日期**: 2026-06-13  
**状态**: 已设计

## 背景

路线弹出层地图中的标注点当前用 `label`（HTML div）渲染 —— 实心圆 + 数字序号，与地图 Tab 的双圈 SVG 图标样式不一致。

## 目标

将路线标注改为与地图 Tab 统一的"双圈"圆形 SVG 图标，同时保留数字序号。

## 方案

合并到 SVG icon：生成含数字的 SVG data URL，作为 `AMap.Icon` 传入，不再使用 `label`。

### 视觉规格

| 属性 | 值 |
|------|-----|
| 画布 | 28×28 |
| 外圈 | 半径 13，填充色 + 2px 白色描边 |
| 文字 | 白色数字，字号 12，加粗，居中 |
| 颜色 | 激活态 `--adm-color-warning`（回退 `#ffc107`）|
|  | 非激活态 `--adm-color-primary`（回退 `#1677ff`）|

### 改动文件

**1. `app/travel/services/marker-style.ts`**

新增 `createNumberedMarkerIcon(num: number, isActive: boolean)` 函数。

- 与现有 `createMarkerIcon` 类似，读 CSS 变量取色
- 生成包含数字的 SVG data URL，直接返回可用于 `AMap.Icon` 的配置对象
- 画布 28×28，外圈半径 13

**2. `app/travel/components/trip-map.tsx`**

- 删除 `createLabelContent` 函数及其 `getAdmColor` 导入
- 导入 `createNumberedMarkerIcon`
- routeMode 下：`icon: new AMap.Icon(createNumberedMarkerIcon(...))` + `offset: new AMap.Pixel(-14, -14)` 替代原来的 `label`

## 影响范围

- 仅影响路线弹出层（`routeMode`）标注样式
- 地图 Tab 标注（`marker-engine.ts`）不受影响
- `AMap.d.ts` 类型无需变动
