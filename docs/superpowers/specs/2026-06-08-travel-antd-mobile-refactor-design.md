# Travel 页面 antd-mobile 重构设计

## 目标

将 `app/travel` 页面从 antd 组件库迁移到 antd-mobile，去掉侧边抽屉，改为顶部 NavBar + 底部 TabBar 结构，概览统计信息收入 Dialog 弹窗。

## 组件树

```
layout.tsx
└─ Suspense
   └─ TravelLayoutInner          ← useLocations(filter) + TravelContext.Provider
      └─ TravelShell             ← 新组件，封装壳逻辑
         ├─ NavBar               ← antd-mobile NavBar，右侧 ⋯ → ActionSheet
         ├─ 内容区 {children}     ← flex:1，page.tsx 和 list/page.tsx
         ├─ TabBar               ← antd-mobile TabBar，地图/收藏
         ├─ ActionSheet          ← antd-mobile ActionSheet，概览/筛选/添加
         └─ Dialog               ← antd-mobile Dialog.show()，概览统计
```

## 组件映射

| UI 区域 | antd-mobile 组件 | 说明 |
|---------|-----------------|------|
| 顶部导航 | `<NavBar>` | `right` 插槽放 ⋯ 图标，点击打开 ActionSheet |
| 底部导航 | `<TabBar>` + `<TabBar.Item>` | 两个 tab：地图(`/travel`)、收藏(`/travel/list`) |
| ⋯ 菜单 | `<ActionSheet>` | `actions` 数组：概览、显示全部、筛选已去、筛选待去、添加位置 |
| 概览弹窗 | `Dialog.show()` | 命令式调用，content 中放置统计卡片 + `<ProgressBar>` |
| 进度条 | `<ProgressBar>` | `percent` 绑定 `summary.checkedPercentage` |

## 文件变更

| 文件 | 变更 |
|------|------|
| `app/travel/components/travel-shell.tsx` | 🆕 新建：NavBar + TabBar + ActionSheet + OverviewDialog 壳组件 |
| `app/travel/layout.tsx` | 🔧 重写：去掉 antd Layout/Header/Dropdown/NavDrawer，引入 TravelShell |
| `app/travel/page.tsx` | 🔧 简化：去掉 `calc(100vh - 48px)` 高度计算，由 TravelShell 的 flex 布局接管 |
| `app/travel/list/page.tsx` | ✅ 基本不变 |
| `app/travel/components/nav-drawer.tsx` | 🗑 删除 |

## TravelShell 组件设计

### Props

```ts
{ children: ReactNode }
```

### 内部状态

- `actionVisible: boolean` — 控制 ActionSheet 显隐

### 核心逻辑

1. **TabBar 路由**：通过 `usePathname()` 获取当前路径，`activeKey` 绑定路径，`onChange` 调用 `router.push(key)`
2. **ActionSheet 筛选**：选择筛选条件后 `router.replace(pathname + "?filter=xxx")`，全局生效。选择"概览"调用 `showOverview()`。选择"添加位置"派发 `travel:open-search` 事件
3. **概览 Dialog**：`Dialog.show()` 命令式调用，content 渲染统计卡片（已去/待去/总计数字 + ProgressBar）
4. **布局**：`display:flex; flex-direction:column; height:100vh` — NavBar 顶部固定，TabBar 底部固定，中间 `flex:1; overflow:auto` 放 children

### 概览 Dialog 内容结构

```
Dialog.show({
  title: '概览',
  content: (
    <div>
      <div style={{display:'flex', gap:12}}>
        <div>已去: {summary.checkedCount}</div>
        <div>待去: {summary.uncheckCount}</div>
        <div>总计: {summary.count}</div>
      </div>
      <ProgressBar percent={summary.checkedPercentage} />
    </div>
  ),
  closeOnAction: true,
})
```

## 数据流

### 筛选 → URL → 全局生效

```
ActionSheet 选择筛选
  → router.replace(pathname + "?filter=checked|uncheck|all")
  → layout.tsx 读取 searchParams.filter
  → useLocations(filter) 过滤数据
  → 地图/收藏 tab 共享同一筛选状态
```

### 概览 → TravelContext

```
Dialog 通过 useTravelContext() 读取 summary
  → checkedCount / uncheckCount / count / checkedPercentage
  → ProgressBar percent 绑定 checkedPercentage
```

### 添加位置 → CustomEvent

```
保持现有机制：ActionSheet "添加位置"
  → window.dispatchEvent(new CustomEvent("travel:open-search"))
  → page.tsx / list/page.tsx 各自监听并打开 SearchDialog
```

## layout.tsx 变更

- **去掉**：antd `Layout`, `Header`, `Content`, `Dropdown`, `Button`, ant-design icons
- **去掉**：`NavDrawer` 组件引用
- **去掉**：`navDrawerOpen` 状态、`dropdownItems`、`onDropdownClick`
- **新增**：引入 `TravelShell`，用 `<TravelShell>{children}</TravelShell>` 替代原有 Layout 结构
- **保留**：`Suspense` 边界、`TravelContext.Provider`、`useLocations(filter)` 数据层

## page.tsx 变更

- **去掉**：`style={{ height: "calc(100vh - 48px)" }}` — 不再需要，TravelShell 的 flex 布局自动分配空间
- **其他**：TripMap、LocationDrawer、SearchDialog 逻辑保持不变

## 边界情况

- **空数据**：概览 Dialog 中所有计数为 0，ProgressBar 显示 0%
- **加载中**：summary 基于已加载数据计算，loading 状态不影响统计
- **筛选切换 tab**：切 tab 时通过 URL 保持筛选状态，不需额外同步
