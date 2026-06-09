# OSS Travel Path Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 travel 模块的 OSS 存储路径从 `trip-plan/` 迁移到 `apps/travel/`。

**Architecture:** 这是一次纯粹的路径前缀替换：将 `app/travel/services/oss.ts` 和 `app/travel/api/download/route.ts` 中所有 `trip-plan/` 路径前缀改为 `apps/travel/`。不改变任何逻辑、接口或数据流。

**Tech Stack:** Next.js (App Router), 腾讯云 COS

**注意：** 此迁移仅修改代码中的路径常量。已存储在 OSS 上的旧文件（`trip-plan/locations.json`、`trip-plan/covers/*`、`trip-plan/icons/*`）不会自动迁移，需要手动处理或编写迁移脚本。

---

### Task 1: 修改 oss.ts 中的路径常量和所有路径引用

**Files:**
- Modify: `app/travel/services/oss.ts:6-15,86,104,176,258,268,275`

- [ ] **Step 1: 修改文件头注释中的路径说明**

在 `app/travel/services/oss.ts` 第 6-13 行，将注释中的路径更新：

```typescript
/**
 * 旅行模块 OSS 存储路径约定
 * - 位置数据: apps/travel/locations.json
 * - 位置封面: apps/travel/covers/{id}
 * - 位置图标: apps/travel/icons/{id}
 *
 * 路径规则与旧项目保持一致。
 */
```

- [ ] **Step 2: 修改 LOCATIONS_KEY 常量**

在 `app/travel/services/oss.ts` 第 15 行：

```typescript
const LOCATIONS_KEY = "apps/travel/locations.json";
```

- [ ] **Step 3: 修改 getLocations 函数的 JSDoc 注释**

在 `app/travel/services/oss.ts` 第 86 行：

```typescript
 * 从 OSS 的 apps/travel/locations.json 读取。
```

- [ ] **Step 4: 修改 saveLocations 函数的 JSDoc 注释**

在 `app/travel/services/oss.ts` 第 104 行：

```typescript
 * 将位置数据写入 OSS 的 apps/travel/locations.json。
```

- [ ] **Step 5: 修改 deleteLocation 中的封面删除路径**

在 `app/travel/services/oss.ts` 第 176 行：

```typescript
    await ossDelete(`apps/travel/covers/${id}`);
```

- [ ] **Step 6: 修改 getCoverUploadUrl 中的封面上传路径**

在 `app/travel/services/oss.ts` 第 258 行：

```typescript
  return ossGetSignedPutUrl(`apps/travel/covers/${id}`);
```

- [ ] **Step 7: 修改 getCoverDownloadUrl 中的封面下载路径**

在 `app/travel/services/oss.ts` 第 268 行：

```typescript
  return ossGetSignedUrl(`apps/travel/covers/${id}`);
```

- [ ] **Step 8: 修改 getIconDownloadUrl 中的图标下载路径**

在 `app/travel/services/oss.ts` 第 275 行：

```typescript
  return ossGetSignedUrl(`apps/travel/icons/${id}`);
```

- [ ] **Step 9: 验证 oss.ts 中不再残留旧路径**

```bash
grep -n "trip-plan" app/travel/services/oss.ts
```

Expected: 无输出（所有 `trip-plan` 已替换）

- [ ] **Step 10: 提交**

```bash
git add app/travel/services/oss.ts
git commit -m "refactor(travel): migrate OSS paths from trip-plan/ to apps/travel/ in oss.ts"
```

---

### Task 2: 修改 download route 中的路径引用

**Files:**
- Modify: `app/travel/api/download/route.ts:34-36`

- [ ] **Step 1: 修改 ossKey 构造逻辑中的路径前缀**

在 `app/travel/api/download/route.ts` 第 34-36 行：

```typescript
    const ossKey = type === "icon"
      ? `apps/travel/icons/${id}`
      : `apps/travel/covers/${id}`;
```

- [ ] **Step 2: 验证 route.ts 中不再残留旧路径**

```bash
grep -n "trip-plan" app/travel/api/download/route.ts
```

Expected: 无输出（所有 `trip-plan` 已替换）

- [ ] **Step 3: 提交**

```bash
git add app/travel/api/download/route.ts
git commit -m "refactor(travel): migrate OSS paths from trip-plan/ to apps/travel/ in download route"
```

---

### Task 3: 全局验证和构建检查

**Files:**
- 验证: `app/travel/services/oss.ts`
- 验证: `app/travel/api/download/route.ts`

- [ ] **Step 1: 全局搜索确保没有残留的 trip-plan 路径在 app 代码中**

```bash
grep -rn "trip-plan" app/
```

Expected: 无输出或仅剩文档注释引用（非代码路径）

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: 构建检查**

```bash
pnpm build
```

Expected: 构建成功

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore(travel): verify no trip-plan path residuals, typecheck passes"
```

---

## 迁移后注意事项

1. **OSS 存量数据**：`trip-plan/locations.json` 不会自动迁移到 `apps/travel/locations.json`。部署前需要：
   - 将 OSS 中的 `trip-plan/locations.json` 复制到 `apps/travel/locations.json`
   - 将 `trip-plan/covers/` 下的所有封面图移动/复制到 `apps/travel/covers/`
   - 将 `trip-plan/icons/` 下的所有图标移动/复制到 `apps/travel/icons/`

2. **数据兼容性**：`locations.json` 的 JSON 结构完全不变，只是存储路径改变，无需数据迁移脚本。

3. **CDN 缓存**：如果有 CDN 缓存 `trip-plan/` 路径，需要更新或清除。
