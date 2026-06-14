# Popup 蒙层关闭统一 + NavBar 返回键 URL 栈修复

> 日期：2026-06-14 | 状态：设计完成

## 背景

两个问题需要修复：

1. **蒙层关闭缺失**：travel 模块的 Popup 均已支持点击蒙层关闭（`closeOnMaskClick` + `onMaskClick`），但 watering 模块的 5 个 Picker 型 Popup 缺少这两个属性，点击蒙层无法关闭弹窗。

2. **NavBar 返回键产生多余 URL 栈**：`lib/back-button.ts` 的 `useBackButton` 在弹窗打开时通过 `history.pushState()` 注入占位状态。系统返回键触发 `popstate` → `handlePopstate` 消费占位后重新注入（平衡）；但 NavBar 的 `onBack` 直接调用 `onClose`，`popstate` 未触发，占位状态残留在浏览器 history 中。

## 范围

| 维度 | 说明 |
|------|------|
| 蒙层关闭 | watering 模块 5 个 `*-picker.tsx` 文件，各 +2 行属性 |
| URL 栈修复 | `lib/back-button.ts` effect cleanup 逻辑，约 +8 行 |
| 调用方 | 零改动 — 修复封装在 hook 内部，所有 Popup 自动受益 |

## 架构分析

### 现有机制（lib/back-button.ts）

```
handlePopstate 中的关键顺序（当前代码第 48-53 行）:
  ① top.onCloseRef.current = null   ← 先置空（防止快速连按重复调用）
  ② close()                          ← 再调 onClose（触发 React state 更新）

effect cleanup 中（当前代码第 109-119 行）:
  ① 从栈中移除 entry
  ② 若栈空，移除 popstate 监听器
```

### 系统返回键 vs NavBar 返回键 — 差异

```
系统返回键:
  ① popstate 触发 → handlePopstate: onCloseRef.current = null → close()
  ② close() → visible 变 false → cleanup runs
  ③ handlePopstate 继续: pushPlaceholder() 重新注入（抵消 pop）
  结果: history 占位被消费后重新注入，栈平衡 ✓

NavBar 返回键:
  ① onBack={onClose} → close() → visible 变 false → cleanup runs
  ② popstate 没有触发！
  ③ 占位状态残留在 history 中
  结果: 浏览器多了一个多余的 URL 栈条目 ✗
```

### 修复方案

利用 `handlePopstate` 中 `onCloseRef.current = null` 这个已有的标记行为，
在 cleanup 中判断本次关闭是否由 popstate 触发：

```
cleanup 中:
  查 entry.onCloseRef.current:
    null   → handlePopstate 已处理 → 占位已平衡 → 无需额外操作
    非 null → NavBar/代码触发的关闭 → 若栈已空 → 调 history.back() 消费占位
```

```diff
 return () => {
   const idx = stack.findIndex((e) => e.id === entry.id);
-  if (idx !== -1) stack.splice(idx, 1);
+  if (idx !== -1) {
+    const closedByPopstate = stack[idx].onCloseRef.current === null;
+    stack.splice(idx, 1);

-  if (stack.length === 0 && listenerRegistered) {
-    window.removeEventListener('popstate', handlePopstate);
-    listenerRegistered = false;
+    if (stack.length === 0 && listenerRegistered) {
+      window.removeEventListener('popstate', handlePopstate);
+      listenerRegistered = false;
+      if (!closedByPopstate) {
+        window.history.back();
+      }
+    }
   }
 };
```

### 嵌套弹窗兼容性

| 场景 | `onCloseRef.current` | 栈关闭后 | 行为 |
|------|:---:|------|------|
| 系统返回键关顶层（下层有弹窗） | null | 非空 | 不触发 back |
| 系统返回键关最后一个弹窗 | null | 空 | 不触发 back（已由 handlePopstate 平衡） |
| NavBar 关顶层（下层有弹窗） | 非 null | 非空 | 不触发 back |
| **NavBar 关最后一个弹窗** | **非 null** | **空** | **调 history.back()** ✅ |
| 父组件 unmount 导致关闭 | 非 null | 空 | 调 history.back()（无害） |

## 改动清单

### 文件 1：lib/back-button.ts

effect cleanup 中增加 `closedByPopstate` 判断和 `history.back()` 调用。

### 文件 2-6：watering 模块 Picker

每个文件在 `<Popup>` 上加两个属性：

```diff
 <Popup
+  closeOnMaskClick={true}
   position="bottom"
   visible={open}
   onClose={onClose}
+  onMaskClick={onClose}
 >
```

| # | 文件 | 说明 |
|---|------|------|
| 1 | `app/watering/components/process-config-picker.tsx` | 流程配置 |
| 2 | `app/watering/components/step-config-picker.tsx` | 步骤配置 |
| 3 | `app/watering/components/interrupt-config-picker.tsx` | 中断配置 |
| 4 | `app/watering/components/voltage-config-picker.tsx` | 电压配置 |
| 5 | `app/watering/components/schedule-config-picker.tsx` | 定时任务 |

## 测试策略

### 手工验证

| 场景 | 操作 | 预期 |
|------|------|------|
| 单弹窗 + NavBar 返回 | 打开弹窗 → 点 NavBar 返回 → 按系统返回键 | 按系统返回键后离开页面（无多余栈） |
| 单弹窗 + 系统返回键 | 打开弹窗 → 按系统返回键 | 弹窗关闭，再按一次离开页面 |
| 嵌套弹窗 + 系统返回键 | 打开 A → 打开 B → 按系统返回键 | B 关闭，再按 A 关闭，再按离开页面 |
| 嵌套弹窗 + NavBar 返回最后 | 打开 A → 打开 B → 点 B NavBar 返回 → 按系统返回键 | A 关闭（无多余栈） |
| 蒙层点击关闭 | 打开任意弹窗 → 点击蒙层 | 弹窗关闭 |
| 蒙层 + 返回键混用 | 打开 A → 打开 B → 点蒙层关闭 B → 按返回键 | A 关闭 |

### 现有单测

`__tests__/lib/back-button.test.ts` 已覆盖核心逻辑。本次改动增加了 history 清理路径，需要对测试做增量补充——验证 NavBar 式关闭后 `history.back()` 被调用。

## 不做什么

- 不改 hook 对外接口
- 不改任何 Popup 调用方代码（蒙层属性是加在 Picker 内部的 Popup 上）
- 不覆盖 `Dialog.confirm/show` 命令式弹窗
