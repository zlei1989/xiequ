# /travel/list 页面 antd-mobile 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/travel/list` 页面全面 antd-mobile 化，Drawer → Popup 浮层，拆分组件，引入 PullToRefresh/SwipeAction 等移动端增强交互。

**Architecture:** `page.tsx` 作为状态中心管理 4 个独立 Popup（查看/编辑位置/编辑瞬间/搜索），每个组件通过 props 接收数据和回调。所有 UI 组件替换为 antd-mobile。

**Tech Stack:** Next.js (app router), antd-mobile v5, TypeScript

---

## 文件结构

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `app/travel/components/search-popup.tsx` | 搜索浮层 |
| 新建 | `app/travel/components/location-edit-popup.tsx` | 编辑位置浮层 |
| 新建 | `app/travel/components/moment-edit-popup.tsx` | 编辑瞬间浮层 |
| 新建 | `app/travel/components/location-view-popup.tsx` | 查看浮层 |
| 修改 | `app/travel/components/location-list-item.tsx` | 重写为 antd-mobile |
| 修改 | `app/travel/list/page.tsx` | 重写为状态中心 |
| 删除 | `app/travel/components/location-drawer.tsx` | 被 popup 替代 |
| 删除 | `app/travel/components/search-dialog.tsx` | 被 search-popup 替代 |

---

### Task 1: 创建 SearchPopup

**Files:**
- Create: `app/travel/components/search-popup.tsx`

- [ ] **Step 1: 创建搜索浮层组件**

```tsx
"use client";

import { useState } from "react";
import { Popup, SearchBar, List, Button, Toast } from "antd-mobile";
import { searchPlace } from "../services/amap";
import type { AMapPoiItem } from "../services/amap";

export function SearchPopup({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) => void;
}) {
  const [results, setResults] = useState<AMapPoiItem[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(keyword: string) {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const items = await searchPlace(keyword);
      setResults(items);
    } catch (err: any) {
      Toast.show({ icon: "fail", content: "搜索失败: " + err.message });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        minHeight: "60vh",
      }}
    >
      <div style={{ padding: "8px 0" }}>
        <SearchBar
          placeholder="选择位置"
          onSearch={handleSearch}
          showCancelButton
          style={{ "--border-radius": "8px" } as React.CSSProperties}
        />
      </div>
      <List>
        {results.map((item) => (
          <List.Item
            key={item.id}
            description={item.address}
            extra={
              <Button
                size="small"
                color="primary"
                onClick={() =>
                  onAdd({
                    name: item.name,
                    address: item.address,
                    longitude: item.longitude,
                    latitude: item.latitude,
                  })
                }
              >
                添加
              </Button>
            }
          >
            {item.name}
          </List.Item>
        ))}
      </List>
    </Popup>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/components/search-popup.tsx
git commit -m "feat(travel): add SearchPopup component with antd-mobile"
```

---

### Task 2: 创建 LocationEditPopup

**Files:**
- Create: `app/travel/components/location-edit-popup.tsx`

- [ ] **Step 1: 创建编辑位置浮层组件**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Popup, Form, Input, TextArea, Button, Toast, NavBar } from "antd-mobile";
import type { Location } from "../types";

export function LocationEditPopup({
  location,
  visible,
  onClose,
  onSave,
}: {
  location: Location | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Location>) => Promise<Location>;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && location) {
      setName(location.name);
      setAddress(location.address);
      setComments(location.comments);
    }
  }, [visible, location]);

  async function handleSave() {
    if (!location) return;
    setSaving(true);
    try {
      await onSave(location.id, { name, address, comments });
      Toast.show({ icon: "success", content: "保存成功" });
      onClose();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        minHeight: "50vh",
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
        编辑位置
      </NavBar>
      <Form layout="vertical" style={{ padding: "0 16px" }}>
        <Form.Item label="名称">
          <Input value={name} onChange={setName} placeholder="位置名称" />
        </Form.Item>
        <Form.Item label="地址">
          <Input value={address} onChange={setAddress} placeholder="地址" />
        </Form.Item>
        <Form.Item label="备注">
          <TextArea
            value={comments}
            onChange={setComments}
            placeholder="备注"
            rows={3}
          />
        </Form.Item>
      </Form>
    </Popup>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/components/location-edit-popup.tsx
git commit -m "feat(travel): add LocationEditPopup component"
```

---

### Task 3: 创建 MomentEditPopup

**Files:**
- Create: `app/travel/components/moment-edit-popup.tsx`

- [ ] **Step 1: 创建编辑瞬间浮层组件**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Popup, Form, Input, TextArea, Button, Toast, NavBar } from "antd-mobile";
import type { Moment } from "../types";

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
      Toast.show({ icon: "fail", content: "请填写日期" });
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
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        minHeight: "40vh",
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
          <Input value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="内容">
          <TextArea
            value={text}
            onChange={setText}
            placeholder="记录这一刻..."
            rows={3}
          />
        </Form.Item>
      </Form>
    </Popup>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/components/moment-edit-popup.tsx
git commit -m "feat(travel): add MomentEditPopup component"
```

---

### Task 4: 创建 LocationViewPopup

**Files:**
- Create: `app/travel/components/location-view-popup.tsx`

- [ ] **Step 1: 创建查看浮层组件**

```tsx
"use client";

import { Popup, List, Button, Dialog, Toast } from "antd-mobile";
import { UploadImage } from "./upload-image";
import type { Location, Moment } from "../types";

export function LocationViewPopup({
  location,
  visible,
  onClose,
  moments,
  onEdit,
  onToggle,
  onDelete,
  onAddMoment,
  onEditMoment,
  onDeleteMoment,
}: {
  location: Location | null;
  visible: boolean;
  onClose: () => void;
  moments: Moment[];
  onEdit: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
  onAddMoment: () => void;
  onEditMoment: (moment: Moment) => void;
  onDeleteMoment: (moment: Moment) => Promise<void>;
}) {
  if (!location) return null;

  const coverUrl = `/travel/api/download?type=cover&id=${location.id}`;

  async function handleToggle() {
    try {
      await onToggle(location!);
      Toast.show({ icon: "success", content: "更新成功" });
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "更新失败" });
    }
  }

  function handleDelete() {
    Dialog.confirm({
      content: `确认删除「${location!.name}」及备注等信息？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDelete(location!);
          onClose();
        } catch (err: any) {
          Toast.show({ icon: "fail", content: err.message || "删除失败" });
        }
      },
    });
  }

  function handleDeleteMoment(m: Moment) {
    Dialog.confirm({
      content: `确认删除「${m.date}」的记录？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDeleteMoment(m);
          Toast.show({ icon: "success", content: "删除成功" });
        } catch (err: any) {
          Toast.show({ icon: "fail", content: err.message || "删除失败" });
        }
      },
    });
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: "80vh",
        overflow: "auto",
      }}
    >
      {/* 封面图 */}
      <div style={{ position: "relative" }}>
        <img
          src={coverUrl}
          alt={location.name}
          style={{ width: "100%", maxHeight: 240, objectFit: "cover" }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div style={{ position: "absolute", right: 8, bottom: 8 }}>
          <UploadImage locationId={location.id} type="cover" />
        </div>
      </div>

      {/* 信息区 */}
      <List style={{ "--font-size": "14px" } as React.CSSProperties}>
        <List.Item
          extra={
            <a
              onClick={(e) => {
                e.stopPropagation();
                onEdit(location);
              }}
              style={{ fontSize: 13 }}
            >
              编辑
            </a>
          }
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>{location.name}</div>
        </List.Item>
        <List.Item>
          <div style={{ color: "#666", fontSize: 13 }}>{location.address}</div>
        </List.Item>
        <List.Item>
          <div style={{ color: "#999", fontSize: 12 }}>
            坐标: {location.longitude}, {location.latitude}
          </div>
        </List.Item>
        {location.comments && (
          <List.Item>
            <div style={{ color: "#666", fontSize: 13, whiteSpace: "pre-wrap" }}>
              {location.comments}
            </div>
          </List.Item>
        )}
      </List>

      {/* 精彩瞬间 */}
      <div
        style={{
          padding: "12px 16px 4px",
          fontSize: 14,
          fontWeight: 600,
          color: "#333",
        }}
      >
        精彩瞬间
      </div>
      {moments.length === 0 && (
        <div style={{ padding: "8px 16px", color: "#999", fontSize: 13 }}>
          暂无记录
        </div>
      )}
      {moments.map((m) => (
        <List.Item
          key={m.id}
          description={m.date}
          clickable
          onClick={() => onEditMoment(m)}
          extra={
            <a
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteMoment(m);
              }}
              style={{ color: "#ff4d4f", fontSize: 13 }}
            >
              删除
            </a>
          }
        >
          <div
            style={{
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.text}
          </div>
        </List.Item>
      ))}
      <Button fill="none" onClick={onAddMoment} style={{ margin: "4px 16px" }}>
        + 添加记录
      </Button>

      {/* 底部操作栏 */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderTop: "1px solid #eee",
        }}
      >
        <Button color="danger" size="small" onClick={handleDelete}>
          删除
        </Button>
        <Button
          color={location.checked ? "default" : "primary"}
          size="small"
          onClick={handleToggle}
        >
          {location.checked ? "标记待去" : "标记已去"}
        </Button>
        <Button
          color="primary"
          size="small"
          fill="outline"
          onClick={onClose}
        >
          关闭
        </Button>
      </div>
    </Popup>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/components/location-view-popup.tsx
git commit -m "feat(travel): add LocationViewPopup component"
```

---

### Task 5: 重写 LocationListItem

**Files:**
- Modify: `app/travel/components/location-list-item.tsx`

- [ ] **Step 1: 重写为 antd-mobile SwipeAction + List.Item**

用以下内容替换整个文件：

```tsx
"use client";

import { List, SwipeAction, Dialog, Toast } from "antd-mobile";
import type { Location } from "../types";

export function LocationListItem({
  location,
  onClick,
  onToggle,
  onDelete,
}: {
  location: Location;
  onClick: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
}) {
  const iconUrl = `/travel/api/download?type=icon&id=${location.id}`;

  async function handleToggle() {
    try {
      await onToggle(location);
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "操作失败" });
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
        } catch (err: any) {
          Toast.show({ icon: "fail", content: err.message || "删除失败" });
        }
      },
    });
  }

  const rightActions = [
    {
      key: "toggle",
      text: location.checked ? "待去" : "已去",
      color: location.checked ? "warning" : "primary",
      onClick: handleToggle,
    },
    {
      key: "delete",
      text: "删除",
      color: "danger",
      onClick: handleDelete,
    },
  ];

  return (
    <SwipeAction rightActions={rightActions}>
      <List.Item
        prefix={
          <img
            src={iconUrl}
            alt={location.name}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              objectFit: "cover",
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+";
            }}
          />
        }
        description={
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
              maxWidth: "60vw",
            }}
          >
            {location.address}
          </span>
        }
        extra={
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              color: location.checked ? "#52c41a" : "#1677ff",
              background: location.checked ? "#f6ffed" : "#e6f7ff",
              border: `1px solid ${location.checked ? "#b7eb8f" : "#91d5ff"}`,
              whiteSpace: "nowrap",
            }}
          >
            {location.checked ? "已去" : "待去"}
          </span>
        }
        onClick={() => onClick(location)}
      >
        <span style={{ fontWeight: 500 }}>{location.name}</span>
      </List.Item>
    </SwipeAction>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/components/location-list-item.tsx
git commit -m "refactor(travel): rewrite LocationListItem with antd-mobile SwipeAction"
```

---

### Task 6: 重写 list/page.tsx

**Files:**
- Modify: `app/travel/list/page.tsx`

- [ ] **Step 1: 重写为 Popup 状态中心**

用以下内容替换整个文件：

```tsx
"use client";

import { useState, useEffect } from "react";
import { PullToRefresh, List, DotLoading, ErrorBlock } from "antd-mobile";
import { useTravelContext } from "../hooks/use-locations";
import { useMoments } from "../hooks/use-moments";
import { LocationListItem } from "../components/location-list-item";
import { LocationViewPopup } from "../components/location-view-popup";
import { LocationEditPopup } from "../components/location-edit-popup";
import { MomentEditPopup } from "../components/moment-edit-popup";
import { SearchPopup } from "../components/search-popup";
import type { Location, Moment } from "../types";

export default function LocationListPage() {
  const { sortedLocations, loading, add, update, remove, load } =
    useTravelContext();

  // Popup 状态
  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);

  // 当前查看位置的精彩瞬间
  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
  } = useMoments(viewLocation?.id || "");

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener("travel:open-search", onOpenSearch);
    return () => window.removeEventListener("travel:open-search", onOpenSearch);
  }, []);

  // ── 列表操作 ──

  async function handleToggle(location: Location) {
    await update(location.id, { checked: !location.checked });
    // 同步更新 viewLocation 和 editLocation 中的引用
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }

  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  // ── 搜索添加 ──

  async function handleAdd(data: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) {
    const newLoc = await add(data);
    setSearchVisible(false);
    setViewLocation(newLoc);
  }

  // ── 渲染 ──

  return (
    <div>
      {loading && sortedLocations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <DotLoading />
        </div>
      ) : sortedLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无位置" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {sortedLocations.map((location) => (
              <LocationListItem
                key={location.id}
                location={location}
                onClick={setViewLocation}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      {/* 查看浮层 */}
      <LocationViewPopup
        location={viewLocation}
        visible={!!viewLocation}
        onClose={() => setViewLocation(null)}
        moments={moments}
        onEdit={(loc) => setEditLocation(loc)}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddMoment={() =>
          setEditMoment({ locationId: viewLocation!.id, moment: null })
        }
        onEditMoment={(m) =>
          setEditMoment({ locationId: viewLocation!.id, moment: m })
        }
        onDeleteMoment={removeMoment}
      />

      {/* 编辑位置浮层 */}
      <LocationEditPopup
        location={editLocation}
        visible={!!editLocation}
        onClose={() => setEditLocation(null)}
        onSave={update}
      />

      {/* 编辑瞬间浮层 */}
      <MomentEditPopup
        moment={editMoment?.moment || null}
        visible={!!editMoment}
        onClose={() => setEditMoment(null)}
        onSave={updateMoment}
        onAdd={addMoment}
      />

      {/* 搜索浮层 */}
      <SearchPopup
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onAdd={handleAdd}
      />
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/list/page.tsx
git commit -m "refactor(travel): rewrite list page with antd-mobile Popup orchestration"
```

---

### Task 7: 移除旧文件

**Files:**
- Delete: `app/travel/components/location-drawer.tsx`
- Delete: `app/travel/components/search-dialog.tsx`

- [ ] **Step 1: 删除旧 Drawer 和 Dialog**

```bash
git rm app/travel/components/location-drawer.tsx
git rm app/travel/components/search-dialog.tsx
git commit -m "refactor(travel): remove old location-drawer and search-dialog, replaced by popups"
```

---

### Task 8: 验证

- [ ] **Step 1: 检查 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -100
```
Expected: 无新增类型错误。

- [ ] **Step 2: 检查 import 残留** — 确认没有文件再引用已删除的模块

```bash
grep -r "location-drawer\|search-dialog" app/ --include="*.ts" --include="*.tsx"
```
Expected: 无输出。

- [ ] **Step 3: 功能回归清单**

启动开发服务器后在浏览器中逐项验证：
1. `/travel/list` 页面正常加载，列表展示位置数据
2. 点击列表项 → 底部弹出查看 Popup（圆角浮层），展示封面图、信息、瞬间
3. 查看 Popup 中点"编辑" → 弹出编辑位置 Popup，修改保存后 Toast 提示成功
4. 查看 Popup 中点"添加记录" → 弹出瞬间编辑 Popup，填写保存
5. 查看 Popup 中点击某条瞬间 → 弹出编辑瞬间 Popup
6. 列表项左滑 → 显示"已去/待去"切换和"删除"按钮
7. 下拉列表 → PullToRefresh 刷新
8. ActionSheet 中"添加位置" → 弹出搜索 Popup，搜索并添加位置
9. ActionSheet 中筛选"已去"/"待去"/"全部" → 列表正确过滤

- [ ] **Step 4: 发现问题则修复后提交**

```bash
git add -A
git commit -m "fix(travel): address issues found during verification"
```

---

## 实施偏差

- **图片占位图标**：`location-list-item.tsx` 和 `location-view-popup.tsx` 中的图片加载失败占位从内联 SVG base64 / `display:none` 改为使用 `PictureWrongOutline` 图标（来自 `antd-mobile-icons`），通过 `useState` 追踪加载状态进行条件渲染，location 切换时自动重置。
