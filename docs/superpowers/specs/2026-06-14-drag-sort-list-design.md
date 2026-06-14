# 拖动排序 — "功能"与"步骤"列表

**日期**: 2026-06-14  
**状态**: 设计已确认

## 目标

为浇水模块的设备配置表单中的两个列表添加拖拽排序能力：
- **功能列表**（`device-config-form.tsx`，ProcessConfig 数组）
- **步骤列表**（`process-config-picker.tsx`，StepConfig 数组）

## 交互方式

- **长按拖拽**（按住 300ms 后激活）
- 拖拽只改变本地状态中的数组顺序，最终点「保存」按钮时一并提交
- 与现有 SwipeAction（左滑删除）、列表滚动共存

## 技术方案

引入 `@dnd-kit` 系列（`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`），封装一个可复用的 `SortableList` 组件。

antd-mobile 的 `List`、`SwipeAction`、`List.Item` 全部保留，仅在每行外层包一层 `@dnd-kit` 的拖拽容器 `div`。

## 新增依赖

```
@dnd-kit/core        — 拖拽上下文、传感器、碰撞检测
@dnd-kit/sortable    — 排序逻辑、useSortable hook
@dnd-kit/utilities   — CSS.Transform 工具函数
```

三个包总 gzip ~15KB，仅前端 bundle 使用。

## 组件设计

### 新增：`app/watering/components/sortable-list.tsx`

封装 `@dnd-kit` 与 antd-mobile `List` 的集成。

**接口：**
- `items: T[]` — 数据数组
- `onReorder: (fromIndex: number, toIndex: number) => void` — 排序回调
- `renderItem: (item: T, index: number) => ReactNode` — 渲染每行内容（调用方自行包裹 SwipeAction + List.Item）
- `getKey?: (item: T, index: number) => string` — 获取唯一 key（可选，默认使用 index 转为字符串）
- `header?: string` — 透传给 `<List header>`

**内部行为：**
- 使用 `PointerSensor` 配置 `activationConstraint: { delay: 300, tolerance: 5 }` — 按住 300ms 且移动 < 5px 才激活拖拽
- `KeyboardSensor` 提供键盘无障碍支持
- `closestCenter` 碰撞检测
- `verticalListSortingStrategy` 排序策略
- 当 `items.length <= 1` 时，不附加拖拽 listeners（单项拖拽无意义）
- 拖拽激活期间为每行添加 `pointer-events: none`，防止 SwipeAction 响应

## 修改点

### `device-config-form.tsx`

"功能"列表区域（第 394-434 行）：
- 将 `List` + `{form.processes.map(...)}` 替换为 `<SortableList>`
- `SwipeAction` + `List.Item` 逻辑移入 `renderItem` 回调
- `onReorder` 调用 `arrayMove`（来自 `@dnd-kit/sortable`）更新 `form.processes`

### `process-config-picker.tsx`

"步骤"列表区域（第 119-154 行）：
- 同上改造
- `onReorder` 调用 `arrayMove` 更新 `draft.steps`，触发 `update({ steps: newSteps })`

### `package.json`

新增 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities` 三个依赖。

## 手势冲突模型

```
触摸开始 → 判断意图:
  ├─ 横向滑动 (Δx > 10px 且 |Δx| > |Δy|) → SwipeAction 激活
  ├─ 纵向长按 (Δy < 3px 持续 300ms) → 拖拽激活，SwipeAction 锁定
  ├─ 短按 (< 300ms 且 Δ < 5px) → List.Item onClick
  └─ 纵向快速滑动 → List 滚动
```

## 数据流

```
SortableList (onReorder)
  → fromIndex, toIndex
  → arrayMove(items, fromIndex, toIndex)
  → setForm / update 更新本地状态
  → 用户点「保存」
  → handleSave() → Server Action → SQLite 写入
```

排序只改变数组顺序，不修改任何对象内部字段。`bootExec` 和 `ScheduleConfig.process` 存储的是索引值，排序后索引自动跟随新位置。

## 边界与错误处理

| 场景 | 处理 |
|------|------|
| 拖拽松手到无效区域 | `@dnd-kit` 自动回弹，不触发 `onReorder` |
| 列表仅 1 项 | 不附加拖拽 listeners |
| 拖拽中切后台 | `onDragCancel` 重置状态，不修改数据 |
| 保存失败 | 复用现有 `Toast.show({ icon: 'fail' })` 逻辑 |

## 测试

新增 `__tests__/watering/components/sortable-list.test.tsx`：

| 用例 | 覆盖点 |
|------|--------|
| 渲染空列表 | `items=[]` → ErrorBlock empty |
| 渲染多行 | 3 条 → 每行文本可见 |
| 拖动排序 | `DragEnd` 事件 → `onReorder` 收到正确的 from/to 索引 |
| 单项不触发拖拽 | `items.length=1` → 行上无 drag listeners |
| 键盘排序 | KeyboardSensor 完整操作序列 |

## 文件清单

| 操作 | 文件 |
|------|------|
| 新增 | `app/watering/components/sortable-list.tsx` |
| 修改 | `app/watering/components/device-config-form.tsx` |
| 修改 | `app/watering/components/process-config-picker.tsx` |
| 新增 | `__tests__/watering/components/sortable-list.test.tsx` |
| 修改 | `package.json` |
