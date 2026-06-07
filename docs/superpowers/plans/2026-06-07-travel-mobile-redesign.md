# Travel 模块移动端重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 travel 模块从桌面端侧边栏布局改造为移动端优先布局，对标 7qb-client trip-plan 交互模式

**Architecture:** 去掉 Ant Design Sider 侧边栏，改为 Header + 左滑导航抽屉 + 全宽内容区。位置详情改为底部 Drawer (75%) 内置查看/编辑双模式。操作入口统一收纳到 Header Dropdown。数据通过 TravelContext 在 layout 层加载，页面消费 context。

**Tech Stack:** Next.js App Router, React 19, Ant Design 6, TypeScript

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `app/travel/hooks/use-locations.ts` | 外部化 filter，导出 TravelContext |
| Create | `app/travel/components/nav-drawer.tsx` | 左侧导航抽屉：菜单 + 统计面板 |
| Create | `app/travel/components/location-list-item.tsx` | 紧凑列表项（对标 LocationList.vue li） |
| Rewrite | `app/travel/components/location-drawer.tsx` | 底部 Drawer：查看/编辑位置/编辑瞬间三模式 |
| Modify | `app/travel/components/search-dialog.tsx` | width 改为 90%，列表项样式对齐 |
| Rewrite | `app/travel/layout.tsx` | 去掉 Sider，Header + NavDrawer + TravelContext.Provider |
| Rewrite | `app/travel/page.tsx` | 地图页：从 context 消费数据，底部 Drawer |
| Rewrite | `app/travel/list/page.tsx` | 列表页：紧凑列表项，从 context 消费数据 |
| Modify | `app/travel/components/trip-map.tsx` | 高度调整为 `calc(100vh - 48px)` |
| Delete | `app/travel/locations/[id]/page.tsx` | 功能移至 LocationDrawer |
| Delete | `app/travel/components/location-card.tsx` | 被 location-list-item 替代 |
| Delete | `app/travel/components/location-list.tsx` | 列表渲染直接在 page 内完成 |

---

### Task 1: 修改 use-locations.ts — 外部化 filter + 导出 TravelContext

**Files:**
- Modify: `app/travel/hooks/use-locations.ts`

**Goal:** 将 filter 控制权从 hook 内部移出，改为接受外部参数。添加 TravelContext 供 layout → pages 数据共享。

- [ ] **Step 1: 重写 use-locations.ts**

```typescript
// app/travel/hooks/use-locations.ts
"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Location, Summary } from "../types";
import { fetchLocations, createLocation, editLocation, removeLocation } from "../actions";

export type TravelData = {
  locations: Location[];
  sortedLocations: Location[];
  summary: Summary;
  loading: boolean;
  add: (data: { name: string; address: string; longitude: number; latitude: number; comments?: string }) => Promise<Location>;
  update: (id: string, data: Partial<Location>) => Promise<Location>;
  remove: (id: string) => Promise<void>;
};

export const TravelContext = createContext<TravelData | null>(null);

export function useTravelContext() {
  const ctx = useContext(TravelContext);
  if (!ctx) throw new Error("useTravelContext must be used within TravelContext.Provider");
  return ctx;
}

export function useLocations(filter?: "all" | "checked" | "uncheck") {
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLocations();
      setAllLocations(data);
    } catch (err) {
      console.error("加载位置失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (data: { name: string; address: string; longitude: number; latitude: number; comments?: string }) => {
    const newLoc = await createLocation(data);
    setAllLocations((prev) => [...prev, newLoc]);
    return newLoc;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Location>) => {
    const updated = await editLocation(id, data);
    setAllLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await removeLocation(id);
    setAllLocations((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
  }, []);

  // 过滤后的列表
  const filteredLocations = allLocations
    .filter((loc) => !loc.deleted)
    .filter((loc) => {
      if (filter === "checked") return loc.checked;
      if (filter === "uncheck") return !loc.checked;
      return true;
    });

  // 统计基于所有未删除的位置（对标参考：summary 基于全部数据）
  const activeLocations = allLocations.filter((l) => !l.deleted);
  const summary: Summary = {
    uncheckCount: activeLocations.filter((l) => !l.checked).length,
    uncheckPercentage: 0,
    checkedCount: activeLocations.filter((l) => l.checked).length,
    checkedPercentage: 0,
    count: activeLocations.length,
  };
  if (summary.count > 0) {
    summary.uncheckPercentage = Math.floor((summary.uncheckCount / summary.count) * 100);
    summary.checkedPercentage = Math.floor((summary.checkedCount / summary.count) * 100);
  }

  return {
    locations: allLocations,
    sortedLocations: filteredLocations,
    summary,
    loading,
    load,
    add,
    update,
    remove,
  };
}
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "use-locations" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/hooks/use-locations.ts
git commit -m "refactor(travel/use-locations): externalize filter, add TravelContext for layout-level data sharing"
```

---

### Task 2: 创建 nav-drawer.tsx — 左侧导航抽屉

**Files:**
- Create: `app/travel/components/nav-drawer.tsx`

**Goal:** 左侧滑出导航抽屉 (75% 宽度)，内含地图/收藏夹菜单 + 统计面板，对标参考 AppLayout 中的 el-drawer。

- [ ] **Step 1: 检查参考代码中的图标对应关系**

Reference uses: MapLocation, Collection, Tickets (Element Plus icons).
Ant Design equivalents: `EnvironmentOutlined`, `UnorderedListOutlined`, `ScheduleOutlined`.

- [ ] **Step 2: 创建 nav-drawer.tsx**

```typescript
// app/travel/components/nav-drawer.tsx
"use client";

import { Drawer, Menu, Progress, Row, Col } from "antd";
import { EnvironmentOutlined, UnorderedListOutlined, ScheduleOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { Summary } from "../types";

export function NavDrawer({
  open,
  onClose,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  summary: Summary;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function onClickMenu(info: { key: string }) {
    router.push(info.key);
    onClose();
  }

  return (
    <Drawer
      title="旅行计划"
      placement="left"
      width="75%"
      open={open}
      onClose={onClose}
      destroyOnClose
      footer={
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8} style={{ textAlign: "center" }}>
              <div style={{ color: "#999", fontSize: 12 }}>已去</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.checkedCount}</div>
            </Col>
            <Col span={8} style={{ textAlign: "center" }}>
              <div style={{ color: "#999", fontSize: 12 }}>待去</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.uncheckCount}</div>
            </Col>
            <Col span={8} style={{ textAlign: "center" }}>
              <div style={{ color: "#999", fontSize: 12 }}>总计</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.count}</div>
            </Col>
          </Row>
          <Progress
            percent={summary.checkedPercentage}
            size="small"
            format={() => `${summary.checkedPercentage}%`}
          />
        </div>
      }
    >
      <Menu
        mode="inline"
        selectedKeys={[pathname.startsWith("/travel/list") ? "/travel/list" : "/travel"]}
        onClick={onClickMenu}
        items={[
          {
            key: "/travel",
            icon: <EnvironmentOutlined />,
            label: "地图",
          },
          {
            key: "/travel/list",
            icon: <UnorderedListOutlined />,
            label: "收藏夹",
          },
          {
            key: "trip",
            icon: <ScheduleOutlined />,
            label: "行程",
            disabled: true,
          },
        ]}
        style={{ borderRight: 0 }}
      />
    </Drawer>
  );
}
```

- [ ] **Step 3: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "nav-drawer" | head -5`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add app/travel/components/nav-drawer.tsx
git commit -m "feat(travel/nav-drawer): add left drawer with menu and statistics panel"
```

---

### Task 3: 创建 location-list-item.tsx — 紧凑列表项

**Files:**
- Create: `app/travel/components/location-list-item.tsx`

**Goal:** 对标参考 LocationList.vue 的 `<li>` 样式：圆形封面 + 名称/地址 + 状态标签。无 Card 边框。

- [ ] **Step 1: 创建 location-list-item.tsx**

```typescript
// app/travel/components/location-list-item.tsx
"use client";

import { Tag } from "antd";
import { getIconProxyUrl } from "../actions";
import type { Location } from "../types";

export function LocationListItem({
  location,
  onClick,
}: {
  location: Location;
  onClick: (location: Location) => void;
}) {
  const iconUrl = getIconProxyUrl(location.id);

  return (
    <div
      onClick={() => onClick(location)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        padding: "16px 20px",
        borderBottom: "1px solid rgb(235, 238, 245)",
        whiteSpace: "nowrap",
      }}
    >
      <img
        src={iconUrl}
        alt={location.name}
        style={{
          width: 48,
          height: 48,
          minWidth: 48,
          minHeight: 48,
          overflow: "hidden",
          objectFit: "cover",
          borderRadius: "50%",
        }}
        onError={(e) => {
          // 图片加载失败显示占位
          (e.target as HTMLImageElement).src =
            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+";
        }}
      />
      <div
        style={{
          flex: 1,
          margin: "0 20px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 500 }}>{location.name}</div>
        <div
          style={{
            color: "#999",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "18em",
          }}
        >
          {location.address}
        </div>
      </div>
      {location.checked ? (
        <Tag color="green">已去</Tag>
      ) : (
        <Tag color="blue">待去</Tag>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 在 actions.ts 中添加 getIconProxyUrl 导出**

检查 `app/travel/actions.ts` 中是否已导出 `getIconProxyUrl`。Read the file to confirm. 查看 `services/oss.ts` — 其中已定义 `getIconProxyUrl`，需要在 actions.ts 中导出。

```typescript
// 在 app/travel/actions.ts 末尾添加（如果还不存在）：
export { getIconProxyUrl } from "./services/oss";
```

- [ ] **Step 3: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "location-list-item\|getIconProxyUrl" | head -5`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add app/travel/components/location-list-item.tsx app/travel/actions.ts
git commit -m "feat(travel/location-list-item): add compact list item with avatar, matching LocationList.vue"
```

---

### Task 4: 重写 location-drawer.tsx — 底部 Drawer 三模式

**Files:**
- Rewrite: `app/travel/components/location-drawer.tsx`

**Goal:** 从右侧 Drawer 改为底部 Drawer (75%)，支持查看/编辑位置/编辑瞬间三种模式。对标参考 LocationDrawer.vue。

- [ ] **Step 1: 创建新的 location-drawer.tsx**

```typescript
// app/travel/components/location-drawer.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Drawer,
  Descriptions,
  Tag,
  Button,
  Input,
  Popconfirm,
  Timeline,
  Card,
  Space,
  message,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  StarOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { UploadImage } from "./upload-image";
import { MomentForm } from "./moment-form";
import { useMoments } from "../hooks/use-moments";
import { getCoverProxyUrl } from "../actions";
import type { Location } from "../types";

export function LocationDrawer({
  location,
  open,
  onClose,
  onUpdate,
  onRemove,
}: {
  location: Location | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Location>) => Promise<Location>;
  onRemove: (id: string) => Promise<void>;
}) {
  // 模式状态
  const [editable, setEditable] = useState(false);
  const [targetType, setTargetType] = useState<"location" | "moment">("location");

  // 位置编辑表单
  const [locationForm, setLocationForm] = useState({ name: "", address: "", comments: "" });

  // 瞬间编辑表单
  const [momentForm, setMomentForm] = useState({ date: "", text: "" });
  const [editingMomentId, setEditingMomentId] = useState<string>("");

  const [saving, setSaving] = useState(false);

  // 当 location 变化或 drawer 打开时重置状态
  const lastOpenTs = useRef(0);
  useEffect(() => {
    if (open) {
      lastOpenTs.current = Date.now();
      setEditable(false);
    }
  }, [open, location?.id]);

  // 精彩瞬间
  const { moments, add: addMoment, update: updateMoment, remove: removeMoment } = useMoments(
    location?.id || ""
  );

  if (!location) return null;

  const coverUrl = getCoverProxyUrl(location.id);

  // ─── 位置编辑 ───

  function startEditLocation() {
    setTargetType("location");
    setLocationForm({
      name: location!.name,
      address: location!.address,
      comments: location!.comments,
    });
    setEditable(true);
  }

  async function saveLocation() {
    setSaving(true);
    try {
      await onUpdate(location!.id, locationForm);
      message.success("保存成功");
      setEditable(false);
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // ─── 瞬间编辑 ───

  function startAddMoment() {
    setTargetType("moment");
    setEditingMomentId("");
    setMomentForm({ date: new Date().toISOString().slice(0, 10), text: "" });
    setEditable(true);
  }

  function startEditMoment(id: string, m: { date: string; text: string }) {
    setTargetType("moment");
    setEditingMomentId(id);
    setMomentForm({ date: m.date, text: m.text });
    setEditable(true);
  }

  async function saveMoment() {
    setSaving(true);
    try {
      if (editingMomentId) {
        await updateMoment(editingMomentId, momentForm);
        message.success("修改成功");
      } else {
        await addMoment(momentForm);
        message.success("添加成功");
      }
      setEditable(false);
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMoment(id: string) {
    try {
      await removeMoment(id);
      message.success("删除成功");
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  // ─── 位置操作 ───

  async function toggleChecked() {
    setSaving(true);
    try {
      await onUpdate(location!.id, { checked: !location!.checked });
      message.success("更新成功");
    } catch (err: any) {
      message.error(err.message || "更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await onRemove(location!.id);
    onClose();
  }

  function cancelEdit() {
    setEditable(false);
  }

  // 防止刚打开时即关闭（对标参考 onBeforeClose）
  function handleBeforeClose() {
    const now = Date.now();
    if (now - lastOpenTs.current > 500) {
      onClose();
      setEditable(false);
    }
  }

  // ─── 渲染 ───

  return (
    <Drawer
      title={location.name}
      placement="bottom"
      height="75%"
      open={open}
      onClose={handleBeforeClose}
      destroyOnClose
      styles={{ header: { display: editable ? "block" : "block" } }}
      footer={
        editable ? (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={saving}
              onClick={targetType === "location" ? saveLocation : saveMoment}
            >
              保存
            </Button>
            <Button icon={<CloseOutlined />} onClick={cancelEdit}>
              取消
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex" }}>
            <Popconfirm
              title={`确认删除${location.name}及备注等信息？不可恢复。`}
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button icon={<DeleteOutlined />} danger>
                删除
              </Button>
            </Popconfirm>
            <span style={{ flex: 1 }} />
            <Button
              type={location.checked ? "primary" : "default"}
              icon={location.checked ? <CheckCircleOutlined /> : <StarOutlined />}
              loading={saving}
              onClick={toggleChecked}
            >
              {location.checked ? "已去" : "待去"}
            </Button>
            <Button icon={<CloseOutlined />} onClick={onClose} style={{ marginLeft: 8 }}>
              关闭
            </Button>
          </div>
        )
      }
    >
      {!editable ? (
        /* ─── 查看模式 ─── */
        <div>
          <Descriptions
            column={2}
            size="small"
            title={
              <span>
                {location.name}
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={startEditLocation}
                  style={{ marginLeft: 8 }}
                />
              </span>
            }
            extra={<UploadImage locationId={location.id} type="cover" />}
          >
            <Descriptions.Item span={2}>
              <img
                src={coverUrl}
                alt="封面"
                style={{ width: "100%", minHeight: 225, objectFit: "cover", borderRadius: 8 }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="地址" span={2}>
              {location.address}
            </Descriptions.Item>
            <Descriptions.Item label="经度">
              {location.longitude}
            </Descriptions.Item>
            <Descriptions.Item label="纬度">
              {location.latitude}
            </Descriptions.Item>
            {location.comments && (
              <Descriptions.Item label="备注" span={2}>
                {location.comments}
              </Descriptions.Item>
            )}
          </Descriptions>

          {/* 精彩瞬间时间线 */}
          <Timeline style={{ paddingLeft: 0, marginTop: 16 }}>
            {moments.map((moment) => (
              <Timeline.Item key={moment.id}>
                <Card
                  size="small"
                  title={moment.date}
                  extra={
                    <Space>
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => startEditMoment(moment.id, moment)}
                      />
                      <Popconfirm
                        title={`确认删除${moment.date}的精彩瞬间？不可恢复。`}
                        onConfirm={() => handleDeleteMoment(moment.id)}
                      >
                        <Button type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  }
                >
                  {moment.text}
                </Card>
              </Timeline.Item>
            ))}
          </Timeline>
          <Button
            type="link"
            icon={<PlusOutlined />}
            onClick={startAddMoment}
            style={{ marginTop: 8 }}
          >
            添加记录
          </Button>
        </div>
      ) : targetType === "location" ? (
        /* ─── 编辑位置模式 ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              名称
            </label>
            <Input
              value={locationForm.name}
              onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
              placeholder="位置名称"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              地址
            </label>
            <Input
              value={locationForm.address}
              onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
              placeholder="地址"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              备注
            </label>
            <Input.TextArea
              value={locationForm.comments}
              onChange={(e) => setLocationForm({ ...locationForm, comments: e.target.value })}
              placeholder="备注"
              rows={3}
            />
          </div>
        </div>
      ) : (
        /* ─── 编辑瞬间模式 ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              日期
            </label>
            <Input
              value={momentForm.date}
              onChange={(e) => setMomentForm({ ...momentForm, date: e.target.value })}
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              内容
            </label>
            <Input.TextArea
              value={momentForm.text}
              onChange={(e) => setMomentForm({ ...momentForm, text: e.target.value })}
              placeholder="记录这一刻..."
              rows={3}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "location-drawer" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/location-drawer.tsx
git commit -m "refactor(travel/location-drawer): rewrite as bottom drawer with view/edit/moment tri-mode"
```

---

### Task 5: 修改 search-dialog.tsx — mobile width + 搜索结果样式

**Files:**
- Modify: `app/travel/components/search-dialog.tsx`

**Goal:** `width` 从 600 改为 "90%"；搜索结果列表项紧凑化。

- [ ] **Step 1: 修改 search-dialog.tsx**

```typescript
// app/travel/components/search-dialog.tsx
"use client";

import { Modal, Input, Flex, message, Tag } from "antd";
import { useState, useCallback } from "react";
import { searchPlace } from "../services/amap";
import type { AMapPoiItem } from "../services/amap";

export function SearchDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (location: { name: string; address: string; longitude: number; latitude: number }) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<AMapPoiItem[]>([]);
  const [searching, setSearching] = useState(false);

  const onSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const items = await searchPlace(keyword);
      setResults(items);
    } catch (err: any) {
      message.error("搜索失败: " + err.message);
    } finally {
      setSearching(false);
    }
  }, [keyword]);

  return (
    <Modal title="查询位置" open={open} onCancel={onClose} footer={null} width="90%">
      <Input.Search
        placeholder="选择位置"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onSearch={onSearch}
        loading={searching}
        style={{ marginBottom: 16 }}
      />
      <Flex vertical>
        {results.map((item) => (
          <Flex
            key={item.id}
            justify="space-between"
            align="center"
            style={{
              padding: "12px 0",
              borderBottom: "1px solid rgb(235, 238, 245)",
            }}
          >
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</div>
              <div
                style={{
                  color: "#666",
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.address}
              </div>
            </div>
            <a
              onClick={() =>
                onAdd({
                  name: item.name,
                  address: item.address,
                  longitude: item.longitude,
                  latitude: item.latitude,
                })
              }
              style={{ marginLeft: 12, whiteSpace: "nowrap" }}
            >
              添加
            </a>
          </Flex>
        ))}
      </Flex>
    </Modal>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "search-dialog" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/search-dialog.tsx
git commit -m "refactor(travel/search-dialog): mobile-friendly 90% width, compact result items"
```

---

### Task 7: 重写 layout.tsx — 去掉 Sider，Header + NavDrawer + Context

**Files:**
- Rewrite: `app/travel/layout.tsx`

**Goal:** 去掉 Sider，改为仅 Header + 左侧 NavDrawer + 全宽 Content。Layout 作为 TravelContext.Provider 加载数据。

- [ ] **Step 1: 重写 layout.tsx**

```typescript
// app/travel/layout.tsx
"use client";

import { Layout, Dropdown, Spin, Button } from "antd";
import {
  UnorderedListOutlined,
  MoreOutlined,
  FilterOutlined,
  AimOutlined,
  PlusOutlined,
  CheckOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import type { ReactNode } from "react";
import { useLocations, TravelContext } from "./hooks/use-locations";
import { NavDrawer } from "./components/nav-drawer";

const { Header, Content } = Layout;

function TravelLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 从 URL query 读取 filter
  const filterParam = searchParams.get("filter") as "checked" | "uncheck" | null;
  const filter = filterParam || "all";

  const data = useLocations(filter);

  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  const isMapPage = pathname === "/travel";

  // 下拉菜单项
  const dropdownItems = [
    ...(isMapPage
      ? [
          {
            key: "my-location",
            icon: <AimOutlined />,
            label: "我的位置",
          },
        ]
      : []),
    { key: "all", icon: <FilterOutlined />, label: "显示全部" },
    { key: "checked", icon: <CheckOutlined />, label: "筛选已去" },
    { key: "uncheck", icon: <StarOutlined />, label: "筛选待去" },
    { type: "divider" as const },
    {
      key: "add",
      icon: <PlusOutlined />,
      label: "添加位置",
    },
  ];

  function onDropdownClick(info: { key: string }) {
    switch (info.key) {
      case "my-location":
        router.replace({ pathname, query: { center: "my-location" } });
        break;
      case "all":
        router.replace({ pathname });
        break;
      case "checked":
        router.replace({ pathname, query: { filter: "checked" } });
        break;
      case "uncheck":
        router.replace({ pathname, query: { filter: "uncheck" } });
        break;
      case "add":
        // 通过自定义事件通知页面打开 SearchDialog
        window.dispatchEvent(new CustomEvent("travel:open-search"));
        break;
    }
  }

  return (
    <TravelContext.Provider value={data}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header
          style={{
            background: "#fff",
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid #f0f0f0",
            position: "sticky",
            top: 0,
            zIndex: 100,
            height: 48,
          }}
        >
          <Button
            type="text"
            icon={<UnorderedListOutlined />}
            onClick={() => setNavDrawerOpen(true)}
            size="small"
          />
          <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>旅行计划</span>
          <Dropdown
            menu={{
              items: dropdownItems.map((item) =>
                "type" in item
                  ? item
                  : { key: item.key, icon: item.icon, label: item.label }
              ),
              onClick: onDropdownClick,
            }}
            trigger={["click"]}
          >
            <Button type="text" icon={<MoreOutlined />} size="small">
              选项
            </Button>
          </Dropdown>
        </Header>

        <NavDrawer
          open={navDrawerOpen}
          onClose={() => setNavDrawerOpen(false)}
          summary={data.summary}
        />

        <Content style={{ background: "#fff", minHeight: "calc(100vh - 48px)" }}>
          {data.loading && data.locations.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48 }}>
              <Spin />
            </div>
          ) : (
            children
          )}
        </Content>
      </Layout>
    </TravelContext.Provider>
  );
}

// 外层 wrapper：useSearchParams 需要 Suspense 边界
export default function TravelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Layout style={{ minHeight: "100vh" }}>
          <Header
            style={{
              background: "#fff",
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              height: 48,
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 500 }}>旅行计划</span>
          </Header>
          <Content style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </Content>
        </Layout>
      }
    >
      <TravelLayoutInner>{children}</TravelLayoutInner>
    </Suspense>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "layout.tsx\|CheckCircleOutlined\|StarOutlined" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/layout.tsx
git commit -m "refactor(travel/layout): remove Sider, use Header + NavDrawer + TravelContext pattern"
```

---

### Task 8: 重写 page.tsx — 地图页

**Files:**
- Rewrite: `app/travel/page.tsx`

**Goal:** 去掉浮动操作栏，数据从 TravelContext 消费。地图全屏。Marker 点击打开底部 LocationDrawer。

- [ ] **Step 1: 重写 page.tsx**

```typescript
// app/travel/page.tsx
"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTravelContext } from "./hooks/use-locations";
import { TripMap } from "./components/trip-map";
import { LocationDrawer } from "./components/location-drawer";
import { SearchDialog } from "./components/search-dialog";
import { getCurrentPosition } from "./services/amap";
import type { Location } from "./types";

export default function TravelPage() {
  const router = useRouter();
  const { sortedLocations, add, update, remove } = useTravelContext();

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const mapRef = useRef<any>(null);

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener("travel:open-search", onOpenSearch);
    return () => window.removeEventListener("travel:open-search", onOpenSearch);
  }, []);

  // 监听 "我的位置" 跳转
  useEffect(() => {
    // 当 URL query 中有 center=my-location 时，居中到我的位置
    const url = new URL(window.location.href);
    if (url.searchParams.get("center") === "my-location") {
      getCurrentPosition()
        .then(([lng, lat]) => {
          if (mapRef.current) {
            mapRef.current.setCenter([lng, lat]);
          }
        })
        .catch(() => {});
      // 清除 query 参数
      router.replace("/travel");
    }
  }, [router]);

  const onMarkerClick = useCallback((location: Location) => {
    setSelectedLocation(location);
    setDrawerVisible(true);
  }, []);

  async function onAdd(location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) {
    const newLoc = await add(location);
    setSearchVisible(false);
    setSelectedLocation(newLoc);
    setDrawerVisible(true);
  }

  return (
    <div style={{ position: "relative" }}>
      <TripMap
        ref={mapRef}
        locations={sortedLocations}
        onMarkerClick={onMarkerClick}
        style={{ height: "calc(100vh - 48px)" }}
      />
      <LocationDrawer
        location={selectedLocation}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onUpdate={update}
        onRemove={remove}
      />
      <SearchDialog
        open={searchVisible}
        onClose={() => setSearchVisible(false)}
        onAdd={onAdd}
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "travel/page" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/page.tsx
git commit -m "refactor(travel/page): use TravelContext, full-screen map, bottom LocationDrawer"
```

---

### Task 9: 重写 list/page.tsx — 列表页

**Files:**
- Rewrite: `app/travel/list/page.tsx`

**Goal:** 去掉页面内操作栏，使用紧凑 LocationListItem。数据从 TravelContext 消费。

- [ ] **Step 1: 重写 list/page.tsx**

```typescript
// app/travel/list/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Spin } from "antd";
import { useTravelContext } from "../hooks/use-locations";
import { LocationListItem } from "../components/location-list-item";
import { LocationDrawer } from "../components/location-drawer";
import { SearchDialog } from "../components/search-dialog";
import type { Location } from "../types";

export default function LocationListPage() {
  const { sortedLocations, loading, add, update, remove } = useTravelContext();

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener("travel:open-search", onOpenSearch);
    return () => window.removeEventListener("travel:open-search", onOpenSearch);
  }, []);

  function onLocationClick(location: Location) {
    setSelectedLocation(location);
    setDrawerVisible(true);
  }

  async function onAdd(location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) {
    const newLoc = await add(location);
    setSearchVisible(false);
    setSelectedLocation(newLoc);
    setDrawerVisible(true);
  }

  return (
    <div>
      {loading && sortedLocations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : sortedLocations.length === 0 ? (
        <div style={{ color: "#999", textAlign: "center", padding: 48 }}>暂无位置</div>
      ) : (
        sortedLocations.map((location) => (
          <LocationListItem
            key={location.id}
            location={location}
            onClick={onLocationClick}
          />
        ))
      )}

      <LocationDrawer
        location={selectedLocation}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onUpdate={update}
        onRemove={remove}
      />

      <SearchDialog
        open={searchVisible}
        onClose={() => setSearchVisible(false)}
        onAdd={onAdd}
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "travel/list" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/list/page.tsx
git commit -m "refactor(travel/list): use TravelContext, compact LocationListItem, bottom drawer"
```

---

### Task 6: 调整 trip-map.tsx — ref 转发 + 高度参数

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

**Goal:** 支持 `ref` 转发（让 page.tsx 能调用 `setCenter`）+ 支持 `style` prop 覆盖高度。

- [ ] **Step 1: 修改 trip-map.tsx**

```typescript
// app/travel/components/trip-map.tsx
"use client";

import { forwardRef, useImperativeHandle, useEffect, useRef, useCallback, CSSProperties } from "react";
import { loadAmap } from "../services/amap";
import type { Location } from "../types";

export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void },
  {
    locations: Location[];
    onMarkerClick: (location: Location) => void;
    style?: CSSProperties;
  }
>(function TripMap({ locations, onMarkerClick, style }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useImperativeHandle(ref, () => ({
    setCenter(pos: [number, number]) {
      if (mapRef.current) {
        mapRef.current.setCenter(pos);
        mapRef.current.setZoom(15);
      }
    },
  }));

  const createMap = useCallback(async () => {
    if (!containerRef.current) return;
    const AMap = await loadAmap();

    const centerStr = localStorage.getItem("TRAVEL_MAP_CENTER");
    const zoomStr = localStorage.getItem("TRAVEL_MAP_ZOOM");
    const center = centerStr ? JSON.parse(centerStr) : [116.397477, 39.908692];
    const zoom = zoomStr ? JSON.parse(zoomStr) : 13;

    const map = new AMap.Map(containerRef.current, {
      zoom,
      center,
      resizeEnable: true,
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      localStorage.setItem("TRAVEL_MAP_CENTER", JSON.stringify([c.lng, c.lat]));
    });
    map.on("zoomend", () => {
      localStorage.setItem("TRAVEL_MAP_ZOOM", JSON.stringify(map.getZoom()));
    });

    mapRef.current = map;
  }, []);

  useEffect(() => {
    createMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [createMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    markersRef.current.forEach((m) => mapRef.current.remove(m));
    markersRef.current = [];

    for (const loc of locations) {
      const marker = new AMap.Marker({
        position: [loc.longitude, loc.latitude],
        title: loc.name,
        label: {
          content: loc.name,
          offset: new AMap.Pixel(0, -30),
        },
      });
      marker.on("click", () => onMarkerClick(loc));
      mapRef.current.add(marker);
      markersRef.current.push(marker);
    }
  }, [locations, onMarkerClick]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "calc(100vh - 64px)", ...style }}
    />
  );
});
```

- [ ] **Step 2: 验证 TypeScript 无错误**

Run: `npx tsc --noEmit 2>&1 | grep -i "trip-map" | head -5`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "refactor(travel/trip-map): forwardRef for setCenter, accept style prop for height"
```

---

### Task 10: 删除旧文件 + 清理

**Files:**
- Delete: `app/travel/locations/[id]/page.tsx`
- Delete: `app/travel/components/location-card.tsx`
- Delete: `app/travel/components/location-list.tsx`

**Goal:** 删除已被替代的组件和路由页面。

- [ ] **Step 1: 删除旧文件**

```bash
rm app/travel/locations/\[id\]/page.tsx
rm app/travel/components/location-card.tsx
rm app/travel/components/location-list.tsx
```

- [ ] **Step 2: 清理空目录**

```bash
# 如果 locations/[id] 目录已空，删除它
rmdir app/travel/locations/\[id\] 2>/dev/null
rmdir app/travel/locations 2>/dev/null
```

- [ ] **Step 3: 验证 TypeScript 无导入错误**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No output (no errors)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(travel): remove deprecated location-card, location-list, and locations/[id] page"
```

---

### Task 11: 端到端验证

**Files:**
- None (manual verification + type check)

**Goal:** 确保所有文件无 TypeScript 错误，构建通过。

- [ ] **Step 1: 全量 TypeScript 检查**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 2: 构建检查**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds without errors

- [ ] **Step 3: 启动开发服务器验证**

Run: `pnpm dev`

Manual checks:
1. 导航到 `/travel` — 确认无侧边栏，Header 有"选项"下拉按钮，地图全屏
2. 点击 Header 左侧图标 — 确认左侧导航抽屉滑出，显示菜单 + 统计面板
3. 点击"收藏夹" — 确认切换到 `/travel/list`，显示紧凑列表项
4. 点击列表项 — 确认底部 Drawer (75%) 滑出，显示位置详情
5. 在 Drawer 中点击"编辑" — 确认切换为编辑表单，可保存
6. 在 Drawer 中点击"添加记录" — 确认切换为瞬间编辑模式
7. 点击 Header "选项" → "筛选已去" — 确认列表只显示已去位置
8. 在地图页点击 marker — 确认底部 Drawer 打开
9. 在地图页点击"选项" → "添加位置" — 确认搜索对话框打开（90%宽度）
10. 搜索位置并添加 — 确认添加后打开底部 Drawer 显示详情

- [ ] **Step 4: 如有问题，修复后 commit**

```bash
git add -A
git commit -m "fix(travel): adjustments from mobile redesign smoke test"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ use-locations.ts modification → Task 1
- ✅ nav-drawer.tsx creation → Task 2
- ✅ location-list-item.tsx creation → Task 3
- ✅ location-drawer.tsx rewrite (tri-mode) → Task 4
- ✅ search-dialog.tsx modification → Task 5
- ✅ trip-map.tsx adjustments → Task 6
- ✅ layout.tsx rewrite → Task 7
- ✅ page.tsx (map) rewrite → Task 8
- ✅ list/page.tsx rewrite → Task 9
- ✅ Delete old files → Task 10
- ✅ End-to-end verification → Task 11
- ✅ TravelContext data sharing pattern → Task 1 + consumed in Tasks 7-9
- ✅ URL query filter → Task 7 (layout reads searchParams)
- ✅ Bottom drawer tri-mode → Task 4
- ✅ Header Dropdown → Task 7

**2. Placeholder scan:**
- No TBD / TODO / "implement later"
- No vague "add error handling" — all async functions have try/catch
- No "write tests for the above" without code
- All code blocks complete and copy-pasteable

**3. Type consistency:**
- `TravelData` type in Task 1 matches consumption in Tasks 7-9
- `useTravelContext()` exported from Task 1, used in Tasks 8, 9
- `LocationDrawer` props match across Tasks 4, 8, 9
- `NavDrawer` props match across Tasks 2, 7
- `LocationListItem` props match across Tasks 3, 9
- `TripMap` forwardRef pattern matches usage in Task 8
