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
 *
 * 仅允许 image/jpeg 格式上传。
 */

'use client';

import { Button, Space, Toast } from 'antd-mobile';
import { CameraOutline } from 'antd-mobile-icons';
import { useEffect, useRef, useState } from 'react';

import { getImageUrl, getUploadUrl } from '../actions';
export function UploadImage({
  locationId,
  type = 'cover',
  onSuccess,
}: {
  locationId: string;
  type?: 'cover' | 'icon';
  onSuccess?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadPreview() {
      try {
        const url = await getImageUrl(locationId, type);
        setPreviewUrl(url);
      } catch {
        // 预览加载失败不阻塞 UI，静默降级
        setPreviewUrl(null);
      }
    }
    void loadPreview();
  }, [locationId, type]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  /**
   * 三阶段上传流程：
   * 1. 调用 Server Action getUploadUrl 获取 COS 预签名 PUT URL
   * 2. 使用 fetch PUT 直传文件到 COS（仅支持 image/jpeg）
   * 3. 调用 getImageUrl 刷新预览并回调 onSuccess
   * 各阶段耗时 >500ms 时打 INFO 日志，失败时打 ERROR 日志并 Toast。
   */
  async function handleUpload(file: File) {
    // 仅允许 JPG 格式
    if (!file.type.startsWith('image/jpeg')) {
      Toast.show({ icon: 'fail', content: '仅支持 JPG 格式图片' });
      return;
    }

    setUploading(true);
    const startTime = Date.now();
    try {
      const signedUrl = await getUploadUrl(locationId, type);
      const fetchStart = Date.now();
      const response = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      const fetchElapsed = Date.now() - fetchStart;

      if (!response.ok) {
        throw new Error(`上传失败: ${String(response.status)} ${response.statusText}`);
      }
      if (fetchElapsed > 500) {
        console.info(`[Travel] COS 上传耗时 ${String(fetchElapsed)}ms, locationId=${locationId}, type=${type}, size=${String(file.size)}`);
      }

      const downloadUrl = await getImageUrl(locationId, type);
      setPreviewUrl(downloadUrl);
      onSuccess?.();
      Toast.show({ icon: 'success', content: '上传成功' });
      const totalElapsed = Date.now() - startTime;
      if (totalElapsed > 500) {
        console.info(`[Travel] 图片上传总耗时 ${String(totalElapsed)}ms, locationId=${locationId}, type=${type}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上传失败';
      console.error('[Travel] 图片上传失败:', err, { locationId, type, fileName: file.name });
      if (err instanceof Error && err.stack) console.error(err.stack);
      Toast.show({ icon: 'fail', content: '上传失败: ' + message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Space align="center">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg"
        style={{ display: 'none' }}
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
    </Space>
  );
}
