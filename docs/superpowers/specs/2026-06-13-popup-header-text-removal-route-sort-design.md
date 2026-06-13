# 弹出层标题去文字 + 路线列表倒序排列

> 日期：2026-06-13 | 状态：设计完成

## 背景

两个独立的 UI 优化：

1. 所有弹出层（Popup/Drawer）的标题栏只显示箭头图标，去掉"返回"或"关闭"文字，界面更简洁
2. 路线列表按开始时间倒序排列，最新路线排在最前面

## 第一部分：弹出层标题去文字

### 范围

| 维度 | 说明 |
|------|------|
| 覆盖 | travel Popup 弹窗内 NavBar + watering Drawer 抽屉标题栏 |
| 排除 | 页面级"返回"按钮（`devices/[chipId]/page.tsx`）不在此次范围 |

### 接入清单（共 6 处）

| # | 文件 | 当前 | 改动 |
|---|------|------|------|
| 1 | `app/travel/components/route-map-popup.tsx:97` | `back="关闭"` | 删除 `back` 属性，保留箭头图标 |
| 2 | `app/watering/components/device-editor.tsx:492` | `<Button icon={...}>关闭</Button>` | 去掉 children "关闭"，只保留 `<Button icon={...} />` |
| 3 | `app/watering/components/device-editor.tsx:534` | 同上 | 同上 |
| 4 | `app/watering/components/device-editor.tsx:576` | 同上 | 同上 |
| 5 | `app/watering/components/device-editor.tsx:620` | 同上 | 同上 |
| 6 | `app/watering/components/voltage-config-drawer.tsx:68` | 同上 | 同上 |

### 说明

- **route-map-popup.tsx**：antd-mobile `NavBar` 的 `back` 属性不传值时默认显示 `<` 箭头，无文字，正是期望效果
- **device-editor.tsx / voltage-config-drawer.tsx**：antd `Drawer` 的 `extra` 区域 `Button` 只保留 `icon={<CloseOutlined />}`，去掉文字 children。点击行为不变（调用 `onClick` 关闭抽屉）
- 不改样式，不改交互逻辑

## 第二部分：路线列表按开始时间倒序

### 改动文件

`app/travel/lib/build-routes.ts` 的 `buildRoutes()` 函数，在返回 `routes` 前增加倒序排列。

### 实现

```ts
// 按开始时间倒序排列，最新的路线在前
routes.sort((a, b) => b.startDate.localeCompare(a.startDate));
```

### 影响范围

| 消费方 | 影响 |
|--------|------|
| `routes/page.tsx` 路线列表页 | 路线按最新优先展示 ✓ |
| `route-map-popup.tsx` | 不直接受影响（接收单条路线） |

### 边界情况

| 场景 | 处理 |
|------|------|
| 两条路线 startDate 相同 | `Array.sort` 在 V8 中是稳定排序，保持 `buildRoutes` 中原顺序 |
| 单条路线 | 无影响 |
| 数据中 `startDate` 格式一致性 | 项目中 `startDate` 为 `YYYY-MM-DD` 字符串，`localeCompare` 可正确比较 |

## 测试

- 两处改动均为纯展示层修改，不涉及业务逻辑变更
- 手工验证：启动 `npm run dev`，确认弹出层标题无文字、路线列表倒序
- 运行 `npm run format && npm run check` 确保无格式/类型错误

## 不做什么

- 不改 `lib/back-button.ts` 或其他 hook
- 不改页面级返回按钮
- 不新增测试用例（纯展示变更）
