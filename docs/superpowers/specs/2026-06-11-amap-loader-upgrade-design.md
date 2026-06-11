# 高德地图加载方式升级设计

**日期**: 2026-06-11
**状态**: 已批准

## 目标

将旅行模块的地图 SDK 加载方式从手动 `<script>` 标签注入升级为官方推荐的 `@amap/amap-jsapi-loader` npm 包 + JS API v2.0。

## 动机

- 当前使用 v1.4.15 + 手动 script 注入，非官方推荐方式
- 官方推荐 `@amap/amap-jsapi-loader` + v2.0，支持安全密钥机制
- 升级后可获得 v2.0 的性能改进和新特性

## 不改动的部分

- **功能集不变**：地点搜索、GPS 定位、逆地理编码、省份列表查询、地图展示+标记全部保留
- **对外 API 签名不变**：`amap.ts` 中所有导出函数的签名保持兼容
- **组件接口不变**：`TripMap`、`SearchPopup` 的 props/signature 不变
- **`page.tsx`**、**`search-popup.tsx`**：无需修改

## 改动文件

### 1. `package.json` — 新增依赖

```
@amap/amap-jsapi-loader: 最新稳定版
```

### 2. `.env.example` — 新增环境变量

```diff
 # ─── 高德地图（旅行模块定位/搜索） ──────────────────
 NEXT_PUBLIC_AMAP_KEY=
+NEXT_PUBLIC_AMAP_SECRET=
```

### 3. `app/travel/services/amap.ts` — 核心重写

**加载方式变更：**

- 移除手动创建 `<script>` 标签的逻辑（`createElement("script")`、`appendChild`）
- 移除 `amapPromise` 缓存变量和 `AMAP_SCRIPT_URL` 常量
- 改用 `AMapLoader.load()` 加载

**`loadAmap()` 新实现：**

```
1. 检查 SSR → reject
2. 如果 window.AMap 已存在 → 直接返回
3. 设置 window._AMapSecurityConfig = { securityJsCode: getAmapSecret() }
4. 调用 AMapLoader.load({ key, version: "2.0", plugins: [...] })
5. 返回 Promise<AMap>
```

**插件列表调整：**

```diff
- AMap.Driving,AMap.PlaceSearch,AMap.DistrictSearch,AMap.Geolocation,AMap.Geocoder
+ AMap.PlaceSearch,AMap.DistrictSearch,AMap.Geolocation,AMap.Geocoder
```
移除 `AMap.Driving` — 代码中从未使用。

**不变的部分：**
- `getAmapKey()` — 保留
- `searchPlace()`、`getCurrentPosition()`、`reverseGeocode()`、`getProvinceOptions()` — 签名和内部逻辑完全不变（都通过 `loadAmap()` 获取 AMap 对象）
- `AMapPoiItem`、`AMapDistrictItem` 类型 — 保留

**新增：**
- `getAmapSecret()` — 从 `NEXT_PUBLIC_AMAP_SECRET` 环境变量读取安全密钥

### 4. `app/travel/components/trip-map.tsx` — 微调

- `createMap()` 内部：移除直接从 `(window as any).AMap` 读取的方式，改为通过 `loadAmap()` 返回值
- 标记管理的 `useEffect`：AMap 引用改为从 `loadAmap()` 获取

## 风险点

| 风险 | 缓解 |
|------|------|
| v2.0 API 与 v1.4.15 不兼容 | 使用的 PlaceSearch / Geolocation / Geocoder / DistrictSearch 为稳定插件，v2.0 向下兼容 |
| 安全密钥配置错误导致加载失败 | 本地 `.env` 已有对应密钥；提示用户确保 `.env` 中同时设置了 KEY 和 SECRET |
| `AMapLoader.load()` 行为与手动 script 不同 | 官方 loader 同样挂载 `window.AMap`，现有代码兼容 |

## 测试验证

1. `npm run dev` 启动后访问 `/travel` 页面
2. 验证地图正常加载显示
3. 验证搜索弹窗能正常搜索地点
4. 验证"我的位置"定位功能正常
5. 验证省份列表正常加载
