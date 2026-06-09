# 上传封面图后自动刷新设计

**日期**: 2026-06-09
**状态**: 设计中

## 背景

`LocationViewPopup` 顶部展示大封面图 `CoverImage`，其上方叠加了 `UploadImage` 上传按钮。用户上传新封面图后，OSS 文件已被替换，但 `CoverImage` 的 `src` 未变，浏览器缓存导致旧图仍显示。

## 目标

上传封面图成功后，`LocationViewPopup` 顶部的 `CoverImage` 自动刷新显示新图。

## 方案

采用时间戳缓存破坏（Cache Busting）：在 `coverUrl` 追加 `?_t=${timestamp}` 参数，上传成功后更新时间戳，浏览器将其视为新 URL 重新请求。

## 数据流

```
UploadImage 上传成功 → 调用 onSuccess 回调
     ↓
LocationViewPopup 递增 coverKey (Date.now())
     ↓
coverUrl: /travel/api/download?type=cover&id=xxx&_t=1717939200000
     ↓
CoverImage 收到新 src → antd-mobile Image 组件重新请求
```

## 改动文件

### 1. `app/travel/components/upload-image.tsx`

新增可选的 `onSuccess` prop，上传成功后调用：

```tsx
export function UploadImage({
  locationId,
  type = "cover",
  onSuccess,  // 新增
}: {
  locationId: string;
  type?: "cover" | "icon";
  onSuccess?: () => void;  // 新增
})
```

在 `handleUpload` 中，Toast 前调用 `onSuccess?.()`。

### 2. `app/travel/components/location-view-popup.tsx`

- 新增 state：`const [coverKey, setCoverKey] = useState(Date.now())`
- `coverUrl` 改为：const coverUrl = `/travel/api/download?type=cover&id=${loc.id}&_t=${coverKey}`
- `UploadImage` 传入：`onSuccess={() => setCoverKey(Date.now())}`

## 边界情况

- `onSuccess` 为可选 prop，不影响 `UploadImage` 在其他位置（如独立使用）的兼容性
- 仅上传成功时触发刷新，失败不触发
- 时间戳参数在 COS 重定向后被忽略，仅用于前端缓存破坏，不影响后端

## 不涉及

- `LocationListItem` 的 icon 图片不在此次改动范围内
- 不修改 `/travel/api/download` 下载路由
- 不修改 `CoverImage` 组件本身
