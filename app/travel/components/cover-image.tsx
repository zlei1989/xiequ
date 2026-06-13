/**
 * 封面图/头像图组件 — antd-mobile Image 的封装，支持圆角和懒加载
 */

'use client';

import { Image } from 'antd-mobile';

import type { ReactNode } from 'react';

/**
 * 封装 antd-mobile Image，统一处理圆角、懒加载等样式约定
 *
 * 通过 overlay 注入右下角叠加元素（如上传按钮），内部自动处理定位，
 * 外部无需额外包裹 relative 容器。
 */
export function CoverImage({
  src,
  alt,
  width = '100%',
  height = 200,
  fit = 'cover',
  shape = 'rounded',
  fallback,
  overlay,
}: {
  /** 图片地址 */
  src: string;
  /** 无障碍描述 */
  alt: string;
  /** 宽度，默认 100% */
  width?: number | string;
  /** 高度，默认 200 */
  height?: number | string;
  /** 填充方式 */
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /** 形状：圆角或圆形 */
  shape?: 'rounded' | 'circle';
  /** 加载失败时的占位内容 */
  fallback?: ReactNode;
  /** 右下角叠加元素，如上传/删除按钮 */
  overlay?: ReactNode;
}) {
  const image = (
    <Image
      lazy
      alt={alt}
      className={shape === 'circle' ? 'rounded-full' : ''}
      fallback={fallback}
      fit={fit}
      height={height}
      src={src}
      width={width}
    />
  );

  // 无 overlay 时直接返回 Image，避免多余的 DOM 层级
  if (!overlay) return image;

  return (
    <div className="relative">
      {image}
      <div className="absolute bottom-4 right-4">
        {overlay}
      </div>
    </div>
  );
}
