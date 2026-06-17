# 路线页搜索功能 — 设计文档

**日期**: 2025-06-17  
**范围**: 旅行模块路线页面  
**对标**: 收藏页搜索功能

---

## 目标

在路线页面 (`/travel/routes`) 增加搜索框，支持按关键字模糊筛选包含匹配地点的路线。

## 范围

- 匹配字段：`route.markers` 中任意 `RouteMarker.name`（小写模糊匹配）
- 不匹配：`startName`、`endName`、日期范围等
- 搜索框位置：列表顶部 sticky，对标收藏页
- 空状态：无匹配时显示 `暂无搜索结果` 提示

## 改动清单

### 新增

| 文件 | 说明 |
|------|------|
| `app/travel/lib/filter-routes.ts` | 纯函数，按关键字过滤路线列表。对标 `filter-locations.ts`，区别在于匹配字段改为 `route.markers[].name` |

### 修改

| 文件 | 改动 |
|------|------|
| `app/travel/(subpages)/routes/page.tsx` | 引入 `SearchBar`/`useMemo`/`filterRoutes`、新增 `searchText` 状态、`filteredRoutes` 计算、sticky 搜索框渲染、空搜索结果状态 |

## API

```ts
/** 按关键字过滤路线列表（匹配 markers 中的地点名） */
function filterRoutes(routes: Route[], keyword: string): Route[]
```

- 空关键字返回原数组
- 大小写不敏感
- 纯函数，无副作用

## 交互

1. 用户输入关键字 → 列表实时筛选
2. 清空关键字 → 恢复完整列表
3. 无匹配结果 → 显示 `ErrorBlock` 空状态文案"暂无搜索结果"

## 测试

- `filter-routes.test.ts`：覆盖空关键字、精确匹配、模糊匹配、无匹配、大小写不敏感
- 对标 `__tests__/travel/filter-locations.test.ts` 的测试模式
