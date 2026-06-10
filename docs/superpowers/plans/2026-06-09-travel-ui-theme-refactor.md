# 精彩瞬间与已去状态联动 + UI 微调 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 实现"精彩瞬间"与"已去"状态联动规则，日期选择改用 DatePickerView，SwipeAction toggle 用 light 颜色，delete 用 danger（红色）。

**Architecture:** 在 page.tsx 集中处理 toggle 规则（hasMoments 判断 + 自动创建瞬间），通过 props 将禁用态传递给子组件。MomentEditPopup 新增嵌入式 DatePickerPopup。

**Tech Stack:** Next.js (App Router), React 19, antd-mobile 5.x, TypeScript, dayjs

**Source spec:** `docs/superpowers/specs/2026-06-09-travel-ui-theme-refactor-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/travel/list/page.tsx` | 修改 | 核心规则：hasMoments 判断、handleToggle 联动自动创建瞬间 |
| `app/travel/components/location-list-item.tsx` | 修改 | SwipeAction toggle=light/delete=danger、文案、有瞬间时隐藏 toggle |
| `app/travel/components/location-view-popup.tsx` | 修改 | Switch disabled 当有瞬间 |
| `app/travel/components/moment-edit-popup.tsx` | 修改 | Input 只读 + DatePickerPopup、TextArea rows=4 |

---

### Task 1: page.tsx — 核心规则逻辑

**Files:**
- Modify: `app/travel/list/page.tsx`

- [ ] **Step 1: 确保导入**

当前 `page.tsx` 已有 `PullToRefresh, List, DotLoading, ErrorBlock` 从 antd-mobile 导入。需要追加 `Toast`，并新增 `createMoment` 导入：

```typescript
import { PullToRefresh, List, DotLoading, ErrorBlock, Toast } from "antd-mobile";
// ... 其他导入 ...
import { createMoment } from "../actions";
```

- [ ] **Step 2: 替换 handleToggle 并添加辅助函数**

在 `handleToggle` 原位置（约第 46 行）替换，并在上方添加 `hasMoments` 和 `getErrorMessage`：

```typescript
// 判断位置是否有精彩瞬间记录
function hasMoments(location: Location): boolean {
  const moments = (location as any).moments as Record<string, unknown> | undefined;
  return !!moments && Object.keys(moments).length > 0;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

async function handleToggle(location: Location) {
  // 有精彩瞬间时状态锁定，不可切换（防御性，UI 已禁用不会触发）
  if (hasMoments(location)) return;

  // 从待去切到已去时，自动创建一条当天日期的空文本精彩瞬间
  if (!location.checked) {
    try {
      await createMoment(location.id, {
        date: new Date().toISOString().slice(0, 10),
        text: "",
      });
    } catch (err: unknown) {
      Toast.show({ icon: "fail", content: getErrorMessage(err, "创建记录失败") });
      return; // 创建失败则不切换状态
    }
  }

  await update(location.id, { checked: !location.checked });
  const updated = { ...location, checked: !location.checked };
  if (viewLocation?.id === location.id) setViewLocation(updated);
  if (editLocation?.id === location.id) setEditLocation(updated);

  // 刷新列表数据（moments 变更后需要更新 hasMoments 判断）
  await load();
}
```

- [ ] **Step 3: 传递 hasMoments 给 LocationListItem**

渲染 `LocationListItem` 处添加 `hasMoments` prop：

```tsx
{sortedLocations.map((location) => (
  <LocationListItem
    key={location.id}
    location={location}
    hasMoments={hasMoments(location)}
    onClick={setViewLocation}
    onToggle={handleToggle}
    onDelete={handleDelete}
  />
))}
```

- [ ] **Step 4: 验证构建**

```bash
cd d:/workspace/自动浇花系统/xiequ/service && npx tsc --noEmit --pretty 2>&1 | head -50
```

预期：无类型错误。

- [ ] **Step 5: 提交**

```bash
git add app/travel/list/page.tsx
git commit -m "feat(travel): add toggle-moment linkage rules in page.tsx"
```

---

### Task 2: location-list-item.tsx — SwipeAction 微调

**Files:**
- Modify: `app/travel/components/location-list-item.tsx`

- [ ] **Step 1: 用以下完整内容替换文件**

```typescript
"use client";

import { Dialog, List, SwipeAction, Toast } from "antd-mobile";
import { CoverImage } from "./cover-image";
import { StatusTag } from "./status-tag";
import type { Location } from "../types";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function LocationListItem({
  location,
  hasMoments,
  onClick,
  onToggle,
  onDelete,
}: {
  location: Location;
  hasMoments: boolean;
  onClick: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
}) {
  const iconUrl = `/travel/api/download?type=icon&id=${location.id}`;

  async function handleToggle() {
    try {
      await onToggle(location);
    } catch (err: unknown) {
      Toast.show({ icon: "fail", content: getErrorMessage(err, "操作失败") });
    }
  }

  function handleDelete() {
    Dialog.confirm({
      content: `确认删除「${location.name}」及备注等信息？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDelete(location);
        } catch (err: unknown) {
          Toast.show({ icon: "fail", content: getErrorMessage(err, "删除失败") });
        }
      },
    });
  }

  return (
    <SwipeAction
      rightActions={[
        // 有精彩瞬间时隐藏切换按钮（状态锁定为已去）
        ...(hasMoments ? [] : [{
          key: "toggle",
          text: location.checked ? "标记待去" : "标记已去",
          color: "light" as const,
          onClick: handleToggle,
        }]),
        {
          key: "delete",
          text: "删除",
          color: "danger" as const,
          onClick: handleDelete,
        },
      ]}
    >
      <List.Item
        prefix={
          <CoverImage
            src={iconUrl}
            alt={location.name}
            width={44}
            height={44}
            shape="circle"
          />
        }
        description={location.address}
        extra={<StatusTag checked={location.checked} />}
        onClick={() => onClick(location)}
      >
        {location.name}
      </List.Item>
    </SwipeAction>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

预期：无类型错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/location-list-item.tsx
git commit -m "feat(travel): SwipeAction toggle light / delete danger color, new text, hide toggle when has moments"
```

---

### Task 3: location-view-popup.tsx — Switch 禁用

**Files:**
- Modify: `app/travel/components/location-view-popup.tsx`

- [ ] **Step 1: Switch 添加 disabled 属性**

找到 `<Switch` 标签（约第 163 行），添加 `disabled` 属性：

将：
```tsx
<Switch
  checked={loc.checked}
  uncheckedText="待去"
  checkedText="已去"
  onChange={handleToggle}
/>
```

改为：
```tsx
<Switch
  checked={loc.checked}
  uncheckedText="待去"
  checkedText="已去"
  onChange={handleToggle}
  disabled={moments.length > 0}
/>
```

- [ ] **Step 2: 验证构建**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

预期：无类型错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/location-view-popup.tsx
git commit -m "feat(travel): disable Switch when location has moments"
```

---

### Task 4: moment-edit-popup.tsx — DatePickerView + TextArea rows=4

**Files:**
- Modify: `app/travel/components/moment-edit-popup.tsx`

- [ ] **Step 1: 确认 dayjs 可用**

```bash
node -e "require('dayjs')" 2>&1 || pnpm add dayjs
```

- [ ] **Step 2: 用以下完整内容替换文件**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Popup, Form, Input, TextArea, Button, Toast, NavBar, DatePickerView } from "antd-mobile";
import type { Moment } from "../types";
import dayjs from "dayjs";

// 将 "YYYY-MM-DD" 字符串转为 Date 对象
function dateStrToDate(str: string): Date {
  const d = dayjs(str);
  return d.isValid() ? d.toDate() : new Date();
}

// 将 Date 对象转为 "YYYY-MM-DD" 字符串
function dateToStr(d: Date): string {
  return dayjs(d).format("YYYY-MM-DD");
}

export function MomentEditPopup({
  moment,
  visible,
  onClose,
  onSave,
  onAdd,
}: {
  moment: Moment | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, data: { date: string; text: string }) => Promise<void>;
  onAdd: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const isEdit = !!moment;

  useEffect(() => {
    if (visible) {
      if (moment) {
        setDate(moment.date);
        setText(moment.text);
      } else {
        setDate(new Date().toISOString().slice(0, 10));
        setText("");
      }
    }
  }, [visible, moment]);

  async function handleSave() {
    if (!date.trim()) {
      Toast.show({ icon: "fail", content: "请选择日期" });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && moment) {
        await onSave(moment.id, { date, text });
        Toast.show({ icon: "success", content: "修改成功" });
      } else {
        await onAdd({ date, text });
        Toast.show({ icon: "success", content: "添加成功" });
      }
      onClose();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Popup
        visible={visible}
        onMaskClick={onClose}
        onClose={onClose}
        position="bottom"
        bodyStyle={{
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          minHeight: "40vh",
          maxHeight: "75vh",
          overflow: "auto",
        }}
      >
        <NavBar
          onBack={onClose}
          right={
            <Button color="primary" size="small" loading={saving} onClick={handleSave}>
              保存
            </Button>
          }
        >
          {isEdit ? "编辑记录" : "添加记录"}
        </NavBar>
        <Form layout="vertical" style={{ padding: "0 16px" }}>
          <Form.Item label="日期">
            <Input
              value={date}
              readOnly
              onClick={() => setDatePickerVisible(true)}
              placeholder="YYYY-MM-DD"
            />
          </Form.Item>
          <Form.Item label="内容">
            <TextArea
              value={text}
              onChange={setText}
              placeholder="记录这一刻..."
              rows={4}
            />
          </Form.Item>
        </Form>
      </Popup>

      <Popup
        visible={datePickerVisible}
        onMaskClick={() => setDatePickerVisible(false)}
        onClose={() => setDatePickerVisible(false)}
        position="bottom"
        bodyStyle={{
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <DatePickerView
          value={dateStrToDate(date)}
          onChange={(val) => setDate(dateToStr(val))}
          min={new Date(2000, 0, 1)}
          max={new Date()}
          style={{ "--height": "240px" }}
        />
        <div style={{ padding: "8px 16px 16px", display: "flex", justifyContent: "flex-end" }}>
          <Button
            color="primary"
            size="small"
            onClick={() => setDatePickerVisible(false)}
          >
            确定
          </Button>
        </div>
      </Popup>
    </>
  );
}
```

- [ ] **Step 3: 验证构建**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

预期：无类型错误。

- [ ] **Step 4: 提交**

```bash
git add app/travel/components/moment-edit-popup.tsx
# 如果安装了 dayjs:
git add package.json pnpm-lock.yaml
git commit -m "feat(travel): DatePickerView for moment date picker, TextArea rows=4"
```
