# OSS Travel Path Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 travel 模块图片存储路径从 `apps/travel/covers/`+`apps/travel/icons/` 统一改为 `apps/travel/posters/{id}.jpg`，通过 COS CI 样式后缀（`/{id}.jpg/{stylename}`）区分处理样式，download API 改为 302 重定向。

**Architecture:** 图片统一存储到 `apps/travel/posters/{id}.jpg`，通过 URL 后缀 `/cover` 或 `/icon` 区分 COS CI 处理样式。`getImageUrl` 返回样式 URL，`getUploadUrl` 上传到统一 poster 路径含 `.jpg` 后缀，download 路由 302 重定向到样式 URL。

**Tech Stack:** Next.js (App Router), 腾讯云 COS + CI 图片处理

---

### Task 1: 重构 oss.ts — 统一 poster 路径 + 样式 URL

**Files:**
- Modify: `app/travel/services/oss.ts`

- [ ] **Step 1: 修改文件头注释**

将 `app/travel/services/oss.ts` 第 6-13 行的注释更新为：

```typescript
/**
 * 旅行模块 OSS 存储路径约定
 * - 位置数据: apps/travel/locations.json
 * - 图片统一: apps/travel/posters/{id}.jpg
 *
 * 访问 URL 格式（COS CI 样式处理）：
 * - https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{stylename}
 * - stylename: cover | icon
 */
```

- [ ] **Step 2: 新增 OSS 基础 URL 构造函数**

在 `oss.ts` 的通用操作区域（约第 16 行之后）新增：

```typescript
/**
 * 构造 OSS 公共访问基础 URL
 *
 * 格式：https://{bucket}.cos.{region}.myqcloud.com
 * 用于拼接带 COS CI 样式后缀的图片访问地址。
 */
function getOssBaseUrl(): string {
  const adapter = getOssAdapter();
  return `https://${adapter.getBucket()}.cos.${adapter.getEndpoint()}.myqcloud.com`;
}
```

- [ ] **Step 3: 修改 deleteLocation 中的图片删除路径**

将第 176 行的：
```typescript
    await ossDelete(`apps/travel/covers/${id}`);
```
改为：
```typescript
    await ossDelete(`apps/travel/posters/${id}.jpg`);
```

- [ ] **Step 4: 重构图片上传/下载函数**

将第 249-293 行的整个"图片签名 URL"区域替换为：

```typescript
// ─── 图片上传 / 访问 ────────────────────────────────────────────────────

/**
 * 获取 poster 上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传图片到 COS。
 * 所有图片（封面/图标）统一上传到 apps/travel/posters/{id}.jpg。
 */
export async function getPosterUploadUrl(id: string): Promise<string> {
  return ossGetSignedPutUrl(`apps/travel/posters/${id}.jpg`);
}

/**
 * 获取 poster 访问 URL（COS CI 样式处理）
 *
 * 通过 URL 后缀指定 COS CI 处理样式，格式：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{stylename}
 *
 * @param id - 图片标识
 * @param stylename - 样式名：cover | icon
 */
export function getPosterStyledUrl(id: string, stylename: "cover" | "icon"): string {
  return `${getOssBaseUrl()}/apps/travel/posters/${id}.jpg/${stylename}`;
}
```

- [ ] **Step 5: 删除 getCoverProxyUrl 和 getIconProxyUrl**

这两个函数已不再被任何组件使用，从 oss.ts 中移除。

- [ ] **Step 6: 验证 oss.ts 无残留旧路径**

```bash
grep -n "covers\|icons\|trip-plan\|getCover\|getIcon\|ProxyUrl" app/travel/services/oss.ts
```

Expected: 无输出

- [ ] **Step 7: 提交**

```bash
git add app/travel/services/oss.ts
git commit -m "refactor(travel): unify poster storage path, use COS CI styled URLs"
```

---

### Task 2: 更新 actions.ts — 对接新函数签名

**Files:**
- Modify: `app/travel/actions.ts`

- [ ] **Step 1: 更新 import**

将第 11-12 行：
```typescript
  getCoverUploadUrl,
  getCoverDownloadUrl,
```
改为：
```typescript
  getPosterUploadUrl,
  getPosterStyledUrl,
```

- [ ] **Step 2: 更新 getUploadUrl — 调用新上传函数**

将第 61-63 行：
```typescript
export async function getUploadUrl(id: string, type: "cover" | "icon" = "cover") {
  return getCoverUploadUrl(id);
}
```
改为：
```typescript
export async function getUploadUrl(id: string, type: "cover" | "icon" = "cover") {
  return getPosterUploadUrl(id);
}
```

- [ ] **Step 3: 更新 getImageUrl — 返回样式 URL**

将第 71-73 行：
```typescript
export async function getImageUrl(id: string, type: "cover" | "icon" = "cover") {
  return getCoverDownloadUrl(id);
}
```
改为：
```typescript
export async function getImageUrl(id: string, type: "cover" | "icon" = "cover") {
  return getPosterStyledUrl(id, type);
}
```

- [ ] **Step 4: 更新注释**

将第 53-60 行的 `getUploadUrl` 注释更新为：
```typescript
/**
 * 获取图片上传签名 URL
 *
 * 前端拿到签名 URL 后直接 PUT 上传到 COS 的 apps/travel/posters/{id}.jpg。
 */
```

将第 65-70 行的 `getImageUrl` 注释更新为：
```typescript
/**
 * 获取图片访问 URL（COS CI 样式处理）
 *
 * 返回带样式后缀的公共访问地址：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{type}
 */
```

- [ ] **Step 5: 提交**

```bash
git add app/travel/actions.ts
git commit -m "refactor(travel): wire actions to unified poster upload/styled URL"
```

---

### Task 3: 更新 download route — 适配 poster 路径

**Files:**
- Modify: `app/travel/api/download/route.ts`

- [ ] **Step 1: 修改 ossKey 为 poster 路径**

将第 34-36 行：
```typescript
    const ossKey = type === "icon"
      ? `apps/travel/icons/${id}`
      : `apps/travel/covers/${id}`;
```
改为：
```typescript
    const ossKey = `apps/travel/posters/${id}.jpg`;
```

- [ ] **Step 2: 302 重定向到 COS CI 样式 URL**

将第 44-46 行的：
```typescript
    const signedUrl = await adapter.getSignedUrl(ossKey);
    return NextResponse.redirect(signedUrl);
```
改为 302 重定向到 COS CI 样式 URL：
```typescript
    const bucket = adapter.getBucket();
    const region = adapter.getEndpoint();
    const styledUrl = `https://${bucket}.cos.${region}.myqcloud.com/apps/travel/posters/${id}.jpg/${type}`;
    return NextResponse.redirect(styledUrl);
```

- [ ] **Step 3: 更新文件头注释**

将第 4-15 行的注释更新为：
```typescript
/**
 * 图片访问 API
 *
 * GET /travel/api/download?type=cover&id=xxx
 * GET /travel/api/download?type=icon&id=xxx
 *
 * 重定向到 COS CI 样式后缀的公共访问 URL：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{type}
 */
```

- [ ] **Step 4: 提交**

```bash
git add app/travel/api/download/route.ts
git commit -m "refactor(travel): update download route to poster path with styled URL redirect"
```

---

### Task 4: 全局验证

- [ ] **Step 1: 全局搜索确保无残留旧路径**

```bash
grep -rn "covers/\|/icons/" app/
```

Expected: 仅 `upload-image.tsx` 中的 `CameraOutline` icon import 和 `camera-button` 文件名（非 OSS 路径）

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

确认无新增类型错误（已有 device-editor.tsx 错误不相关）

- [ ] **Step 3: 构建检查**

```bash
pnpm build
```

确认编译成功

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore(travel): verify poster path migration complete"
```

---

## 迁移后注意事项

1. **OSS 存量数据**：`apps/travel/covers/` 下的文件需手动迁移到 `apps/travel/posters/` 并加 `.jpg` 后缀。
2. **COS CI 样式**：`cover` 和 `icon` 样式需在腾讯云 COS CI 控制台预先配置。
3. **签名 URL**：上传仍使用签名 PUT URL（私有写），但访问改用公共 URL + 样式后缀（需 bucket 配置公共读或 CDN 加速）。
