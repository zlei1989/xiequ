"use client";

import { Button, Image, Space, Toast } from "antd-mobile";
import { CameraOutline } from "antd-mobile-icons";
import { useEffect, useRef, useState } from "react";
import { getImageUrl, getUploadUrl } from "../actions";

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

  useEffect(() => {
    async function loadPreview() {
      try {
        const url = await getImageUrl(locationId, type);
        setPreviewUrl(url);
      } catch {
        setPreviewUrl(null);
      }
    }
    loadPreview();
  }, [locationId, type]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const signedUrl = await getUploadUrl(locationId, type);
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

      const downloadUrl = await getImageUrl(locationId, type);
      setPreviewUrl(downloadUrl);
      Toast.show({ icon: "success", content: "上传成功" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "上传失败";
      Toast.show({ icon: "fail", content: "上传失败: " + message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Space align="center">
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
        shape="rounded"
        fill="outline"
      >
        <CameraOutline />
      </Button>
      {previewUrl && (
        <Image src={previewUrl} alt="封面" width={40} height={40} fit="cover" />
      )}
    </Space>
  );
}
