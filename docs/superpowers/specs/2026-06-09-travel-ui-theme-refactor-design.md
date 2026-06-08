# Travel UI 主题化重构设计

## 目标

对 `app/travel` 目录下页面与组件做彻底的 antd-mobile 主题化重构。目标不是简单替换标签，而是建立一层简洁明确的 Travel UI 规范，让页面尽量由 antd-mobile 组件承载结构、状态和视觉表达。

本次允许顺手调整交互布局，使体验更贴近移动端 antd-mobile 范式；但不改变服务端 actions、hooks、数据结构和核心业务流。

## 范围

覆盖 `app/travel` 下的页面和组件：

- 地图页 `app/travel/page.tsx`
- 列表页 `app/travel/list/page.tsx`
- 壳组件 `app/travel/components/travel-shell.tsx`
- 查看、编辑、搜索、列表项、图片上传、瞬间表单等 travel 组件

不覆盖：

- `app/travel/actions.ts`
- `app/travel/services/*`
- `app/travel/hooks/*` 的业务逻辑
- 地图服务能力本身

## 设计原则

1. 最少使用普通 `div`，优先使用 antd-mobile 的 `List`、`Card`、`Grid`、`Space`、`Tag`、`Image`、`Footer`、`Form`、`ErrorBlock`、`SafeArea` 等组件。
2. 不新增自定义颜色、背景、字号、阴影、边框色。
3. 允许必要布局样式：`height`、`flex`、`overflow`、`padding`、`position`、`maxHeight`。
4. 状态、按钮、标签使用 antd-mobile 自带的 `color`、`fill`、`size` 等方案。
5. 命名简洁明确，避免过长组件名。
6. 页面继续作为业务状态中心，公共 UI 单元只负责展示和组合。

## 公共 UI 单元

在 `app/travel/components` 中收敛或新增以下简洁命名的公共单元：

| 名称 | 职责 |
|------|------|
| `Shell` | 承载顶部导航、底部 Tab、内容区、全局 ActionSheet 和概览入口 |
| `Stats` | 概览统计内容，供 `Dialog.show()` 使用 |
| `StatusTag` | 统一展示“已去 / 待去”状态，使用 antd-mobile `Tag` |
| `CoverImage` | 统一封面图、头像图和图片占位，优先使用 antd-mobile `Image` |
| `Section` | 标题 + 内容区域，基于 `Card`、`List` 或 `Divider` 组织 |
| `ActionBar` | Popup 底部操作按钮区，基于 `Footer`、`Space`、`Button` 组合 |

这些单元只封装 UI 结构，不直接调用 `useTravelContext`、`useMoments` 或服务端 actions。

## 页面层设计

`app/travel/page.tsx` 和 `app/travel/list/page.tsx` 继续作为状态中心，负责：

- 监听 `travel:open-search`
- 管理查看、编辑、瞬间编辑、搜索 Popup 的开关
- 调用 `add`、`update`、`remove`
- 调用 `useMoments(viewLocation?.id || "")`
- 渲染地图或列表，以及相关 Popup

页面层减少普通 `div`，但可保留必要布局容器。例如地图页仍需要一个容器保证地图高度和弹层定位。

## Shell 设计

现有 `travel-shell.tsx` 收敛为 `Shell`，负责全局框架：

- 顶部 `NavBar`
- 底部 `TabBar`
- 中间内容滚动区
- `ActionSheet`：概览、筛选、添加位置
- `Dialog.show()`：打开 `Stats`
- `SafeArea`：适配移动端安全区域

`Shell` 不再内联写统计卡片样式，概览内容拆到 `Stats`。

## Stats 设计

`Stats` 通过 props 接收 summary 数据：

- 已去数量
- 待去数量
- 总数
- 完成进度

结构使用 `Grid` 与 antd-mobile 展示组件组合，进度使用 `ProgressBar`。不写硬编码颜色和字号；如果需要强调，优先使用组件自带状态能力。

## 列表项设计

`location-list-item.tsx` 保留 `SwipeAction + List.Item`：

- `prefix` 使用 `CoverImage`
- 标题使用 `List.Item` 主内容
- 地址使用 `description`
- `extra` 使用 `StatusTag`
- 左滑操作继续提供“标记状态”和“删除”

删除原有自定义状态胶囊、硬编码背景、边框和字号。

## 查看 Popup 设计

`location-view-popup.tsx` 是重点改造对象：

- 顶部封面使用 `CoverImage`
- 基础信息使用 `List` / `List.Item`
- 状态使用 `StatusTag`
- 内容分组使用 `Section`
- 精彩瞬间使用 `Card` 或 `List` 组织
- 底部操作使用 `ActionBar`
- 空状态使用 `ErrorBlock status="empty"`
- 删除确认继续使用 `Dialog.confirm`

Popup 保留 `maxHeight: 90vh` 与必要 `overflow`，确保内容可滚动。

## 编辑与搜索 Popup 设计

`location-edit-popup.tsx`、`moment-edit-popup.tsx`、`search-popup.tsx` 保留现有方向：

- `Popup + Form + Input + TextArea`
- `Popup + SearchBar + List`
- 顶部保存动作使用 antd-mobile `Button`
- 错误提示使用 `Toast.show`
- 空态使用 `ErrorBlock`

只保留必要布局 padding 和滚动高度，不写视觉样式。

## 图片上传与瞬间表单设计

`upload-image.tsx` 优先使用 antd-mobile `Image`、`Button`、`Space` 表达上传入口、预览和删除动作。隐藏原生 file input 可以保留必要样式。

`moment-form.tsx` 如仍被使用，应把输入区和按钮改为 antd-mobile `Form`、`Input`、`TextArea`、`Button` 的组合，去掉自定义边框、字号和布局之外的视觉样式。

## 数据流

数据流保持不变：

```text
layout / Shell
  -> useLocations(filter)
  -> TravelContext.Provider
  -> page.tsx / list/page.tsx
  -> Popup components
```

查看某个位置时：

```text
viewLocation
  -> useMoments(viewLocation?.id || "")
  -> LocationViewPopup
  -> addMoment / updateMoment / removeMoment
```

添加位置时：

```text
Shell ActionSheet
  -> window.dispatchEvent(new CustomEvent("travel:open-search"))
  -> page.tsx 或 list/page.tsx 打开 SearchPopup
  -> add(data)
  -> 关闭 SearchPopup 并打开查看 Popup
```

## 交互设计

- 筛选继续通过 URL 参数生效，地图页和列表页共享筛选结果。
- 概览继续通过顶部菜单打开，但内容由 `Stats` 承载。
- 列表页保留 `PullToRefresh` 和 `SwipeAction`。
- 查看 Popup 内保留编辑位置、添加瞬间、编辑瞬间、删除瞬间、删除位置、切换状态等入口。
- 如已有图片预览能力则保留；如需要新增预览，优先使用 antd-mobile `ImageViewer`。

## 错误处理

- 保存失败：`Toast.show({ icon: "fail", content })`
- 搜索失败：`Toast.show({ icon: "fail", content })`
- 删除确认：`Dialog.confirm`
- 空列表或空瞬间：`ErrorBlock status="empty"`
- 加载中：`DotLoading` 或组件自带加载态

Popup 中保存失败后保持打开，方便用户修改后重试。

## 验收标准

1. `app/travel` 目录里的页面和组件整体由 antd-mobile 组件承载 UI。
2. 普通 `div` 明显减少，只用于必要布局或地图容器等无法替代的位置。
3. 不新增硬编码颜色、背景、字号、阴影、边框色。
4. 必要布局样式仅限高度、flex、overflow、padding、position、maxHeight 等。
5. 组件命名简洁明确：`Shell`、`Stats`、`StatusTag`、`CoverImage`、`Section`、`ActionBar`。
6. 地图页、列表页、Popup、筛选、搜索添加、编辑、删除、瞬间管理功能不回退。

## 验证计划

### 静态检查

在实现后检查 `app/travel`：

- `<div` 残留是否仅为必要布局或地图容器
- 是否还存在硬编码色值，例如 `#52c41a`、`#1677ff`、`#999`、`#f5f5f5`
- 是否还存在展示层 `fontSize`
- 是否还存在自定义 `background`、`boxShadow`、视觉边框色

### 功能回归

- 地图页 marker 点击打开查看 Popup
- 当前位置跳转仍能定位地图
- 列表页展示、空态、加载态、下拉刷新正常
- 列表项点击、左滑标记、左滑删除正常
- 搜索添加后关闭搜索并打开查看 Popup
- 查看 Popup 内编辑位置、删除位置、切换状态正常
- 添加、编辑、删除精彩瞬间正常
- 顶部菜单概览、筛选、添加位置正常
- 底部 Tab 切换保持筛选状态
