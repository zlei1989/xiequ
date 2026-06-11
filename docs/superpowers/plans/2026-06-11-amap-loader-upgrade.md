# 高德地图加载方式升级 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将旅行模块高德地图 SDK 加载方式从手动 script 注入升级为 `@amap/amap-jsapi-loader` + JS API v2.0，功能不变

**Architecture:** 重写 `services/amap.ts` 的加载层（`loadAmap`），用 `AMapLoader.load()` 替代手动 script 标签注入；其余 5 个导出函数和 2 个类型签名不变；`trip-map.tsx` 无需改动（`AMapLoader.load()` 同样挂载 `window.AMap`）

**Tech Stack:** `@amap/amap-jsapi-loader`, AMap JS API v2.0, React 19 + Next.js 16

---

### Task 1: 安装 @amap/amap-jsapi-loader

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

```bash
npm install @amap/amap-jsapi-loader --save
```

- [ ] **Step 2: 确认 package.json 更新**

```bash
node -e "const p = require('./package.json'); console.log(p.dependencies['@amap/amap-jsapi-loader'] ? 'OK: installed' : 'FAIL')"
```
Expected: `OK: installed`

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add @amap/amap-jsapi-loader dependency"
```

---

### Task 2: 新增环境变量 NEXT_PUBLIC_AMAP_SECRET

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 在 .env.example 中添加安全密钥变量**

Edit `.env.example`，在高德地图配置段添加一行：

```diff
 # ─── 高德地图（旅行模块定位/搜索） ──────────────────
 NEXT_PUBLIC_AMAP_KEY=
+NEXT_PUBLIC_AMAP_SECRET=
```

- [ ] **Step 2: 确认变更**

```bash
grep "NEXT_PUBLIC_AMAP_SECRET" .env.example
```
Expected: 输出包含 `NEXT_PUBLIC_AMAP_SECRET=`

- [ ] **Step 3: 提交**

```bash
git add .env.example
git commit -m "chore: add NEXT_PUBLIC_AMAP_SECRET to .env.example"
```

---

### Task 3: 重写 amap.ts 加载层

**Files:**
- Modify: `app/travel/services/amap.ts`（完整重写）

- [ ] **Step 1: 用以下完整内容覆盖 amap.ts**

```typescript
/**
 * 高德地图 SDK 封装
 *
 * 负责：
 * - 地图加载（@amap/amap-jsapi-loader）
 * - 位置搜索（PlaceSearch）
 * - GPS 定位（Geolocation）
 * - 地理编码（Geocoder）
 * - 行政区查询（DistrictSearch）
 *
 * 环境变量：NEXT_PUBLIC_AMAP_KEY, NEXT_PUBLIC_AMAP_SECRET
 */

import AMapLoader from "@amap/amap-jsapi-loader";

export function getAmapKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_KEY || "";
}

export function getAmapSecret(): string {
  return process.env.NEXT_PUBLIC_AMAP_SECRET || "";
}

// 地图 SDK 加载 Promise（防止重复加载）
let amapPromise: Promise<any> | null = null;

/**
 * 动态加载高德地图 SDK（基于 @amap/amap-jsapi-loader）
 */
export function loadAmap(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("AMap only works in browser"));
  }
  if ((window as any).AMap) {
    return Promise.resolve((window as any).AMap);
  }
  if (amapPromise) {
    return amapPromise;
  }

  const secret = getAmapSecret();
  if (secret) {
    (window as any)._AMapSecurityConfig = {
      securityJsCode: secret,
    };
  }

  amapPromise = AMapLoader.load({
    key: getAmapKey(),
    version: "2.0",
    plugins: [
      "AMap.PlaceSearch",
      "AMap.DistrictSearch",
      "AMap.Geolocation",
      "AMap.Geocoder",
    ],
  });

  return amapPromise;
}

/**
 * 搜索地点
 */
export async function searchPlace(address: string, city?: string): Promise<AMapPoiItem[]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const searcher = new AMap.PlaceSearch({
      children: 1,
      pageSize: 48,
      city: city || "全国",
    });
    searcher.search(address, (status: string, result: any) => {
      if (status !== "complete" || !result.poiList) {
        return reject(new Error(`搜索失败: ${status}`));
      }
      const items: AMapPoiItem[] = [];
      for (const poi of result.poiList.pois) {
        if (!poi.address || !poi.location) continue;
        items.push({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          longitude: poi.location.lng,
          latitude: poi.location.lat,
        });
      }
      resolve(items);
    });
  });
}

/**
 * 获取当前位置
 */
export async function getCurrentPosition(): Promise<[number, number]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const geolocation = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    geolocation.getCurrentPosition();
    AMap.event.addListener(geolocation, "complete", (result: any) => {
      resolve([result.position.lng, result.position.lat]);
    });
    AMap.event.addListener(geolocation, "error", () => {
      reject(new Error("定位失败"));
    });
  });
}

/**
 * 逆地理编码：坐标 → 完整地址
 */
export async function reverseGeocode(position: [number, number]): Promise<string> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const geocoder = new AMap.Geocoder({ radius: 1, extensions: "all" });
    geocoder.getAddress(position, (status: string, result: any) => {
      if (status !== "complete" || result.info !== "OK") {
        return reject(new Error("逆地理编码失败"));
      }
      const comp = result.regeocode.addressComponent;
      resolve([comp.province, comp.city, comp.district, result.regeocode.formattedAddress].filter(Boolean).join(" "));
    });
  });
}

/**
 * 获取省份列表
 */
export async function getProvinceOptions(): Promise<AMapDistrictItem[]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const district = new AMap.DistrictSearch({ subdistrict: 1, showbiz: false });
    district.search("中国", (status: string, result: any) => {
      if (status !== "complete") return reject(new Error("获取省份失败"));
      const items: AMapDistrictItem[] = [];
      for (const obj of result.districtList[0].districtList) {
        items.push({
          adcode: obj.adcode,
          name: obj.name,
          longitude: obj.center.lng,
          latitude: obj.center.lat,
        });
      }
      resolve(items);
    });
  });
}

// 类型定义
export type AMapPoiItem = {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
};

export type AMapDistrictItem = {
  adcode: string;
  name: string;
  longitude: number;
  latitude: number;
};
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
npx tsc --noEmit app/travel/services/amap.ts
```
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
git add app/travel/services/amap.ts
git commit -m "refactor(amap): switch from manual script injection to @amap/amap-jsapi-loader"
```

---

### Task 4: 验证 trip-map.tsx 兼容性

**Files:**
- 不修改：`app/travel/components/trip-map.tsx`（兼容性验证即可）

- [ ] **Step 1: 确认 trip-map.tsx 无需改动**

`AMapLoader.load()` 加载完成后会自动设置 `window.AMap`，因此 `trip-map.tsx` 中两处使用模式均兼容：

- 第一处（`useEffect` 初始化）：`const AMap = await loadAmap()` — 返回 AMap 对象，`new AMap.Map()` 正常创建
- 第二处（标记管理）：`const AMap = (window as any).AMap` — 此时 SDK 已加载，`window.AMap` 已存在，同步读取安全

无需修改此文件。

- [ ] **Step 2: 提交（空提交，记录验证结论）**

```bash
git commit --allow-empty -m "chore: verify trip-map.tsx compatibility with AMapLoader"
```

---

### Task 5: 构建验证

- [ ] **Step 1: 生产构建**

```bash
npm run build
```
Expected: 构建成功，无错误

- [ ] **Step 2: 确认 standalone 部署目录包含 amap-jsapi-loader**

```bash
ls .next/standalone/node_modules/@amap/amap-jsapi-loader/package.json 2>/dev/null && echo "OK: loader in standalone" || echo "CHECK: may need manual handling"
```

- [ ] **Step 3: 提交（如有自动生成的变更）**

```bash
git status
# 仅当有自动生成的文件变更时：
git add -A && git commit -m "chore: post-build artifacts for amap loader upgrade"
```

---

### Task 6: 手动冒烟测试

- [ ] **Step 1: 确保 .env 中已配置密钥**

确认 `.env` 文件中包含：
```
NEXT_PUBLIC_AMAP_KEY=d0717e1d2823048314588190a326834f
NEXT_PUBLIC_AMAP_SECRET=03dcf39f9825f64b5a3fbe9d727db9d4
```

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 3: 验证功能**

在浏览器中依次验证：

| 序号 | 验证项 | 操作 | 预期结果 |
|------|--------|------|----------|
| 1 | 地图加载 | 访问 `/travel` | 地图正常显示，无白屏 |
| 2 | 标记显示 | 查看已保存的地点 | 地图上显示标记点 |
| 3 | 地点搜索 | 点击添加按钮，搜索"天安门" | 返回搜索结果列表 |
| 4 | GPS 定位 | 点击"我的位置" | 地图移动到当前位置 |
| 5 | 省份列表 | （如有相关入口） | 省份数据正常加载 |

- [ ] **Step 4: 检查浏览器控制台**

打开 DevTools → Console，确认无 AMap 相关报错（红色错误）。

---

### 文件变更汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 新增 `@amap/amap-jsapi-loader` 依赖 |
| `package-lock.json` | 修改 | 自动更新 |
| `.env.example` | 修改 | 新增 `NEXT_PUBLIC_AMAP_SECRET` |
| `app/travel/services/amap.ts` | 重写 | 完全替换为 AMapLoader 方式 |
| `app/travel/components/trip-map.tsx` | 不改 | 现有代码兼容 |
| `app/travel/components/search-popup.tsx` | 不改 | API 签名不变 |
| `app/travel/page.tsx` | 不改 | API 签名不变 |
