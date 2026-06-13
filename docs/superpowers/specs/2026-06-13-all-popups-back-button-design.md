# 所有弹出层接入返回键拦截

> 日期：2026-06-13 | 状态：设计完成

## 背景

`lib/back-button.ts` 的 `useBackButton` hook 已在 4 个 travel 弹窗中验证可用。现将其扩展到项目中所有弹出层，包括 antd-mobile `Popup` 和 antd `Drawer`。

## 范围

| 维度 | 说明 |
|------|------|
| 覆盖组件 | 全部 antd-mobile `Popup` 和 antd `Drawer`（共 9 个接入点） |
| 嵌套行为 | 全局栈式 LIFO：最后打开的弹窗最先被返回键关闭 |
| 接入方式 | 已有 `useBackButton(visible, onClose)` hook，纯增量接入 |
| 暂不覆盖 | `Dialog.confirm/show` 命令式弹窗（原生浏览器弹窗风格） |

## 架构

无架构变更。`lib/back-button.ts` 中的全局栈 + `useBackButton` hook 保持不变。

```
现有全局栈（不改动）
┌──────────────────────────┐
│  Interrupt Drawer (最顶层) │
│  Step Drawer              │
│  Process Drawer           │
│  RouteMapPopup            │
│  SearchPopup (底层)        │
└──────────────────────────┘
   ↑ push / pop（LIFO）

popstate 监听器（全局唯一）
  → 取栈顶 onCloseRef.current() 执行
  → pushState 占位，阻止页面跳转
  → 栈空时清理监听器
```

## 接入清单

每个接入点只需 2 行代码（import + hook 调用）：

### travel 模块（2 个接入点）

| # | 文件 | 改动 | visible 表达式 |
|---|------|------|---------------|
| 1 | `route-map-popup.tsx` | `useBackButton(visible, onClose)` | `visible` prop |
| 2 | `route-map-popup.tsx` | `useBackButton(showEntryList, () => setShowEntryList(false))` | `showEntryList` state |

**注意**：[RouteMapPopup](app/travel/components/route-map-popup.tsx) 内的子级弹窗（`LocationViewPopup`、`LocationEditPopup`、`MomentEditPopup`）已在各自组件内部接入 `useBackButton`，当 RouteMapPopup 处于打开状态时，这些子级弹窗打开后自动进入全局栈，形成完整嵌套链。返回键关闭顺序：子级弹窗 → EntryList → RouteMapPopup → 页面。

### watering debug 模块（2 个接入点）

| # | 文件 | 改动 | visible 表达式 |
|---|------|------|---------------|
| 3 | `event-buttons.tsx` | `useBackButton(popupType === 'bootstrap', closePopup)` | 表达式 |
| 4 | `event-buttons.tsx` | `useBackButton(popupType === 'change', closePopup)` | 表达式 |

**注意**：两个 Popup 互斥（`popupType` 为单值 `'bootstrap' | 'change' | null`），用表达式作为 visible 参数，`popupType` 切换时自动完成旧弹窗注销、新弹窗注册。

### watering Drawer 模块（5 个接入点）

| # | 文件 | 改动 | visible 表达式 |
|---|------|------|---------------|
| 5 | `device-editor.tsx` | `useBackButton(processVisible, () => setProcessVisible(false))` | `processVisible` |
| 6 | `device-editor.tsx` | `useBackButton(stepVisible, () => setStepVisible(false))` | `stepVisible` |
| 7 | `device-editor.tsx` | `useBackButton(interruptVisible, () => setInterruptVisible(false))` | `interruptVisible` |
| 8 | `device-editor.tsx` | `useBackButton(scheduleVisible, () => setScheduleVisible(false))` | `scheduleVisible` |
| 9 | `voltage-config-drawer.tsx` | `useBackButton(open, onClose)` | `open` prop |

**注意**：antd `Drawer` 使用 `open` 属性而非 `visible`，传值方式相同。4 层嵌套 Drawer（Process → Step → Interrupt）的 LIFO 顺序由全局栈自然保证。`schedule` 和 `voltage` 虽然是独立入口，若与 Process 链同时打开，最后打开者优先关闭——这也是预期行为。

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| antd Drawer 用 `open` 而非 `visible` | hook 参数名是 `visible`，传 `open` 值即可，语义完全相同 |
| `event-buttons.tsx` 两个 Popup 互斥 | 用表达式作为 visible，切换时 React 自动触发旧 effect cleanup + 新 effect 执行，对应注销旧弹窗 + 注册新弹窗 |
| RouteMapPopup 内外层嵌套 | 外层注册后，内层子组件（已接入）自动在栈中置于外层之上，LIFO 顺序正确 |
| DeviceEditor schedule 和 process 同时打开 | 全局 LIFO：后打开的先用返回键关闭，无论属于哪条编辑链 |
| 快速连按返回键 | 现有 hook 已处理：第一次 popstate 后重新 pushState，第二次才触发下一层 |

## 测试

现有 `__tests__/lib/back-button.test.ts` 8 个用例已覆盖核心逻辑（单层注册/嵌套 LIFO/卸载清理/闭包刷新/SSR 安全）。本次为纯增量接入，不改变 hook 实现，无需新增用例。

## 不做什么

- 不改 `lib/back-button.ts` 的 hook 实现
- 不覆盖 `Dialog.confirm/show` 命令式弹窗
- 不做真机兼容性自动化测试（手工验证）
