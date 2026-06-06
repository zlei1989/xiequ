# 旅行模块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现旅行模块的全部功能——地图视图（高德地图标注）、位置列表、位置 CRUD、位置筛选、精彩瞬间、图片上传/下载、GPS 定位、地点搜索。

**Architecture:** 位置数据存储在 OSS（JSON 文件），图片也走 OSS 签名 URL。前端通过 Server Actions 操作数据，高德地图 SDK 做地图渲染和搜索定位。OSS 接入参考旧项目 `TencentOss.ts` 的适配器模式，在 `lib/oss.ts` 中实现 `OssAdapter` 接口，屏蔽底层 SDK 差异。

**Tech Stack:** Next.js 16 App Router, antd 6, 高德地图 JS SDK, 腾讯云 COS (`cos-nodejs-sdk-v5`), Server Actions

**前置条件:** Plan 1（项目脚手架）已完成，Plan 2（运行配置）已完成，OSS 环境变量已配置

**OSS 参考实现:** `D:\workspace\自动浇花系统\service\packages\7qb-server\src\vendors\cloud\oss\TencentOss.ts`
— 旧项目使用 `XpnOssAdapter` 适配器接口，提供 `getString`、`putString`、`delete`、`getSignedPutUrl`、`getSignedUrl`、`exists`、`appendString` 等方法，SDK 懒初始化。本计划将此模式迁移到 Next.js 项目。

---

## File Structure

```
lib/
├── oss.ts                           # MODIFY — 实现 OssAdapter 接口 + TencentCosAdapter
└── utils.ts                         # (已存在)
app/travel/
├── types.ts                         # (已存在)
├── services/
│   ├── oss.ts                       # MODIFY — 通过 OssAdapter 实现位置数据读写
│   └── amap.ts                      # (不变)
├── actions.ts                       # CREATE — Server Actions
├── hooks/
│   ├── use-locations.ts             # (不变)
│   └── use-moments.ts               # (不变)
├── components/
│   ├── location-card.tsx            # CREATE
│   ├── location-list.tsx            # CREATE
│   ├── search-dialog.tsx            # CREATE
│   ├── trip-map.tsx                 # CREATE
│   ├── location-drawer.tsx          # CREATE
│   ├── moment-form.tsx              # CREATE
│   └── upload-image.tsx             # CREATE — 完整 OSS 直传实现
├── page.tsx                         # MODIFY — 地图视图
├── list/page.tsx                    # MODIFY — 位置列表
└── locations/[id]/page.tsx          # MODIFY — 位置详情
app/api/trip-plan/download/route.ts  # CREATE — 图片下载代理
.env.example                         # MODIFY — 更新 OSS 环境变量
```

---

### Task 1: OSS 适配器实现 (`lib/oss.ts`)

> 参考 `TencentOss.ts` 的 `XpnOssAdapter` 接口设计，使用 `cos-nodejs-sdk-v5` 实现腾讯云 COS 适配器。
> 适配器接口屏蔽底层 SDK 差异，后续如需切换到阿里云 OSS 只需新增 AliOssAdapter 即可。

**Files:**
- Modify: `lib/oss.ts`
- Modify: `.env.example`
- Modify: `package.json` (添加 `cos-nodejs-sdk-v5` 依赖)

- [ ] **Step 1: 安装腾讯云 COS SDK 依赖**

Run:
```bash
pnpm add cos-nodejs-sdk-v5
```

- [ ] **Step 2: 更新 `.env.example` 中的 OSS 环境变量**

将原有的阿里云 OSS 环境变量替换为腾讯云 COS：

```env filename=".env.example"
# ─── 数据库 ──────────────────────────────────────────
# SQLite 数据库文件路径（默认 ./data/app.db）
DB_PATH=./data/app.db

# ─── 腾讯云 COS 对象存储（旅行模块图片/数据存储） ────
# 四个变量必须全部设置或全部留空
OSS_ENDPOINT=ap-beijing
OSS_SECRET_ID=
OSS_SECRET_KEY=
OSS_BUCKET=

# ─── 高德地图（旅行模块定位/搜索） ──────────────────
NEXT_PUBLIC_AMAP_KEY=
```

- [ ] **Step 3: 实现 `lib/oss.ts` — OssAdapter 接口 + TencentCosAdapter**

> 设计参考旧项目 `TencentOss.ts`：
> - 适配器接口 `OssAdapter` 对应 `XpnOssAdapter`
> - `TencentCosAdapter` 对应 `TencentOss`
> - 方法签名保持一致：`getString`、`putString`、`delete`、`exists`、`getSignedPutUrl`、`getSignedUrl`、`appendString`
> - SDK 懒初始化（`getSdk()` 模式）

Replace `lib/oss.ts`:

```ts
/**
 * OSS 对象存储适配器层
 *
 * 设计参考旧项目 XpnOssAdapter 接口 + TencentOss 实现：
 * - OssAdapter 接口屏蔽底层 SDK 差异
 * - TencentCosAdapter 基于 cos-nodejs-sdk-v5 实现
 * - 后续如需支持阿里云 OSS，只需新增 AliOssAdapter
 *
 * 环境变量：
 * - OSS_ENDPOINT: 存储区域，如 ap-beijing
 * - OSS_SECRET_ID: 密钥标识 (对应旧项目 key)
 * - OSS_SECRET_KEY: 通讯密钥 (对应旧项目 secret)
 * - OSS_BUCKET: 存储空间名称
 */

import COS from "cos-nodejs-sdk-v5";

// ─── 适配器接口（参考 XpnOssAdapter） ────────────────────────────────────

/**
 * OSS 适配器接口
 *
 * 对应旧项目 XpnOssAdapter，方法签名保持一致。
 * 各方法语义参考 TencentOss 实现。
 */
export interface OssAdapter {
  /** 获得目标存储主机 */
  getEndpoint(): string;
  /** 设置目标存储主机 */
  setEndpoint(value: string): void;
  /** 设置身份标识 */
  setKey(value: string): void;
  /** 设置通讯密钥 */
  setSecret(value: string): void;
  /** 获得空间名称 */
  getBucket(): string;
  /** 设置空间名称 */
  setBucket(value: string): void;
  /** 判断文件是否存在 */
  exists(path: string): Promise<boolean>;
  /** 获得文件内容（字符串） */
  getString(path: string): Promise<string>;
  /** 获得上传签名 URL */
  getSignedPutUrl(path: string, options?: OssPutOptions): Promise<string>;
  /** 获得下载签名 URL */
  getSignedUrl(path: string, options?: OssPutOptions): Promise<string>;
  /** 上传字符串 */
  putString(path: string, content: string, options?: OssPutOptions): Promise<void>;
  /** 追加字符串（读-改-写，非原子操作） */
  appendString(path: string, content: string, options?: OssPutOptions): Promise<void>;
  /** 删除内容 */
  delete(path: string): Promise<void>;
}

/**
 * 上传数据选项（参考 XpnOssPutOptions）
 */
export type OssPutOptions = {
  headers?: OssPutHeaders;
};

/**
 * 上传数据头部描述（参考 XpnOssPutHeaders）
 */
export type OssPutHeaders = Record<string, string> & {
  "Cache-Control"?: string;
  "Content-Disposition"?: string;
  "Content-Encoding"?: string;
  "Content-Type"?: string;
  Expires?: string;
};

// ─── 腾讯云 COS 适配器（参考 TencentOss） ────────────────────────────────

/**
 * 腾讯云 COS 适配器
 *
 * 参考 TencentOss 实现，使用 cos-nodejs-sdk-v5。
 * https://cloud.tencent.com/document/product/436/8629
 */
export class TencentCosAdapter implements OssAdapter {
  /**
   * 目标存储主机（Region）
   */
  protected _endpoint: string = "ap-beijing";

  /**
   * 身份标识（SecretId）
   */
  protected _key: string = "";

  /**
   * 通讯密钥（SecretKey）
   */
  protected _secret: string = "";

  /**
   * 空间名称（Bucket）
   */
  protected _bucket: string = "";

  /**
   * SDK 指针（懒初始化，参考 TencentOss._sdk）
   */
  protected _sdk?: COS;

  public getEndpoint(): string {
    return this._endpoint;
  }

  public setEndpoint(value: string): void {
    this._endpoint = value;
  }

  public setKey(value: string): void {
    this._key = value;
  }

  public setSecret(value: string): void {
    this._secret = value;
  }

  public getBucket(): string {
    return this._bucket;
  }

  public setBucket(value: string): void {
    this._bucket = value;
  }

  /**
   * 获得 SDK 指针
   *
   * 参考 TencentOss.getSdk()，懒初始化 COS 客户端。
   */
  public getSdk(): COS {
    if (!this._sdk) {
      this._sdk = new COS({
        SecretId: this._key,
        SecretKey: this._secret,
        Protocol: "https:",
      });
    }
    return this._sdk;
  }

  /**
   * 判断文件是否存在
   *
   * 参考 TencentOss.exists()，使用 headObject 探测。
   */
  public exists(path: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.getSdk().headObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
        },
        (err: any, _ret: any) => {
          if (!_ret && err) {
            if (err.statusCode === 404) {
              resolve(false);
            } else if (err.statusCode === 403) {
              reject(err);
            } else {
              reject(err);
            }
          } else {
            resolve(true);
          }
        }
      );
    });
  }

  /**
   * 获得文件内容
   *
   * 参考 TencentOss.getString()。
   */
  public getString(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.getSdk().getObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
        },
        (err: any, ret: any) => {
          if (ret) {
            const str = ret.Body.toString("utf-8");
            return resolve(str);
          }
          reject(err);
        }
      );
    });
  }

  /**
   * 获得上传签名 URL
   *
   * 参考 TencentOss.getSignedPutUrl()。
   */
  public getSignedPutUrl(
    path: string,
    options?: OssPutOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.getSdk().getObjectUrl(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
          Method: "PUT",
          Sign: true,
          Headers: options?.headers,
        },
        (err: any, ret: any) => {
          if (err) {
            return reject(err);
          }
          return resolve(ret.Url);
        }
      );
    });
  }

  /**
   * 获得下载签名 URL
   *
   * 参考 TencentOss.getSignedUrl()。
   */
  public getSignedUrl(
    path: string,
    options?: OssPutOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.getSdk().getObjectUrl(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
          Method: "GET",
          Sign: true,
          Headers: options?.headers,
        },
        (err: any, ret: any) => {
          if (err) {
            return reject(err);
          }
          return resolve(ret.Url);
        }
      );
    });
  }

  /**
   * 上传字符串
   *
   * 参考 TencentOss.putString()，自动设置 Content-Type。
   */
  public putString(
    path: string,
    content: string,
    options?: OssPutOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!options) {
        options = {};
      }
      if (!options.headers) {
        options.headers = {};
      }
      if ("Content-Type" in options.headers !== true) {
        options.headers["Content-Type"] = "text/plain;charset=UTF-8";
      }

      this.getSdk().putObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
          ContentType: options.headers["Content-Type"],
          ContentEncoding: options.headers["Content-Encoding"],
          Body: content,
        },
        (err: any, _ret: any) => {
          if (err) {
            return reject(err);
          }
          return resolve();
        }
      );
    });
  }

  /**
   * 追加字符串
   *
   * 参考 TencentOss.appendString()，非原子操作（读取旧内容 → 拼接 → 写回）。
   */
  public async appendString(
    path: string,
    content: string,
    options?: OssPutOptions
  ): Promise<void> {
    let newContent: string;
    if (await this.exists(path)) {
      const oldContent = await this.getString(path);
      newContent = oldContent + content;
    } else {
      newContent = content;
    }
    return await this.putString(path, newContent, options);
  }

  /**
   * 删除内容
   *
   * 参考 TencentOss.delete()。
   */
  public delete(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.getSdk().deleteObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
        },
        (err: any, _data: any) => {
          if (err) {
            return reject(err);
          }
          return resolve();
        }
      );
    });
  }
}

// ─── 全局单例 ──────────────────────────────────────────────────────────

let adapterInstance: OssAdapter | null = null;

/**
 * 检查 OSS 是否已配置
 *
 * 四个环境变量全部非空时视为已配置。
 */
export function isOssConfigured(): boolean {
  return (
    !!process.env.OSS_ENDPOINT &&
    !!process.env.OSS_SECRET_ID &&
    !!process.env.OSS_SECRET_KEY &&
    !!process.env.OSS_BUCKET
  );
}

/**
 * 获取 OSS 适配器单例
 *
 * 参考 XpnOss.factory() 工厂模式，根据环境变量创建适配器。
 * 当前仅支持腾讯云 COS，后续可扩展。
 */
export function getOssAdapter(): OssAdapter {
  if (adapterInstance) {
    return adapterInstance;
  }

  if (!isOssConfigured()) {
    throw new Error(
      "OSS 未配置。请设置 OSS_ENDPOINT, OSS_SECRET_ID, OSS_SECRET_KEY, OSS_BUCKET 环境变量。"
    );
  }

  // 工厂模式：参考 XpnOss.factory()，根据配置创建对应适配器
  const adapter = new TencentCosAdapter();
  adapter.setEndpoint(process.env.OSS_ENDPOINT!);
  adapter.setKey(process.env.OSS_SECRET_ID!);
  adapter.setSecret(process.env.OSS_SECRET_KEY!);
  adapter.setBucket(process.env.OSS_BUCKET!);

  adapterInstance = adapter;
  return adapterInstance;
}

/**
 * 重置 OSS 适配器（主要用于测试）
 */
export function resetOssAdapter(): void {
  adapterInstance = null;
}
```

- [ ] **Step 4: 同步更新 `lib/env.ts` 中的环境变量定义**

在 `lib/env.ts` 的 `EnvConfig` 中，将阿里云 OSS 变量替换为腾讯云 COS 变量：

```ts
// 替换前：
// OSS_REGION: string;
// OSS_ACCESS_KEY_ID: string;
// OSS_ACCESS_KEY_SECRET: string;
// OSS_BUCKET: string;

// 替换后：
/** 腾讯云 COS 区域，如 ap-beijing */
OSS_ENDPOINT: string;
/** 腾讯云 COS SecretId */
OSS_SECRET_ID: string;
/** 腾讯云 COS SecretKey */
OSS_SECRET_KEY: string;
/** 腾讯云 COS Bucket 名称 */
OSS_BUCKET: string;
```

同步更新 `getEnv()` 和 `validateEnv()` 中的对应字段名。

- [ ] **Step 5: Commit**

```bash
git add lib/oss.ts lib/env.ts .env.example package.json pnpm-lock.yaml
git commit -m "feat: 实现 OSS 适配器层，参考 TencentOss 接入腾讯云 COS"
```

---

### Task 2: 旅行模块 OSS 服务实现

> 本 Task 将 Task 1 中所有 TODO 占位替换为真实实现。
> 所有 OSS 操作通过 `getOssAdapter()` 获取适配器实例，调用统一的 `OssAdapter` 接口。

**Files:**
- Modify: `app/travel/services/oss.ts`
- Create: `app/travel/actions.ts`

- [ ] **Step 1: 实现 OSS 数据服务**

Replace `app/travel/services/oss.ts`:

```ts
import { getOssAdapter, isOssConfigured } from "@/lib/oss";
import type { OssPutOptions } from "@/lib/oss";
import type { Location, Moment } from "../types";
import { newId, formatDateTime } from "@/lib/utils";

/**
 * 旅行模块 OSS 存储路径约定
 * - 位置数据: trip-plan/locations.json
 * - 位置封面: trip-plan/covers/{id}
 * - 位置图标: trip-plan/icons/{id}
 *
 * 路径规则与旧项目保持一致。
 */

const LOCATIONS_KEY = "trip-plan/locations.json";

// ─── OSS 通用操作（通过 OssAdapter 适配器） ────────────────────────────

/**
 * 获取文件内容
 *
 * 通过 OssAdapter.getString() 读取，参考 TencentOss.getString()
 */
async function ossGetString(key: string): Promise<string> {
  const adapter = getOssAdapter();
  return adapter.getString(key);
}

/**
 * 上传字符串内容
 *
 * 通过 OssAdapter.putString() 写入，参考 TencentOss.putString()
 */
async function ossPutString(key: string, content: string, options?: OssPutOptions): Promise<void> {
  const adapter = getOssAdapter();
  return adapter.putString(key, content, options);
}

/**
 * 删除文件
 *
 * 通过 OssAdapter.delete() 删除，参考 TencentOss.delete()
 */
async function ossDelete(key: string): Promise<void> {
  const adapter = getOssAdapter();
  return adapter.delete(key);
}

/**
 * 获取上传签名 URL
 *
 * 通过 OssAdapter.getSignedPutUrl() 获取，参考 TencentOss.getSignedPutUrl()
 * 用于前端直传（图片上传等）。
 */
async function ossGetSignedPutUrl(key: string, options?: OssPutOptions): Promise<string> {
  const adapter = getOssAdapter();
  return adapter.getSignedPutUrl(key, options);
}

/**
 * 获取下载签名 URL
 *
 * 通过 OssAdapter.getSignedUrl() 获取，参考 TencentOss.getSignedUrl()
 * 用于临时授权访问私有文件。
 */
async function ossGetSignedUrl(key: string, options?: OssPutOptions): Promise<string> {
  const adapter = getOssAdapter();
  return adapter.getSignedUrl(key, options);
}

/**
 * 判断文件是否存在
 *
 * 通过 OssAdapter.exists() 判断，参考 TencentOss.exists()
 */
async function ossExists(key: string): Promise<boolean> {
  const adapter = getOssAdapter();
  return adapter.exists(key);
}

// ─── 位置数据 CRUD ────────────────────────────────────────────────────

/**
 * 获取所有位置
 *
 * 从 OSS 的 trip-plan/locations.json 读取。
 * 文件不存在时返回空数组。
 */
export async function getLocations(): Promise<Location[]> {
  if (!isOssConfigured()) {
    return [];
  }
  try {
    const jsonStr = await ossGetString(LOCATIONS_KEY);
    return JSON.parse(jsonStr) as Location[];
  } catch {
    return [];
  }
}

/**
 * 保存所有位置
 *
 * 将位置数据写入 OSS 的 trip-plan/locations.json。
 */
async function saveLocations(locations: Location[]): Promise<void> {
  await ossPutString(LOCATIONS_KEY, JSON.stringify(locations), {
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 新增位置
 */
export async function addLocation(data: {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  comments?: string;
}): Promise<Location> {
  const locations = await getLocations();
  const location: Location = {
    id: newId(),
    name: data.name,
    address: data.address,
    longitude: data.longitude,
    latitude: data.latitude,
    checked: false,
    comments: data.comments || "",
    deleted: false,
    createdTime: formatDateTime(new Date()),
  };
  locations.push(location);
  await saveLocations(locations);
  return location;
}

/**
 * 更新位置
 */
export async function updateLocation(
  id: string,
  data: Partial<Location>
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === id);
  if (!location) throw new Error(`位置 ${id} 不存在`);

  if (data.name !== undefined) location.name = data.name;
  if (data.address !== undefined) location.address = data.address;
  if (data.comments !== undefined) location.comments = data.comments;
  if (data.checked !== undefined) location.checked = data.checked;
  if (data.longitude !== undefined) location.longitude = data.longitude;
  if (data.latitude !== undefined) location.latitude = data.latitude;

  await saveLocations(locations);
  return location;
}

/**
 * 删除位置（软删除）
 *
 * 将 deleted 标记设为 true，并尝试删除封面图。
 */
export async function deleteLocation(id: string): Promise<void> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === id);
  if (!location) throw new Error(`位置 ${id} 不存在`);

  location.deleted = true;
  await saveLocations(locations);

  // 删除封面图（忽略不存在的情况）
  try {
    await ossDelete(`trip-plan/covers/${id}`);
  } catch {
    // 封面图可能不存在，忽略
  }
}

// ─── 精彩瞬间 ──────────────────────────────────────────────────────────

/**
 * 新增瞬间
 */
export async function addMoment(
  locationId: string,
  data: { date: string; text: string }
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === locationId);
  if (!location) throw new Error(`位置 ${locationId} 不存在`);

  // 位置上的 moments 存储（用 Record 结构与旧项目一致）
  const moments = (location as any).moments || {};
  const momentId = newId();
  moments[momentId] = { date: data.date, text: data.text };
  (location as any).moments = moments;

  await saveLocations(locations);
  return location;
}

/**
 * 更新瞬间
 */
export async function updateMoment(
  locationId: string,
  momentId: string,
  data: { date?: string; text?: string }
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === locationId);
  if (!location) throw new Error(`位置 ${locationId} 不存在`);

  const moments = (location as any).moments;
  if (!moments || !moments[momentId]) {
    throw new Error(`瞬间 ${momentId} 不存在`);
  }

  if (data.date !== undefined) moments[momentId].date = data.date;
  if (data.text !== undefined) moments[momentId].text = data.text;

  await saveLocations(locations);
  return location;
}

/**
 * 删除瞬间
 */
export async function deleteMoment(
  locationId: string,
  momentId: string
): Promise<Location> {
  const locations = await getLocations();
  const location = locations.find((l) => l.id === locationId);
  if (!location) throw new Error(`位置 ${locationId} 不存在`);

  const moments = (location as any).moments;
  if (moments && moments[momentId]) {
    delete moments[momentId];
  }

  await saveLocations(locations);
  return location;
}

// ─── 图片签名 URL ──────────────────────────────────────────────────────

/**
 * 获取封面上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传图片到 COS。
 * 参考 TencentOss.getSignedPutUrl() 流程。
 */
export async function getCoverUploadUrl(id: string): Promise<string> {
  return ossGetSignedPutUrl(`trip-plan/covers/${id}`);
}

/**
 * 获取封面下载签名 URL
 *
 * 服务端通过 OssAdapter.getSignedUrl() 获取临时访问地址。
 * 签名 URL 默认有效期由 SDK 控制，无需额外参数。
 */
export async function getCoverDownloadUrl(id: string): Promise<string> {
  return ossGetSignedUrl(`trip-plan/covers/${id}`);
}

/**
 * 获取图标下载签名 URL
 */
export async function getIconDownloadUrl(id: string): Promise<string> {
  return ossGetSignedUrl(`trip-plan/icons/${id}`);
}

/**
 * 获取封面下载地址（API 路由代理方式）
 *
 * 返回 API 路由地址，由服务端代理下载。
 * 当前端无法直接访问 COS 时使用此方式。
 */
export function getCoverProxyUrl(id: string): string {
  return `/api/trip-plan/download?type=cover&id=${id}`;
}

/**
 * 获取图标下载地址（API 路由代理方式）
 */
export function getIconProxyUrl(id: string): string {
  return `/api/trip-plan/download?type=icon&id=${id}`;
}
```

- [ ] **Step 2: 创建 Server Actions**

Create `app/travel/actions.ts`:

```ts
"use server";

import {
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  addMoment,
  updateMoment,
  deleteMoment,
  getCoverUploadUrl,
  getCoverDownloadUrl,
} from "./services/oss";
import { isOssConfigured } from "@/lib/oss";

export async function fetchLocations() {
  if (!isOssConfigured()) {
    return [];
  }
  return getLocations();
}

export async function createLocation(data: {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  comments?: string;
}) {
  return addLocation(data);
}

export async function editLocation(id: string, data: Partial<import("./types").Location>) {
  return updateLocation(id, data);
}

export async function removeLocation(id: string) {
  return deleteLocation(id);
}

export async function createMoment(locationId: string, data: { date: string; text: string }) {
  return addMoment(locationId, data);
}

export async function editMoment(locationId: string, momentId: string, data: { date?: string; text?: string }) {
  return updateMoment(locationId, momentId, data);
}

export async function removeMoment(locationId: string, momentId: string) {
  return deleteMoment(locationId, momentId);
}

/**
 * 获取图片上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传到 COS。
 * 参考 TencentOss.getSignedPutUrl() 流程：
 * 1. Server Action 返回签名 URL
 * 2. 前端使用 fetch(url, { method: 'PUT', body: file }) 直传
 */
export async function getUploadUrl(id: string, type: "cover" | "icon" = "cover") {
  return getCoverUploadUrl(id);
}

/**
 * 获取图片下载签名 URL
 *
 * 服务端生成临时访问地址返回给前端。
 * 签名 URL 由 OssAdapter.getSignedUrl() 生成。
 */
export async function getImageUrl(id: string, type: "cover" | "icon" = "cover") {
  return getCoverDownloadUrl(id);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/travel/services/oss.ts app/travel/actions.ts
git commit -m "feat: 实现旅行模块 OSS 服务和 Server Actions（接入腾讯云 COS）"
```

---

### Task 3: 高德地图 SDK 封装

**Files:**
- Modify: `app/travel/services/amap.ts`

- [ ] **Step 1: 实现高德地图 SDK 封装**

Replace `app/travel/services/amap.ts`:

```ts
/**
 * 高德地图 SDK 封装
 *
 * 负责：
 * - 地图加载（动态注入 script）
 * - 位置搜索（PlaceSearch）
 * - GPS 定位（Geolocation）
 * - 地理编码（Geocoder）
 * - 行政区查询（DistrictSearch）
 *
 * 环境变量：NEXT_PUBLIC_AMAP_KEY
 */

const AMAP_SCRIPT_URL = "//webapi.amap.com/maps?v=1.4.15";

export function getAmapKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_KEY || "";
}

export function getAmapScriptUrl(): string {
  const key = getAmapKey();
  return `${AMAP_SCRIPT_URL}&key=${key}&plugin=AMap.Driving,AMap.PlaceSearch,AMap.DistrictSearch,AMap.Geolocation,AMap.Geocoder`;
}

// 地图 SDK 加载 Promise（防止重复加载）
let amapPromise: Promise<any> | null = null;

/**
 * 动态加载高德地图 SDK
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
  amapPromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = getAmapScriptUrl();
    el.onload = () => resolve((window as any).AMap);
    el.onerror = () => reject(new Error("AMap SDK 加载失败"));
    document.querySelector("head")?.appendChild(el);
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

- [ ] **Step 2: Commit**

```bash
git add app/travel/services/amap.ts
git commit -m "feat: 实现高德地图 SDK 封装"
```

---

### Task 4: 位置列表与筛选

**Files:**
- Modify: `app/travel/hooks/use-locations.ts`
- Create: `app/travel/components/location-card.tsx`
- Create: `app/travel/components/location-list.tsx`
- Modify: `app/travel/list/page.tsx`

- [ ] **Step 1: 实现 use-locations hook**

Replace `app/travel/hooks/use-locations.ts`:

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Location, Summary } from "../types";
import { fetchLocations, createLocation, editLocation, removeLocation } from "../actions";

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "checked" | "uncheck">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLocations();
      setLocations(data);
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
    setLocations((prev) => [...prev, newLoc]);
    return newLoc;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Location>) => {
    const updated = await editLocation(id, data);
    setLocations((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await removeLocation(id);
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, deleted: true } : l)));
  }, []);

  const filteredLocations = locations
    .filter((loc) => !loc.deleted)
    .filter((loc) => {
      if (filter === "checked") return loc.checked;
      if (filter === "uncheck") return !loc.checked;
      return true;
    });

  const activeLocations = locations.filter((l) => !l.deleted);
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

  return { locations: filteredLocations, loading, filter, setFilter, load, add, update, remove, summary };
}
```

- [ ] **Step 2: 创建位置卡片组件**

Create `app/travel/components/location-card.tsx`:

```tsx
"use client";

import { Card, Tag } from "antd";
import type { Location } from "../types";

export function LocationCard({
  location,
  onClick,
}: {
  location: Location;
  onClick: (location: Location) => void;
}) {
  return (
    <Card
      hoverable
      onClick={() => onClick(location)}
      style={{ marginBottom: 12 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 500 }}>{location.name}</div>
          <div style={{ color: "#999", fontSize: 13 }}>{location.address}</div>
          {location.comments && (
            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{location.comments}</div>
          )}
        </div>
        {location.checked ? (
          <Tag color="green">已去</Tag>
        ) : (
          <Tag color="blue">待去</Tag>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: 创建位置列表组件**

Create `app/travel/components/location-list.tsx`:

```tsx
"use client";

import { LocationCard } from "./location-card";
import type { Location } from "../types";

export function LocationList({
  locations,
  onLocationClick,
}: {
  locations: Location[];
  onLocationClick: (location: Location) => void;
}) {
  if (locations.length === 0) {
    return <div style={{ color: "#999", textAlign: "center", padding: 48 }}>暂无位置</div>;
  }

  return (
    <div>
      {locations.map((location) => (
        <LocationCard
          key={location.id}
          location={location}
          onClick={onLocationClick}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 实现位置列表页**

Replace `app/travel/list/page.tsx`:

```tsx
"use client";

import { Button, Select, Space, Spin } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocations } from "../hooks/use-locations";
import { LocationList } from "../components/location-list";
import { SearchDialog } from "../components/search-dialog";
import type { Location } from "../types";

export default function LocationListPage() {
  const router = useRouter();
  const { locations, loading, filter, setFilter, load, add, update, summary } = useLocations();
  const [searchVisible, setSearchVisible] = useState(false);

  function onLocationClick(location: Location) {
    router.push(`/travel/locations/${location.id}`);
  }

  async function onAdd(location: { name: string; address: string; longitude: number; latitude: number }) {
    await add(location);
    setSearchVisible(false);
  }

  async function onToggleChecked(location: Location) {
    await update(location.id, { checked: !location.checked });
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 120 }}
            options={[
              { value: "all", label: `全部 (${summary.count})` },
              { value: "uncheck", label: `待去 (${summary.uncheckCount})` },
              { value: "checked", label: `已去 (${summary.checkedCount})` },
            ]}
          />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setSearchVisible(true)}>
            添加位置
          </Button>
        </Space>
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}><Spin /></div>
      ) : (
        <LocationList locations={locations} onLocationClick={onLocationClick} />
      )}
      <SearchDialog open={searchVisible} onClose={() => setSearchVisible(false)} onAdd={onAdd} />
    </div>
  );
}
```

- [ ] **Step 5: 创建搜索弹窗**

Create `app/travel/components/search-dialog.tsx`:

```tsx
"use client";

import { Modal, Input, List, message } from "antd";
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
    <Modal title="搜索地点" open={open} onCancel={onClose} footer={null} width={600}>
      <Input.Search
        placeholder="输入地点名称"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onSearch={onSearch}
        loading={searching}
        style={{ marginBottom: 16 }}
      />
      <List
        dataSource={results}
        renderItem={(item) => (
          <List.Item
            actions={[<a key="add" onClick={() => onAdd({ name: item.name, address: item.address, longitude: item.longitude, latitude: item.latitude })}>添加</a>]}
          >
            <List.Item.Meta title={item.name} description={item.address} />
          </List.Item>
        )}
      />
    </Modal>
  );
}
```

- [ ] **Step 6: 验证位置列表页**

Run: `pnpm dev`

Expected: /travel/list 页面显示筛选下拉、刷新按钮、添加按钮。点击"添加位置"弹出搜索弹窗（需配置 AMap Key 才能搜索）。OSS 未配置时列表为空但不报错。

- [ ] **Step 7: Commit**

```bash
git add app/travel/
git commit -m "feat: 实现旅行模块位置列表和搜索"
```

---

### Task 5: 地图视图

**Files:**
- Create: `app/travel/components/trip-map.tsx`
- Modify: `app/travel/page.tsx`

- [ ] **Step 1: 创建地图组件**

Create `app/travel/components/trip-map.tsx`:

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { loadAmap } from "../services/amap";
import type { Location } from "../types";

export function TripMap({
  locations,
  onMarkerClick,
}: {
  locations: Location[];
  onMarkerClick: (location: Location) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const createMap = useCallback(async () => {
    if (!containerRef.current) return;
    const AMap = await loadAmap();

    // 从 localStorage 恢复地图状态
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

  // 初始化地图
  useEffect(() => {
    createMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [createMap]);

  // 更新标注点
  useEffect(() => {
    if (!mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    // 清除旧标注
    markersRef.current.forEach((m) => mapRef.current.remove(m));
    markersRef.current = [];

    // 添加新标注
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

  return <div ref={containerRef} style={{ width: "100%", height: "calc(100vh - 64px)" }} />;
}
```

- [ ] **Step 2: 实现地图视图页**

Replace `app/travel/page.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Space, Select } from "antd";
import { PlusOutlined, AimOutlined } from "@ant-design/icons";
import { useLocations } from "./hooks/use-locations";
import { TripMap } from "./components/trip-map";
import { LocationDrawer } from "./components/location-drawer";
import { SearchDialog } from "./components/search-dialog";
import { getCurrentPosition } from "./services/amap";
import type { Location } from "./types";

export default function TravelPage() {
  const { locations, loading, filter, setFilter, add, update, summary } = useLocations();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const mapRef = useRef<any>(null);

  const onMarkerClick = useCallback((location: Location) => {
    setSelectedLocation(location);
    setDrawerVisible(true);
  }, []);

  async function onAdd(location: { name: string; address: string; longitude: number; latitude: number }) {
    const newLoc = await add(location);
    setSearchVisible(false);
    setSelectedLocation(newLoc);
    setDrawerVisible(true);
  }

  async function onMyLocation() {
    try {
      const [lng, lat] = await getCurrentPosition();
      if (mapRef.current) {
        mapRef.current.setCenter([lng, lat]);
      }
    } catch {
      // 定位失败，静默处理
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, background: "#fff", padding: "4px 8px", borderRadius: 6 }}>
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 120 }}
            size="small"
            options={[
              { value: "all", label: `全部 (${summary.count})` },
              { value: "uncheck", label: `待去 (${summary.uncheckCount})` },
              { value: "checked", label: `已去 (${summary.checkedCount})` },
            ]}
          />
          <Button size="small" icon={<AimOutlined />} onClick={onMyLocation}>
            我的位置
          </Button>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setSearchVisible(true)}>
            添加
          </Button>
        </Space>
      </div>
      <TripMap locations={locations} onMarkerClick={onMarkerClick} />
      <LocationDrawer
        location={selectedLocation}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onUpdate={update}
      />
      <SearchDialog open={searchVisible} onClose={() => setSearchVisible(false)} onAdd={onAdd} />
    </div>
  );
}
```

- [ ] **Step 3: 创建位置详情抽屉**

Create `app/travel/components/location-drawer.tsx`:

```tsx
"use client";

import { Drawer, Descriptions, Tag, Button, Input, message } from "antd";
import { useState } from "react";
import type { Location } from "../types";

export function LocationDrawer({
  location,
  open,
  onClose,
  onUpdate,
}: {
  location: Location | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Location>) => Promise<Location>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; address: string; comments: string }>({ name: "", address: "", comments: "" });

  if (!location) return null;

  function startEdit() {
    setForm({ name: location.name, address: location.address, comments: location.comments });
    setEditing(true);
  }

  async function saveEdit() {
    try {
      await onUpdate(location.id, form);
      setEditing(false);
      message.success("已保存");
    } catch (err: any) {
      message.error(err.message);
    }
  }

  async function toggleChecked() {
    await onUpdate(location.id, { checked: !location.checked });
  }

  return (
    <Drawer title={location.name} open={open} onClose={onClose} width={400}>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="地址" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input.TextArea placeholder="备注" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} rows={3} />
          <Button type="primary" onClick={saveEdit}>保存</Button>
          <Button onClick={() => setEditing(false)}>取消</Button>
        </div>
      ) : (
        <div>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="名称">{location.name}</Descriptions.Item>
            <Descriptions.Item label="地址">{location.address}</Descriptions.Item>
            <Descriptions.Item label="坐标">{location.longitude.toFixed(6)}, {location.latitude.toFixed(6)}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {location.checked ? <Tag color="green">已去</Tag> : <Tag color="blue">待去</Tag>}
            </Descriptions.Item>
            {location.comments && (
              <Descriptions.Item label="备注">{location.comments}</Descriptions.Item>
            )}
          </Descriptions>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <Button size="small" onClick={startEdit}>编辑</Button>
            <Button size="small" onClick={toggleChecked}>
              {location.checked ? "标记为待去" : "标记为已去"}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 4: 验证地图视图**

Run: `pnpm dev`

Expected: /travel 页面显示地图（需 AMap Key），标注点可点击打开抽屉详情。

- [ ] **Step 5: Commit**

```bash
git add app/travel/
git commit -m "feat: 实现旅行模块地图视图和位置详情"
```

---

### Task 6: 位置详情页（瞬间管理 + 图片上传）

**Files:**
- Modify: `app/travel/hooks/use-moments.ts`
- Create: `app/travel/components/moment-form.tsx`
- Create: `app/travel/components/upload-image.tsx`
- Modify: `app/travel/locations/[id]/page.tsx`

- [ ] **Step 1: 实现 use-moments hook**

Replace `app/travel/hooks/use-moments.ts`:

```ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Moment } from "../types";
import { fetchLocations } from "../actions";
import { createMoment, editMoment, removeMoment } from "../actions";

export function useMoments(locationId: string) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const locations = await fetchLocations();
      const location = locations.find((l) => l.id === locationId);
      if (location && (location as any).moments) {
        const momentsMap = (location as any).moments as Record<string, { date: string; text: string }>;
        const items: Moment[] = Object.entries(momentsMap).map(([id, m]) => ({
          id,
          locationId,
          date: m.date,
          text: m.text,
          createdTime: "",
        }));
        items.sort((a, b) => b.date.localeCompare(a.date));
        setMoments(items);
      }
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (data: { date: string; text: string }) => {
    await createMoment(locationId, data);
    await load();
  }, [locationId, load]);

  const update = useCallback(async (id: string, data: { date?: string; text?: string }) => {
    await editMoment(locationId, id, data);
    await load();
  }, [locationId, load]);

  const remove = useCallback(async (id: string) => {
    await removeMoment(locationId, id);
    await load();
  }, [locationId, load]);

  return { moments, loading, load, add, update, remove };
}
```

- [ ] **Step 2: 创建瞬间表单组件**

Create `app/travel/components/moment-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Form, Input, DatePicker, Button, message } from "antd";
import dayjs from "dayjs";

export function MomentForm({
  onSubmit,
}: {
  onSubmit: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  async function onFinish(values: { date: dayjs.Dayjs; text: string }) {
    setSubmitting(true);
    try {
      await onSubmit({ date: values.date.format("YYYY-MM-DD"), text: values.text });
      form.resetFields();
      message.success("已添加");
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form form={form} onFinish={onFinish} layout="inline">
      <Form.Item name="date" rules={[{ required: true, message: "请选择日期" }]}>
        <DatePicker />
      </Form.Item>
      <Form.Item name="text" style={{ flex: 1 }}>
        <Input placeholder="记录这一刻..." />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={submitting}>添加</Button>
      </Form.Item>
    </Form>
  );
}
```

- [ ] **Step 3: 创建图片上传组件（OSS 直传）**

> **关键实现：** 参考 TencentOss 的签名 URL 流程。
> 上传流程：
> 1. 前端调用 Server Action `getUploadUrl()` 获取签名 URL
> 2. 前端使用 `fetch(url, { method: 'PUT', body: file })` 直传到 COS
> 3. 上传成功后刷新封面图显示

Create `app/travel/components/upload-image.tsx`:

```tsx
"use client";

import { Upload, Button, message, Image } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import { useState, useEffect } from "react";
import { getUploadUrl, getImageUrl } from "../actions";

/**
 * 图片上传组件
 *
 * 通过 OSS 签名 URL 直传，参考 TencentOss.getSignedPutUrl() 流程：
 * 1. 调用 Server Action 获取 COS 预签名 PUT URL
 * 2. 前端使用 fetch PUT 直传文件到 COS
 * 3. 上传成功后刷新签名 URL 显示预览
 *
 * 下载流程参考 TencentOss.getSignedUrl()：
 * - 通过 Server Action getImageUrl() 获取签名 URL
 * - 签名 URL 由 OssAdapter.getSignedUrl() 生成，包含临时访问凭据
 */
export function UploadImage({
  locationId,
  type = "cover",
}: {
  locationId: string;
  type?: "cover" | "icon";
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 加载已有封面的签名 URL
  useEffect(() => {
    async function loadPreview() {
      try {
        const url = await getImageUrl(locationId, type);
        setPreviewUrl(url);
      } catch {
        // 封面可能不存在，静默忽略
        setPreviewUrl(null);
      }
    }
    loadPreview();
  }, [locationId, type]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      // Step 1: 获取 COS 签名 PUT URL
      // 参考 TencentOss.getSignedPutUrl() —— 服务端生成带签名的上传地址
      const signedUrl = await getUploadUrl(locationId, type);

      // Step 2: 使用签名 URL 直传文件到 COS
      // PUT 请求体为文件二进制数据，Content-Type 由请求头指定
      const response = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
      }

      // Step 3: 刷新预览（重新获取签名 URL）
      const downloadUrl = await getImageUrl(locationId, type);
      setPreviewUrl(downloadUrl);
      message.success("上传成功");
    } catch (err: any) {
      message.error("上传失败: " + err.message);
    } finally {
      setUploading(false);
    }
    return false; // 阻止 antd Upload 默认上传行为
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Upload
        beforeUpload={handleUpload}
        showUploadList={false}
        accept="image/*"
      >
        <Button icon={<CameraOutlined />} loading={uploading}>
          上传封面
        </Button>
      </Upload>
      {previewUrl && (
        <Image
          src={previewUrl}
          alt="封面"
          width={40}
          height={40}
          style={{ objectFit: "cover", borderRadius: 4 }}
          fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 安装 dayjs 依赖**

Run: `pnpm add dayjs`

- [ ] **Step 5: 实现位置详情页**

Replace `app/travel/locations/[id]/page.tsx`:

```tsx
"use client";

import { use, useEffect } from "react";
import { Spin, Card, List, Button, Popconfirm, Tag, message } from "antd";
import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocations } from "../../hooks/use-locations";
import { useMoments } from "../../hooks/use-moments";
import { MomentForm } from "../../components/moment-form";
import { UploadImage } from "../../components/upload-image";
import type { Location } from "../../types";

export default function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { locations, load, update, remove } = useLocations();
  const { moments, add: addMoment, remove: removeMoment } = useMoments(id);

  const location = locations.find((l) => l.id === id);

  useEffect(() => {
    load();
  }, [load]);

  if (!location) {
    return <Spin />;
  }

  async function handleDelete() {
    await remove(id);
    message.success("已删除");
    router.push("/travel/list");
  }

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.push("/travel/list")} style={{ marginBottom: 16 }}>
        返回列表
      </Button>

      <Card
        title={location.name}
        extra={
          <div style={{ display: "flex", gap: 8 }}>
            <Tag color={location.checked ? "green" : "blue"}>
              {location.checked ? "已去" : "待去"}
            </Tag>
            <Button size="small" onClick={() => update(id, { checked: !location.checked })}>
              {location.checked ? "标记为待去" : "标记为已去"}
            </Button>
            <UploadImage locationId={id} />
            <Popconfirm title="确认删除此位置？" onConfirm={handleDelete}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </div>
        }
      >
        <p><strong>地址：</strong>{location.address}</p>
        <p><strong>坐标：</strong>{location.longitude.toFixed(6)}, {location.latitude.toFixed(6)}</p>
        {location.comments && <p><strong>备注：</strong>{location.comments}</p>}
      </Card>

      <Card title="精彩瞬间" style={{ marginTop: 16 }}>
        <MomentForm onSubmit={addMoment} />
        <List
          style={{ marginTop: 16 }}
          dataSource={moments}
          renderItem={(moment) => (
            <List.Item
              actions={[
                <Popconfirm key="del" title="删除此瞬间？" onConfirm={() => removeMoment(moment.id)}>
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={moment.date}
                description={moment.text}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: 验证位置详情页**

Run: `pnpm dev`

Expected: /travel/locations/:id 页面显示位置信息和瞬间列表，可添加/删除瞬间。上传封面按钮可点击，配置 OSS 后可正常上传。

- [ ] **Step 7: Commit**

```bash
git add app/travel/ package.json pnpm-lock.yaml
git commit -m "feat: 实现旅行模块位置详情、瞬间管理和 OSS 图片上传"
```

---

### Task 7: 图片下载 API 路由

> 提供服务端代理下载能力，避免前端直接暴露 COS 凭据。
> 参考 TencentOss.getSignedUrl() 签名 URL 机制，服务端生成签名 URL 后重定向。

**Files:**
- Create: `app/api/trip-plan/download/route.ts`

- [ ] **Step 1: 创建图片下载 API**

Create `app/api/trip-plan/download/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getOssAdapter, isOssConfigured } from "@/lib/oss";

/**
 * 图片下载代理 API
 *
 * GET /api/trip-plan/download?type=cover&id=xxx
 * GET /api/trip-plan/download?type=icon&id=xxx
 *
 * 流程参考 TencentOss.getSignedUrl()：
 * 1. 服务端通过 OssAdapter.getSignedUrl() 生成临时访问 URL
 * 2. 302 重定向到签名 URL
 * 3. COS 验证签名后返回文件内容
 *
 * 签名 URL 包含临时访问凭据，无需暴露 SecretId/SecretKey 给前端。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "cover";
  const id = searchParams.get("id") || "";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (!isOssConfigured()) {
    return NextResponse.json({ error: "OSS 未配置" }, { status: 503 });
  }

  try {
    const adapter = getOssAdapter();

    // 根据类型确定 OSS Key
    const ossKey = type === "icon"
      ? `trip-plan/icons/${id}`
      : `trip-plan/covers/${id}`;

    // 检查文件是否存在（参考 TencentOss.exists()）
    const fileExists = await adapter.exists(ossKey);
    if (!fileExists) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 获取签名 URL 并重定向（参考 TencentOss.getSignedUrl()）
    const signedUrl = await adapter.getSignedUrl(ossKey);
    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error("图片下载失败:", err);
    return NextResponse.json(
      { error: "下载失败", message: err.message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trip-plan/
git commit -m "feat: 实现旅行模块图片下载 API（OSS 签名 URL 代理）"
```

---

### Task 8: OSS 单元测试

**Files:**
- Create: `__tests__/lib/oss.test.ts`

- [ ] **Step 1: 写 OSS 适配器测试**

> 测试 `OssAdapter` 接口的 `TencentCosAdapter` 实现。
> 由于 COS SDK 需要真实凭据，测试采用 mock 方式验证逻辑正确性。

```ts filename="__tests__/lib/oss.test.ts"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOssConfigured, resetOssAdapter } from "@/lib/oss";

describe("lib/oss", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetOssAdapter();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("isOssConfigured", () => {
    it("returns false when no OSS vars are set", () => {
      delete process.env.OSS_ENDPOINT;
      delete process.env.OSS_SECRET_ID;
      delete process.env.OSS_SECRET_KEY;
      delete process.env.OSS_BUCKET;
      expect(isOssConfigured()).toBe(false);
    });

    it("returns false when some OSS vars are missing", () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "secret-id";
      process.env.OSS_SECRET_KEY = "secret-key";
      delete process.env.OSS_BUCKET;
      expect(isOssConfigured()).toBe(false);
    });

    it("returns true when all OSS vars are set", () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "secret-id";
      process.env.OSS_SECRET_KEY = "secret-key";
      process.env.OSS_BUCKET = "my-bucket";
      expect(isOssConfigured()).toBe(true);
    });
  });

  describe("getOssAdapter", () => {
    it("throws when OSS is not configured", async () => {
      delete process.env.OSS_ENDPOINT;
      delete process.env.OSS_SECRET_ID;
      delete process.env.OSS_SECRET_KEY;
      delete process.env.OSS_BUCKET;
      const { getOssAdapter } = await import("@/lib/oss");
      expect(() => getOssAdapter()).toThrow(/OSS 未配置/);
    });

    it("returns adapter with correct config when configured", async () => {
      process.env.OSS_ENDPOINT = "ap-shanghai";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter = getOssAdapter();
      expect(adapter.getEndpoint()).toBe("ap-shanghai");
      expect(adapter.getBucket()).toBe("test-bucket");
    });

    it("returns the same instance on repeated calls (singleton)", async () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter1 = getOssAdapter();
      const adapter2 = getOssAdapter();
      expect(adapter1).toBe(adapter2);
    });
  });

  describe("TencentCosAdapter", () => {
    it("lazy initializes SDK on first getSdk() call", async () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter = getOssAdapter();
      // SDK 应该在首次调用 getSdk() 时初始化
      const sdk = (adapter as any).getSdk();
      expect(sdk).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test __tests__/lib/oss.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/oss.test.ts
git commit -m "test: 添加 OSS 适配器单元测试"
```

---

### Task 9: 全量验证

- [ ] **Step 1: 运行全部测试**

Run: `pnpm test`
Expected: PASS — 所有测试通过，无跳过

- [ ] **Step 2: 启动开发服务器验证**

Run: `pnpm dev`

验证以下功能：

| 页面 | 路径 | 期望行为 |
|------|------|----------|
| 地图视图 | /travel | 显示地图，OSS 配置后显示标注 |
| 位置列表 | /travel/list | 显示筛选和添加按钮，OSS 未配置时列表为空 |
| 位置详情 | /travel/locations/:id | 显示位置信息、瞬间列表、上传按钮 |

- [ ] **Step 3: 验证 OSS 集成**

需要配置 `.env.local` 中的腾讯云 COS 环境变量：

```env
OSS_ENDPOINT=ap-beijing
OSS_SECRET_ID=<你的 SecretId>
OSS_SECRET_KEY=<你的 SecretKey>
OSS_BUCKET=<你的 Bucket 名称>
NEXT_PUBLIC_AMAP_KEY=<你的高德地图 Key>
```

验证：
1. 添加位置后数据写入 COS 的 `trip-plan/locations.json`
2. 上传封面后图片写入 COS 的 `trip-plan/covers/{id}`
3. 下载 API (`/api/trip-plan/download?type=cover&id=xxx`) 返回签名 URL 重定向

- [ ] **Step 4: 最终 Commit**

如有修改：
```bash
git add -A
git commit -m "fix: address issues found during full verification"
```

---

## OSS 接入架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React)                              │
│                                                                  │
│  UploadImage ──getUploadUrl()──→ Server Action ──→ OssAdapter   │
│      │                              │                    .getSignedPutUrl()
│      │                              │                    (签名 PUT URL)
│      │                              │                          │
│      └── fetch(PUT signedUrl) ──────┼──────────────────────────┘
│           直传文件到 COS             │
│                                     │
│  <Image src /> ─getImageUrl()──→ Server Action ──→ OssAdapter   │
│                                     │              .getSignedUrl()
│                                     │              (签名 GET URL)
│                                     │
│  下载代理 ─/api/.../download──→ Route Handler ──→ OssAdapter    │
│                                     │              .exists() + .getSignedUrl()
│                                     │              → 302 重定向
└─────────────────────────────────────┼────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   lib/oss.ts (OssAdapter 接口)                    │
│                                                                  │
│  ┌──────────────────────┐    ┌───────────────────────┐          │
│  │ TencentCosAdapter    │    │ AliOssAdapter (未来)    │          │
│  │ cos-nodejs-sdk-v5    │    │ ali-oss               │          │
│  │ 参考 TencentOss.ts   │    │                       │          │
│  └──────────────────────┘    └───────────────────────┘          │
│                                                                  │
│  工厂方法: getOssAdapter() ─ 参考 XpnOss.factory()               │
│  方法: getString, putString, delete, exists,                     │
│        getSignedPutUrl, getSignedUrl, appendString               │
└─────────────────────────────────────────────────────────────────┘
```
