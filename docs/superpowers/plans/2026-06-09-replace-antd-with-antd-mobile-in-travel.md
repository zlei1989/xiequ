# Replace antd with antd-mobile in app/travel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app/travel` 目录中剩余 2 个文件的 `antd` 导入替换为 `antd-mobile`，消除对 antd（web 版）的依赖。

**Architecture:** 只有两个文件仍在使用 antd：`moment-form.tsx` 和 `upload-image.tsx`，其余文件已全部使用 antd-mobile。替换策略是：moment-form 改为受控组件模式（与 `moment-edit-popup.tsx` 一致），upload-image 用原生 `<input type="file">` 替代 antd Upload。

**Tech Stack:** React, antd-mobile, antd-mobile-icons, TypeScript, dayjs（在 moment-form 中将被移除）

---

## 影响范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/travel/components/moment-form.tsx` | 修改 | antd → antd-mobile，改为受控组件 |
| `app/travel/components/upload-image.tsx` | 修改 | antd → antd-mobile + 原生 input[type=file] |

## 组件映射

| antd (web) | antd-mobile 替代 | 备注 |
|---|---|---|
| `Form` / `Form.useForm()` / `Form.Item` | `Form` + `Form.Item`（受控组件模式） | antd-mobile 不支持 `layout="inline"` |
| `Input` | `Input` | API 兼容 |
| `DatePicker` | 原生 `<input type="date">` | antd-mobile DatePicker 是弹出选择器，不适用于 inline 表单 |
| `Button` | `Button` | `type="primary"` → `color="primary"`；`htmlType` → `type` |
| `message.success/error` | `Toast.show()` | 全局静态方法 → `Toast.show({ icon, content })` |
| `Upload` | 原生 `<input type="file">` + `useRef` | antd-mobile 无需 Upload，只用作文件选择触发器 |
| `Image` | `Image` | API 略有差异（`fallback` 类型不同） |
| `CameraOutlined` | `CameraOutline` | 从 `antd-mobile-icons` 导入 |

---

### Task 1: 替换 moment-form.tsx 中的 antd

**Files:**
- Modify: `app/travel/components/moment-form.tsx`

- [ ] **Step 1: 将 moment-form.tsx 改为受控组件 + antd-mobile**

将文件内容替换为：

```tsx
"use client";

import { useState } from "react";
import { Form, Input, Button, Toast } from "antd-mobile";

export function MomentForm({
  onSubmit,
}: {
  onSubmit: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!date) {
      Toast.show({ icon: "fail", content: "请选择日期" });
      return;
    }
    if (!text.trim()) {
      Toast.show({ icon: "fail", content: "请输入内容" });
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ date, text });
      setDate("");
      setText("");
      Toast.show({ icon: "success", content: "已添加" });
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form layout="horizontal" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <Form.Item label="日期" style={{ flexShrink: 0 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            padding: "6px 8px",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            fontSize: 14,
          }}
        />
      </Form.Item>
      <Form.Item label="内容" style={{ flex: 1, minWidth: 0 }}>
        <Input
          value={text}
          onChange={setText}
          placeholder="记录这一刻..."
        />
      </Form.Item>
      <Form.Item style={{ flexShrink: 0, alignSelf: "flex-end" }}>
        <Button
          color="primary"
          type="submit"
          loading={submitting}
          onClick={handleSubmit}
        >
          添加
        </Button>
      </Form.Item>
    </Form>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -E "moment-form|error" || echo "No errors in moment-form.tsx"
```

- [ ] **Step 3: 验证无 antd 残留引用**

```bash
grep -n "from \"antd\"" app/travel/components/moment-form.tsx && echo "STILL HAS ANTD IMPORT" || echo "Clean: no antd references"
```

- [ ] **Step 4: Commit**

```bash
git add app/travel/components/moment-form.tsx
git commit -m "refactor(travel): replace antd with antd-mobile in MomentForm"
```

---

### Task 2: 替换 upload-image.tsx 中的 antd

**Files:**
- Modify: `app/travel/components/upload-image.tsx`

- [ ] **Step 1: 将 upload-image.tsx 改为 antd-mobile + 原生文件选择器**

将文件内容替换为：

```tsx
"use client";

import { Button, Image, Toast } from "antd-mobile";
import { CameraOutline } from "antd-mobile-icons";
import { useState, useEffect, useRef } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // 清空 input 以便重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

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
      Toast.show({ icon: "success", content: "上传成功" });
    } catch (err: any) {
      Toast.show({ icon: "fail", content: "上传失败: " + err.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <Button
        onClick={() => fileInputRef.current?.click()}
        loading={uploading}
      >
        <CameraOutline />
      </Button>
      {previewUrl && (
        <Image
          src={previewUrl}
          alt="封面"
          width={40}
          height={40}
          fit="cover"
          style={{ borderRadius: 4 }}
          fallback={
            <div
              style={{
                width: 40,
                height: 40,
                background: "#f0f0f0",
                borderRadius: 4,
              }}
            />
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -E "upload-image|error" || echo "No errors in upload-image.tsx"
```

- [ ] **Step 3: 验证无 antd 残留引用**

```bash
grep -rn "from \"antd\"" app/travel/components/upload-image.tsx && echo "STILL HAS ANTD IMPORT" || echo "Clean: no antd references"
grep -rn "from \"@ant-design" app/travel/components/upload-image.tsx && echo "STILL HAS @ant-design IMPORT" || echo "Clean: no @ant-design references"
```

- [ ] **Step 4: Commit**

```bash
git add app/travel/components/upload-image.tsx
git commit -m "refactor(travel): replace antd Upload/Image with antd-mobile in UploadImage"
```

---

### Task 3: 最终验证

- [ ] **Step 1: 全局搜索确认 app/travel 目录无 antd（web）残留**

```bash
grep -rn "from \"antd\"" app/travel/ && echo "FAIL: antd references remaining!" || echo "PASS: no antd references"
```

- [ ] **Step 2: 全局搜索确认 @ant-design/icons 无残留**

```bash
grep -rn "from \"@ant-design" app/travel/ && echo "FAIL: @ant-design references remaining!" || echo "PASS: no @ant-design references"
```

- [ ] **Step 3: 完整 TypeScript 类型检查**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

确认无新增类型错误。

- [ ] **Step 4: 验证引用的组件存在于 antd-mobile**

```bash
grep -rn "from \"antd-mobile\"" app/travel/ | while read line; do echo "$line" | grep -oP 'import \{[^}]+\}' | tr ',' '\n' | sed 's/import {//;s/}//;s/^ *//'; done | sort -u
```

确认所有导入的组件名称在 antd-mobile 中存在。

- [ ] **Step 5: 最终 Commit**

如果你将 Task 1 和 Task 2 的 commit 合并为一个更干净的提交：

```bash
git log --oneline -3
# 此时应该看到两个 refactor commit
```

或者保持分离的提交记录，取决于你的偏好。
