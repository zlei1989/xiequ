# 旅行模块 — 筛选图标分离设计

**日期：** 2026-06-24
**范围：** `app/travel/components/shell.tsx`

## 目标

将"显示全部/筛选已去/筛选待去"从右上角"更多"按钮的 ActionSheet 中分离出来，新增独立的筛选图标（FilterOutline），放在"更多"按钮左侧。两个图标用 `Space` 包裹。筛选交互使用独立 ActionSheet，视觉和交互风格与现有"更多"保持一致。

## 适用范围

| Tab | 筛选图标 | 更多图标 |
|-----|---------|---------|
| 地图 `/travel` | ✅ 显示 | 概览、添加位置、我的位置 |
| 收藏 `/travel/favourites` | ✅ 显示 | 概览、添加位置 |
| 路线 `/travel/routes` | ❌ 隐藏 | 概览（不变） |

## 组件结构变更

### 文件：`app/travel/components/shell.tsx`

```
当前 NavBar right：
  <MoreOutline />

改后 NavBar right：
  <Space>
    {pathname !== '/travel/routes' && (
      <FilterOutline onClick={开筛选 ActionSheet} />
    )}
    <MoreOutline onClick={开更多 ActionSheet} />
  </Space>
```

### 两个 ActionSheet

| 触发 | 内容 |
|------|------|
| 筛选图标 | 显示全部、筛选已去、筛选待去 |
| 更多图标 | 概览、添加位置、(地图 Tab: 我的位置) |

原有三个筛选项从"更多" ActionSheet 的 `actions` 数组中移除。

## 图标状态

| 筛选状态 | 样式 | 含义 |
|----------|------|------|
| 全部（默认） | `FilterOutline` 默认色 | 无筛选 |
| 已去 / 待去 | `FilterOutline` 变蓝 (`--adm-color-primary`) | 筛选激活中 |

不切换图标类型，仅通过颜色区分，避免布局抖动。

## 筛选逻辑

筛选通过 URL 参数 `?filter=checked` / `?filter=uncheck` 驱动，与现有机制一致：

| 用户操作 | 行为 |
|----------|------|
| 显示全部 | `router.replace(pathname)` — 清除 filter 参数 |
| 筛选已去 | `router.replace(\`${pathname}?filter=checked\`)` |
| 筛选待去 | `router.replace(\`${pathname}?filter=uncheck\`)` |

`layout.tsx` 中 `useSearchParams` → `useLocations(filter)` 链路**不变**。

## 状态管理

- 新增 `filterVisible` state 控制筛选 ActionSheet 显隐
- 与现有 `actionVisible`（更多 ActionSheet）各自独立，不互斥
- 从 URL `searchParams` 读取当前 `filter` 值判断图标是否高亮

## 不影响的部分

- `app/travel/layout.tsx` — 无需改动
- `app/travel/hooks/use-locations.ts` — 无需改动
- `app/travel/page.tsx` — 无需改动
- `app/travel/(subpages)/favourites/page.tsx` — 无需改动
- `app/travel/(subpages)/routes/page.tsx` — 无需改动
- `app/travel/lib/filter-locations.ts` — 无需改动
- 所有测试文件 — 无需改动

## 测试要点

- [ ] 地图 Tab：筛选图标可见，点击弹出 ActionSheet 含三个选项
- [ ] 收藏 Tab：筛选图标可见
- [ ] 路线 Tab：筛选图标隐藏，更多只含"概览"
- [ ] 选择"显示全部"：URL 清除 filter 参数，图标恢复默认色
- [ ] 选择"筛选已去"：URL 设为 `?filter=checked`，图标变蓝，列表只显示已打卡位置
- [ ] 选择"筛选待去"：URL 设为 `?filter=uncheck`，图标变蓝，列表只显示未打卡位置
- [ ] 页面刷新后筛选状态保持（URL 参数持久化）
- [ ] 更多 ActionSheet 不再包含筛选项
