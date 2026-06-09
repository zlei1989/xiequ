# 上传封面图后自动刷新 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上传封面图成功后，LocationViewPopup 顶部 CoverImage 自动刷新显示新图。

**Architecture:** UploadImage 新增可选 `onSuccess` 回调 prop，上传成功后调用；LocationViewPopup 维护 `coverKey` 时间戳 state，`onSuccess` 触发更新，coverUrl 追加 `&_t=` 缓存破坏参数使浏览器重新请求。

**Tech Stack:** Next.js (App Router), React, TypeScript, antd-mobile

---

### Task 1: UploadImage 新增 onSuccess prop

**Files:**
- Modify: `app/travel/components/upload-image.tsx`

- [ ] **Step 1: 在 props 类型和参数解构中新增 `onSuccess`**

找到第 20-26 行的函数签名，添加 `onSuccess` 参数：

```tsx
export function UploadImage({
  locationId,
  type = "cover",
  onSuccess,
}: {
  locationId: string;
  type?: "cover" | "icon";
  onSuccess?: () => void;
}) {
```

Edit: `app/travel/components/upload-image.tsx:20-26`
- old: `export function UploadImage({` 到 `}) {`（只包含 locationId 和 type）
- new: 添加 `onSuccess` 到参数解构和类型定义

- [ ] **Step 2: 在 handleUpload 成功后调用 onSuccess**

找到 `handleUpload` 函数中第 75-77 行（Toast 之前），插入 `onSuccess?.()`：

```tsx
      const downloadUrl = await getImageUrl(locationId, type);
      setPreviewUrl(downloadUrl);
      onSuccess?.();
      Toast.show({ icon: "success", content: "上传成功" });
```

Edit: `app/travel/components/upload-image.tsx:76`

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty app/travel/components/upload-image.tsx
```

Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add app/travel/components/upload-image.tsx
git commit -m "feat(upload): add optional onSuccess callback prop"
```

---

### Task 2: LocationViewPopup 接入缓存破坏

**Files:**
- Modify: `app/travel/components/location-view-popup.tsx`

- [ ] **Step 1: 新增 coverKey state**

在组件顶部 `loc` 常量下方（第 41 行之后），添加 state：

```tsx
  const loc = location;
  const [coverKey, setCoverKey] = useState(Date.now());
```

Edit: `app/travel/components/location-view-popup.tsx:42` — 在 `const loc = location;` 和 `const coverUrl = ...` 之间插入 state 声明。

- [ ] **Step 2: 修改 coverUrl 追加缓存破坏参数**

将第 42 行：

```tsx
  const coverUrl = `/travel/api/download?type=cover&id=${loc.id}`;
```

改为：

```tsx
  const coverUrl = `/travel/api/download?type=cover&id=${loc.id}&_t=${coverKey}`;
```

Edit: `app/travel/components/location-view-popup.tsx:42`

- [ ] **Step 3: UploadImage 传入 onSuccess 回调**

找到第 101 行的 `<UploadImage>` 组件，添加 `onSuccess` prop：

```tsx
          <UploadImage
            locationId={loc.id}
            type="cover"
            onSuccess={() => setCoverKey(Date.now())}
          />
```

Edit: `app/travel/components/location-view-popup.tsx:101`

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty app/travel/components/location-view-popup.tsx
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/travel/components/location-view-popup.tsx
git commit -m "feat(travel): auto-refresh cover image after upload via cache busting"
```

---

## 验证 Checklist

改动完成后，手动验证：

1. 打开 travel 页面，点击地点进入 LocationViewPopup
2. 确认顶部封面图正常显示
3. 点击封面图上的相机按钮，选择一张 JPG 图片上传
4. 上传成功后，顶部封面图自动刷新为新图片
5. 上传失败时，封面图保持不变（不刷新）
