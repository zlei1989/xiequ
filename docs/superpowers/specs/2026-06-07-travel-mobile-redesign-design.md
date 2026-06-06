# Travel 模块移动端重构 Design Spec

> **Reference:** `D:/workspace/自动浇花系统/service/packages/7qb-client/src/views/trip-plan/` — Vue/Element Plus 实现。本设计将其翻译为 Next.js + Ant Design 6 + React 19。

**Goal:** 将 travel 模块从桌面端侧边栏布局改造为移动端优先布局，对标 7qb-client trip-plan 的交互模式。

**Tech Stack:** Next.js App Router, React 19, Ant Design 6, TypeScript

---

## Architecture Overview

```
┌──────────────────────────────┐
│  Header（sticky top, 48px）   │
│  ☰ ← 旅行计划      [选项▼]   │
├──────────────────────────────┤
│                              │
│  ← NavDrawer (left, 75%)     │
│    · 地图                    │
│    · 收藏夹                  │
│    · 统计面板                │
│                              │
│  内容区（全宽）               │
│  - /travel → 满屏地图         │
│  - /travel/list → 紧凑列表    │
│                              │
│  ← LocationDrawer (bottom,   │
│     75%) 位置详情/编辑/瞬间   │
└──────────────────────────────┘
```

### Key Design Decisions

1. **对标参考代码**：所有交互模式严格对标 7qb-client trip-plan
2. **Layout**：去掉永久侧边栏，改为 Header + 左侧滑出导航抽屉
3. **位置详情**：底部 Drawer (75%) 替代独立详情页，内置查看/编辑双模式
4. **操作入口**：Header 右侧 Dropdown 下拉菜单收纳所有操作
5. **列表风格**：紧凑列表项（li 模式），无 Card 边框

---

## Component Tree

```
app/travel/layout.tsx
├── Header
│   ├── PageHeader back icon → opens NavDrawer
│   ├── Title: "旅行计划"
│   └── extra: Dropdown "选项"
├── NavDrawer (left, 75%)
│   ├── Menu: 地图 / 收藏夹
│   ├── Statistics: 已去 / 待去 / 总计
│   └── Progress bar
└── Content
    ├── page.tsx (map view)
    │   ├── TripMap (full height)
    │   ├── LocationDrawer (bottom, 75%)
    │   └── SearchDialog (90% width)
    └── list/page.tsx (list view)
        ├── LocationListItem[] (compact li)
        ├── LocationDrawer (bottom, 75%)
        └── SearchDialog (90% width)
```

### LocationDrawer Modes

```
LocationDrawer (bottom, 75%)
├── View Mode (default)
│   ├── LocationDescriptions
│   │   ├── Cover image
│   │   ├── Address, coordinates, comments
│   │   └── Edit button
│   ├── Timeline (moments)
│   │   ├── TimelineItem[] (date + card + edit/delete)
│   │   └── "添加记录" button → switches to MomentForm
│   └── Footer: [Delete] ---spacer--- [已去/待去] [Close]
├── Edit Mode (location)
│   ├── LocationForm (name, address, comments Inputs)
│   └── Footer: [Save] [Cancel]
└── Edit Mode (moment)
    ├── MomentForm (date, text)
    └── Footer: [Save] [Cancel]
```

---

### 0. `app/travel/hooks/use-locations.ts` — Modify

**Change:** Externalize filter control for URL query param integration.

- Add `filter` parameter: `useLocations(filter?: "all" | "checked" | "uncheck")`
- Remove internal `setFilter` — filter is derived from URL query params via `useSearchParams()`
- `summary` now computes against ALL locations (not just filtered), matching reference behavior
- Export a `TravelContext` from layout so pages don't re-fetch data

**Data sharing pattern:**
- Layout calls `useLocations()`, provides data via React Context (`TravelContext`)
- Pages consume context — no duplicate API calls on navigation
- Context provides: `locations`, `sortedLocations`, `summary`, `loading`, `add`, `update`, `remove`

### 1. `app/travel/layout.tsx` — Rewrite

**Remove:** `Sider` component and `Menu` items.
**Add:** `NavDrawer` trigger via PageHeader back icon, `Dropdown` in header extra, `TravelContext.Provider`.

- Header: `<PageHeader>` with back icon (opens NavDrawer) + title "旅行计划" + extra Dropdown
- No permanent sidebar — content is full-width
- NavDrawer: `<Drawer placement="left" width="75%">` with menu items (地图/收藏夹) + statistics panel
- Statistics panel shows: 已去数 / 待去数 / 总计 + progress bar
- Location data loaded at layout level (via `useLocations` hook), passed to pages via `TravelContext.Provider`
- Filter param read from `useSearchParams()` — layout re-filters when query changes

**States:**
- Loading: layout shows Spin while locations load
- Loaded: renders children with data context
- Empty: statistics show all zeros

### 2. `app/travel/page.tsx` — Rewrite (Map View)

**Remove:** Floating filter Select + buttons on map.
**Move to Header Dropdown:** "选项" dropdown items:
- 我的位置 (only on map page)
- 显示全部
- 筛选已去
- 筛选待去
- 添加位置

Filter state: use URL query param `?filter=uncheck|checked` (对标 reference route params). "显示全部" removes the param.

Data from `TravelContext` (no independent fetch). Map reads `sortedLocations` from context.

Map height: `calc(100vh - 48px)` (full height minus sticky header).

On marker click: open LocationDrawer (bottom, 75%).

**States:**
- Loading: Spin overlay on map while AMap initializes
- Loaded: map with markers
- Empty: map with no markers
- Error: console.error, map shows without markers

### 3. `app/travel/list/page.tsx` — Rewrite (List View)

**Remove:** Page-level Select + buttons bar, `<LocationList>` → `<LocationCard>`.

**Replace with:**
- Data from `TravelContext` (no independent fetch)
- Compact `LocationListItem` components (no Card wrapper)
- Header Dropdown items (same as map, minus "我的位置")
- On row click: open LocationDrawer (bottom, 75%)

**States:**
- Loading: Spin centered
- Loaded: list items
- Empty: "暂无位置" message

### 4. `app/travel/components/location-drawer.tsx` — Rewrite

**Change:** From `<Drawer width={400}>` (right side) to `<Drawer placement="bottom" height="75%">`.

**Add:** Mode switching pattern (对标 Reference LocationDrawer.vue):
- `editable`: boolean state
- `targetType`: `'location' | 'moment'`

**View Mode:**
- Cover image (via `getCoverUrl` from OSS service)
- Descriptions: address, longitude, latitude, comments (using Ant Design `<Descriptions>`)
- Edit button next to title
- Timeline of moments:
  - Each item: `<Timeline.Item>` with `<Card size="small">` containing text + edit/delete links
  - Upload photo button per moment (disabled for now, matches reference)
- "添加记录" link button → enters moment edit mode

**Edit Mode (location):**
- Form: name Input, address Input, comments Input.TextArea
- Footer: [保存] [取消]

**Edit Mode (moment):**
- Form: date Input (YYYY-MM-DD), text Input.TextArea
- Footer: [保存] [取消]
- `MomentForm` component reused here

**Footer (view mode):**
- Left: Delete button with Popconfirm
- Center: flex-spacer
- Right: 已去/待去 toggle button + 关闭 button

**States:**
- No content: returns null
- View mode: descriptions + timeline
- Edit location: location form
- Edit moment: moment form
- Loading: buttons show loading state during API calls
- Error: message.error on failures

### 5. `app/travel/components/location-list-item.tsx` — New

**Pattern:** Matches Reference `LocationList.vue` `<li>` style.

```
┌──────────────────────────────────────┐
│ ┌────┐                               │
│ │封面│  位置名称                      │
│ │48px│  地址文本（超长 ellipsis）     │
│ └────┘                        [已去] │
│──────────────────────────────────────│  ← border-bottom: 1px solid #ebedf5
```

- Avatar: 48x48 circle, `object-fit: cover`, source from OSS icon URL
- Name: 14px, font-weight 500
- Address: 13px, color #999, `text-overflow: ellipsis`, max-width limit
- Tag: `color="green"` for 已去, `color="blue"` for 待去 (Ant Design Tag)
- Click: whole row clickable, `cursor: pointer`
- Padding: 16px 20px

**States:**
- Normal: displays name + address + tag
- Missing avatar: show default placeholder
- Long address: truncated with ellipsis
- Clicked: opens LocationDrawer

### 6. `app/travel/components/nav-drawer.tsx` — New

**Content:**
- Menu items:
  - 地图 (MapLocation icon) → push `/travel`
  - 收藏夹 (Collection icon) → push `/travel/list`
  - 行程 (Tickets icon, disabled — matches reference)
- Statistics panel (footer):
  - Row: 已去 count / 待去 count / 总计 count
  - Progress bar: checked percentage

**Data:** Receives `locations` array and `summary` object from layout/parent.

**States:**
- Open/close via `open` prop
- Active menu item highlighted based on current pathname

### 7. `app/travel/components/search-dialog.tsx` — Modify

**Change:** `width={600}` → `width="90%"` (percentage for mobile).

**搜索结果样式对齐:** Use compact list item style matching `location-list-item`.

**States:**
- Closed: not rendered
- Open, idle: search input visible
- Searching: input loading spinner
- Results: compact list of POIs with "添加" link
- Empty results: no results message (handled by Ant Design Select)
- Error: message.error

### 8. `app/travel/locations/[id]/page.tsx` — Delete

All functionality moved into `LocationDrawer`. This route file is removed. Any existing bookmarks to `/travel/locations/[id]` will 404; no redirect is added (traffic to these URLs is expected to be zero after the drawer-based UX ships).

### 9. `app/travel/components/location-card.tsx` — Delete

Replaced by `location-list-item.tsx`.

### 10. `app/travel/components/location-list.tsx` — Delete

List rendering is handled directly in `list/page.tsx` — no separate wrapper component needed.

---

## Data Flow

```
Layout (TravelContext.Provider)
├── useLocations() loads all data on mount
├── Reads filter from useSearchParams() query param
├── computes sortedLocations (filtered subset)
├── computes summary (against ALL non-deleted locations)
├── Provides via TravelContext: { locations, sortedLocations, summary, loading, add, update, remove }
│
├── NavDrawer ← summary from context
├── Map Page ← sortedLocations from context
│   ├── TripMap ← sortedLocations (for markers)
│   ├── LocationDrawer ← selected location + add/update/remove from context
│   └── SearchDialog ← locations list + add from context
└── List Page ← sortedLocations from context
    ├── LocationListItem[] ← sortedLocations
    ├── LocationDrawer ← selected location + add/update/remove from context
    └── SearchDialog ← locations list + add from context
```

**Context pattern:** Layout is the single data owner. Pages consume via `useContext(TravelContext)` — no duplicate API calls when navigating between /travel and /travel/list.

**Filter flow:**
1. User clicks Dropdown item (e.g. "筛选已去")
2. `router.replace({ pathname, query: { filter: 'checked' } })` — URL query param changes
3. Layout reads new `searchParams.filter`, `useLocations` re-computes `sortedLocations`
4. Context value updates → pages re-render with new filtered data

**CRUD flow:**
- Add: SearchDialog → `add()` from context → API call → push to locations[] → open LocationDrawer
- Update: LocationDrawer → form save → `update()` from context → API call → mutate location in array
- Toggle checked: LocationDrawer footer button → `update()` → API call → mutate checked field
- Delete: LocationDrawer → Popconfirm → `remove()` → API call → mark deleted → close drawer
- Moment CRUD: LocationDrawer → MomentForm / inline edit → `useMoments` hook → API call → mutate moments array in location

---

## Error Handling

- All async operations wrapped in try/catch
- API errors surfaced via `message.error(err.message)`
- Network failures: show error message, keep UI in current state
- Map initialization failure: show error message (AMap SDK 加载失败)
- Image upload failure: message.error, no crash
- Duplicate add prevention: buttons show loading state during API calls

---

## Route Design

| Route | Purpose | Changes |
|-------|---------|---------|
| `/travel` | Map view (default) | Rewrite page |
| `/travel?filter=uncheck` | Map, filter unchecked | New (query param) |
| `/travel?filter=checked` | Map, filter checked | New (query param) |
| `/travel/list` | List view | Rewrite page |
| `/travel/list?filter=uncheck` | List, filter unchecked | New (query param) |
| `/travel/list?filter=checked` | List, filter checked | New (query param) |
| `/travel/locations/[id]` | ~~Detail page~~ | **Deleted** |

---

## Component Dependencies

Each component's dependencies:

- **layout.tsx** → antd (Layout, Drawer, Menu, Progress, Row, Col, Statistic), @ant-design/icons, next/navigation, useLocations, TravelContext, NavDrawer
- **nav-drawer.tsx** → antd (Drawer, Menu, Progress, Row, Col, Statistic), @ant-design/icons, next/navigation, types
- **page.tsx (map)** → antd (Drawer), TripMap, LocationDrawer, SearchDialog, TravelContext (via useContext), types
- **list/page.tsx** → antd (Spin), LocationListItem, LocationDrawer, SearchDialog, TravelContext (via useContext), types
- **location-drawer.tsx** → antd (Drawer, Descriptions, Tag, Button, Input, Popconfirm, Timeline, Card, message), UploadImage, MomentForm, types, oss service
- **location-list-item.tsx** → antd (Tag), types, oss service
- **search-dialog.tsx** → antd (Modal, Input, message), amap service
- **trip-map.tsx** → (unchanged except height) amap service, types
- **moment-form.tsx** → (minor style tweaks for drawer context)
- **upload-image.tsx** → (unchanged)
