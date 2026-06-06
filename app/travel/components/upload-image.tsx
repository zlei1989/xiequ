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
