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
