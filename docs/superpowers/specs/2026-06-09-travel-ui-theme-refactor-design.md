# 精彩瞬间与已去状态联动 + UI 微调

## 目标

实现"精彩瞬间"记录与"已去"状态的联动规则，日期选择从文本输入改为 DatePickerView，以及 SwipeAction 视觉微调。

## 背景

基于 `2026-06-09-travel-list-antd-mobile-refactor-design.md` 已完成的 antd-mobile 重构，在此之上增强交互规则。

## 核心规则

1. **有精彩瞬间 → "已去"状态锁定**：位置一旦有精彩瞬间记录，toggle 禁用，不可改为"待去"
2. **无精彩瞬间 → 勾选"已去"自动创建**：从"待去"切到"已去"时，自动创建一条当天日期、空文本的精彩瞬间

## 改动范围

| 文件 | 改动 | 行数估算 |
|------|------|---------|
| `list/page.tsx` | handleToggle 规则逻辑 + hasMoments 判断 | +20 |
| `components/location-list-item.tsx` | SwipeAction 颜色/文案/hasMoments 隐藏 | ~5 |
| `components/location-view-popup.tsx` | Switch disabled | +1 |
| `components/moment-edit-popup.tsx` | 日期只读 Input + Popup + DatePickerView | +30 |

总计约 4 个文件，不超过 60 行净增。

---

## 一、list/page.tsx — 核心规则逻辑

### hasMoments 判断

moments 数据嵌入在 `fetchLocations()` 返回的 location 对象中（`(location as any).moments`），类型为 `Record<string, { date: string; text: string }>`。通过读取 key 数量判断：

```typescript
function hasMoments(location: Location): boolean {
  const moments = (location as any).moments as Record<string, unknown> | undefined;
  return !!moments && Object.keys(moments).length > 0;
}
```

### handleToggle 改造

```
handleToggle(location):
  1. 如果 hasMoments(location) → return（防御性，UI 已禁用不会触发）
  2. 如果 !location.checked（待去→已去）→ 先 addMoment({ date: today, text: "" })
  3. update(location.id, { checked: !location.checked })
```

### hasMoments 传递给子组件

- `LocationListItem`：新增 `hasMoments` prop，值来自 `hasMoments(location)`
- `LocationViewPopup`：已有 `moments` 数组，用 `moments.length > 0` 即可

---

## 二、location-list-item.tsx — SwipeAction 微调

### 颜色

两个 action 的 `color` 统一改为 `"light"`。

### 文案

```typescript
text: location.checked ? "标记待去" : "标记已去"
```

### 有精彩瞬间时隐藏 toggle

当 `hasMoments` 为 true 时，不渲染 toggle action，只保留删除。意味着有瞬间的位置在列表中无法通过左滑切换状态。

```typescript
rightActions={[
  ...(hasMoments ? [] : [{
    key: "toggle",
    text: location.checked ? "标记待去" : "标记已去",
    color: "light" as const,
    onClick: handleToggle,
  }]),
  {
    key: "delete",
    text: "删除",
    color: "light" as const,
    onClick: handleDelete,
  },
]}
```

---

## 三、location-view-popup.tsx — Switch 禁用

Popup 中已有 `moments` 数组，直接用 `moments.length > 0` 控制 `disabled` 属性：

```tsx
<Switch
  checked={loc.checked}
  uncheckedText="待去"
  checkedText="已去"
  onChange={handleToggle}
  disabled={moments.length > 0}
/>
```

antd-mobile Switch 原生支持 `disabled`，禁用后呈灰色不可交互。

---

## 四、moment-edit-popup.tsx — 日期改为 DatePickerView

### 组件结构

```
MomentEditPopup
├── NavBar（标题 + 保存按钮）
├── Form
│   ├── Form.Item "日期"
│   │   └── Input (readOnly, onClick → 打开 DatePickerPopup)
│   └── Form.Item "内容"
│       └── TextArea (rows=4)
└── DatePickerPopup
    └── Popup + DatePickerView + 确认/取消
```

### 日期交互

- 日期 Input 设为 `readOnly`，不可键盘输入
- 点击 Input 打开新的 Popup，内含 `DatePickerView`
- DatePickerView 约束 `min` 和 `max`（如 2000-01-01 到当天）
- 确认：更新 date 状态，关闭 Popup
- 取消：保持原值，关闭 Popup

### TextArea

`rows` 从 3 改为 4。

### 状态管理

新增 `datePickerVisible: boolean` 控制日期选择 Popup 开关。

---

## 数据流

```
page.tsx
├── hasMoments(loc)  ← 读取 (loc as any).moments
│
├── handleToggle
│   ├── hasMoments → return（防御）
│   ├── !checked → addMoment({ date: today, text: "" })
│   └── update({ checked: !checked })
│
├── LocationListItem
│   ├── hasMoments prop → 隐藏 toggle SwipeAction
│   └── color: "light"
│
├── LocationViewPopup
│   └── Switch disabled={moments.length > 0}
│
└── MomentEditPopup
    ├── Input readOnly + onClick → DatePickerPopup
    ├── DatePickerPopup: Popup + DatePickerView
    └── TextArea rows={4}
```

## 错误处理

- toggle 被禁用后理论上不会触发，`handleToggle` 中的 `hasMoments` return 作为防御
- 自动创建瞬间失败 → Toast 提示，不执行 toggle（保持原状态）
- DatePickerView 选择取消 → 日期保持原值

## 测试要点

- **功能回归**：列表展示、搜索添加、查看、编辑位置、编辑瞬间、删除
- **规则验证**：有瞬间的位置开关禁用（Popup + SwipeAction 均不可切换）
- **自动创建**：无瞬间的位置勾选"已去"后，确认精彩瞬间列表中多了一条当天日期空文本记录
- **日期选择**：点击日期 Input 弹出 DatePickerView，选择后正确更新
- **视觉效果**：SwipeAction 颜色为 light，禁用态灰色
