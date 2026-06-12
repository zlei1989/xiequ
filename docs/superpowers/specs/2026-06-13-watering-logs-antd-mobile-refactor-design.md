# 浇水日志页 antd-mobile 重构设计

**日期**: 2026-06-13
**状态**: 设计完成，待评审

## 目标

将 `app/watering/logs/[chipId]/page.tsx` 从 antd 桌面组件迁移到 antd-mobile，使其成为移动端友好的操作界面。

核心改动：
- 引入 `PullToRefresh` 下拉刷新
- 用 `NavBar` + `Space` + `Card` + `Steps` 构建垂直步骤卡片布局
- 消灭所有 antd 导入，消灭裸 `<div>` 布局，全部使用 antd-mobile 组件

## 组件架构

```
page.tsx
├── SafeArea
├── NavBar (返回 + 设备名 + 清空按钮)
└── PullToRefresh
    ├── DotLoading                  (loading && logs=[])
    ├── ErrorBlock status="empty"   (无日志)
    ├── ErrorBlock status="default" (加载失败)
    └── LogViewer                   (有日志)
         └── Space direction="vertical" block
              └── Card × N (每个 stateId 组)
                   ├── 组头: Space(align="center")
                   │    ├── stateId 文本
                   │    ├── Tag (已完成 | 异常)
                   │    └── 用时文本
                   └── Steps direction='vertical'
                        └── Step × M (每条事件)
                             ├── title: 事件名称
                             ├── status: finish | error | wait
                             └── description: 时间 + 格式化消息
```

### 文件变更范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/watering/logs/[chipId]/page.tsx` | 重写 | NavBar + PullToRefresh + 状态分发 |
| `app/watering/components/log-viewer.tsx` | 重写 | Steps + Card + Space 布局 |
| `app/watering/actions/get-logs.ts` | 不动 | 数据 API 不变 |
| `app/watering/actions/clear-logs.ts` | 不动 | 数据 API 不变 |
| `app/watering/hooks/use-device-logs.ts` | 不动 | hook 返回 {logs, loading, load, clear} 不变 |
| `app/watering/types.ts` | 不动 | LogItem 类型不变 |

## 数据流

```
PullToRefresh.onRefresh
        │
        ▼
useDeviceLogs.load()  ──reject──►  Toast.show("刷新失败")
        │
   ┌────┴────┐
   ▼         ▼         ▼
 成功      成功      失败 + logs=[]
   │         │         │
   ▼         ▼         ▼
logs>0   logs=[]   ErrorBlock
   │         │
   ▼         ▼
LogViewer  ErrorBlock
          status="empty"
```

### 清空流程

```
NavBar 右侧清空按钮
  → Dialog.confirm({ title: "确认清空日志？", content: "操作不可撤销" })
    → 确认 → clear()
      → 成功 → Toast.show("日志已清空") → load()
      → 失败 → Toast.show(error.message)
```

## 视觉设计

### 页面整体

```
┌──────────────────────────────────────────┐
│ ← 返回  设备: chip001            🗑 清空  │  NavBar
├──────────────────────────────────────────┤
│ ↕ 下拉刷新 (PullToRefresh)               │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ stateId: abc123      ✓ 已完成      │  │  Card
│  │ 用时 1分43秒                        │  │
│  │ ────────────────────────────────── │  │
│  │ ● 开机                             │  │  Steps
│  │ │  14:25:00 设备开机               │  │
│  │ ● 执行                             │  │
│  │ │  14:25:01 执行流程: 浇水          │  │
│  │ ● 完成                             │  │
│  │    14:32:05 完成流程               │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ stateId: def456      ✗ 异常        │  │  Card
│  │ 用时 1分30秒                        │  │
│  │ ────────────────────────────────── │  │
│  │ ● 开机                             │  │  Steps
│  │ │  14:20:00 设备开机               │  │
│  │ ● 执行                             │  │
│  │ │  14:20:01 执行流程: 施肥          │  │
│  │ ✗ 终止                             │  │
│  │    14:21:30 终止流程               │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 组件映射

| 视觉元素 | antd-mobile 组件 | 备注 |
|----------|-----------------|------|
| 页面安全区 | `SafeArea` | position='top' |
| 顶栏 | `NavBar` | back + right 清空按钮 |
| 下拉刷新 | `PullToRefresh` | onRefresh → load() |
| 外层垂直排列 | `Space direction="vertical" block` | 替代 div |
| 组卡片 | `Card` | 每 stateId 组一个 |
| 组头行 | `Space align="center"` | stateId + Tag + 用时 |
| 事件步骤 | `Steps direction='vertical'` | Card 内部 |
| 单条事件 | `Steps.Step` | title=事件名, description=时间+消息 |
| 事件标签 | `Tag fill="solid"` | 事件类型颜色标签 |
| 加载中 | `DotLoading` | 居中，PullToRefresh 内 |
| 空状态 | `ErrorBlock status="empty"` | "暂无日志" |
| 错误状态 | `ErrorBlock status="default"` | 错误信息 + 点击重试 |
| 确认弹窗 | `Dialog.confirm` | 清空确认 |
| 提示 | `Toast.show` | 成功/失败提示 |

### Step status 映射

**组级（Card 级别）**：

| 条件 | 组 status | 说明 |
|------|----------|------|
| 包含 finish/execute 且不含 offline/terminate | 已完成（绿色） | 流程正常结束 |
| 其他 | 异常（红色） | 流程异常中断或未完成 |

**事件级（Step 级别）**：

| 事件类型 | Step status |
|---------|-------------|
| bootstrap | `finish` |
| execute | `finish` |
| finish | `finish` |
| change | `finish` |
| heartbeat | `wait` |
| terminate | `error` |
| offline | `error` |

## 错误处理与边界

| 场景 | 处理 |
|------|------|
| 首次加载失败 | `ErrorBlock status="default"` + 错误描述 + 点击重试调用 `load()` |
| 下拉刷新失败 | PullToRefresh 结束动画 + `Toast.show("刷新失败")`，保留旧数据 |
| 清空失败 | `Toast.show(error.message)` |
| stateId 为空/undefined | 归入 `_unknown` 组 |
| 单条日志的组 | 正常渲染 1 个 Step，不显示用时 |
| chipId 不存在 | `load()` 返回空数组 → `ErrorBlock status="empty"` |
| 快速连续下拉 | `loading` 期间 PullToRefresh 自动忽略手势 |

## 保留的逻辑

以下逻辑从现有 `log-viewer.tsx` 完整保留，不修改：

- `groupByStateId()` — 按 stateId 分组，组内正序，组间按最新事件倒序
- `formatDuration()` — 计算组用时（<60s / <3600s / >3600s）
- `formatMessage()` — 格式化事件消息
- `eventLabels` / `eventColors` — 事件类型到中文名/颜色的映射

## 移除的依赖

| 移除 | 替代 |
|------|------|
| `antd` Button | `antd-mobile` NavBar right |
| `antd` Spin | `antd-mobile` DotLoading |
| `antd` Popconfirm | `antd-mobile` Dialog.confirm |
| `antd` message | `antd-mobile` Toast.show |
| `antd` Timeline | `antd-mobile` Steps direction='vertical' |
| `antd` Tag | `antd-mobile` Tag fill="solid" |
| `antd` Divider | 由 Card 边界自然分隔 |
| `@ant-design/icons` | antd-mobile 内置或内联 |
| 自定义 div 顶栏 | `antd-mobile` NavBar |

## 测试策略

### 单元测试（vitest + node）

| 用例 | 内容 |
|------|------|
| `groupByStateId` | 组间倒序、组内正序、空数组、缺失 stateId |
| `formatDuration` | <60s、60-3600s、>3600s、<2条返回空 |
| `formatMessage` | 每种事件类型、有 message 字段时优先 |
| `getGroupStatus` | 有 finish 无异常 = finish，其他 = error |
| `getStepStatus` | 7 种事件类型到 finish/error/wait 的映射 |

### 组件测试

| 组件 | 验证点 |
|------|--------|
| `LogViewer` | 空列表 → ErrorBlock；单组 → 1 Card + Steps；多组 → Space 分隔 |
| `page.tsx` | loading → DotLoading；error → ErrorBlock；正常 → LogViewer |
