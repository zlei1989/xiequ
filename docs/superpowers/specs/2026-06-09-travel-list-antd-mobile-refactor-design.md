# /travel/list 页面 antd-mobile 重构设计

## 目标

将 `/travel/list` 页面全面 antd-mobile 化，底部 Drawer 改为 Popup 浮层，拆分组件并引入移动端增强交互。

## 架构概览

```
app/travel/list/page.tsx          ← 列表页，管理所有 Popup 状态
│
├── LocationListItem (SwipeAction + List.Item)  ← 支持左滑操作
│
├── LocationViewPopup (Popup) ← 查看浮层
├── LocationEditPopup (Popup) ← 编辑位置浮层
├── MomentEditPopup (Popup)   ← 编辑瞬间浮层
└── SearchPopup (Popup)       ← 搜索浮层（替换 antd Modal）
```

`page.tsx` 作为状态中心，管理所有 Popup 的开关和联动。每个 Popup 通过 props 接收数据和回调，不持有业务状态。

## 组件设计

### LocationListItem

- `List.Item` + `SwipeAction`
- `prefix`: 圆形头像图片，加载失败时显示 `PictureWrongOutline` 图标占位
- 标题 + 地址副标题
- `extra`: 自定义状态胶囊（"已去"绿色 / "待去"蓝色）
- 点击整行 → 打开查看 Popup
- 左滑露出操作：标记状态切换、删除

### LocationViewPopup

- antd-mobile `Popup`, `position="bottom"`，圆角顶部
- 封面大图，加载失败时显示 `PictureWrongOutline` 图标占位
- 信息区用 `List` + `List.Item` 纵向排列（替换 antd `Descriptions`）
- 精彩瞬间时间线（自定义样式）
- 底部操作栏：删除 | 标记状态 | 编辑位置

### LocationEditPopup

- antd-mobile `Popup` + `Form` + `Input` + `TextArea`
- 字段：名称、地址、备注
- 顶部保存按钮

### MomentEditPopup

- antd-mobile `Popup` + `Form` + `Input` + `TextArea`
- 字段：日期、内容
- 支持新增和编辑两种模式

### SearchPopup

- antd-mobile `SearchBar` 搜索
- 结果列表用 `List`
- 替换 antd `Modal`

## 增强交互（方案 C）

- `PullToRefresh`: 下拉刷新位置列表
- `SwipeAction`: 列表项左滑快速操作
- `Toast`: 替换 antd `message`
- `Dialog.confirm`: 替换 antd `Popconfirm`
- `ErrorBlock` / `Empty`: 替换原生空态 DIV
- `DotLoading`: 加载指示（已在 layout 使用）

## 数据流

```
page.tsx (状态中心)
│
├── useTravelContext()           ← 共享：locations, loading, add/update/remove
│
├── states:
│   ├── viewLocation: Location | null    → LocationViewPopup
│   ├── editLocation: Location | null    → LocationEditPopup
│   ├── editMoment: { locationId, moment? } | null → MomentEditPopup
│   └── searchVisible: boolean           → SearchPopup
│
├── 联动：
│   ├── 列表项点击 → viewLocation → 查看 Popup
│   ├── 查看中点"编辑位置" → editLocation → 编辑 Popup
│   ├── 查看中点瞬间 → editMoment → 瞬间 Popup
│   ├── 列表下拉 → PullToRefresh → load()
│   ├── 左滑删除 → Dialog.confirm → remove()
│   └── 搜索添加 → SearchPopup → onAdd → 查看 Popup
│
└── 渲染：
    ├── PullToRefresh > List (列表)
    ├── LocationViewPopup
    ├── LocationEditPopup
    ├── MomentEditPopup
    └── SearchPopup
```

所有 CRUD 逻辑保持在 `useTravelContext` / `useMoments`，组件只通过 props 接收数据和回调。

## 错误处理

- 保存失败 → `Toast.show({ icon: 'fail', content: '...' })`
- 网络异常 → catch 后 Toast 提示，Popup 保持打开让用户重试
- 删除确认 → `Dialog.confirm`

## 文件结构

| 文件 | 说明 | 预估行数 |
|------|------|---------|
| `list/page.tsx` | 列表页，状态中心 | ~120 |
| `components/location-list-item.tsx` | 重写为 antd-mobile 样式 | ~50 |
| `components/location-view-popup.tsx` | 查看浮层 | ~150 |
| `components/location-edit-popup.tsx` | 编辑位置浮层 | ~80 |
| `components/moment-edit-popup.tsx` | 编辑瞬间浮层 | ~80 |
| `components/search-popup.tsx` | 搜索浮层 | ~70 |
| `components/location-drawer.tsx` | 移除 | — |

原 `location-drawer.tsx`（~375 行）拆分为 4 个文件，每个职责单一、<200 行。

## 测试

- **功能回归**：列表展示、搜索添加、查看、编辑位置、编辑瞬间、删除、标记状态切换
- **筛选联动**：ActionSheet "全部/已去/待去" 与列表过滤
- **交互验证**：PullToRefresh 刷新、SwipeAction 滑动、Popup 开关手势
- **文件结构**：拆分后各文件 <200 行，职责清晰
