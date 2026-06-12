/**
 * 封面图/头像图组件 — antd-mobile Image 的封装，支持圆角和懒加载
 */

'use client';

import { Image } from 'antd-mobile';

import type { CSSProperties, ReactNode } from 'react';

/**
 * 封装 antd-mobile Image，统一处理圆角、懒加载等样式约定
 */
export function CoverImage({
  src,
  alt,
  width = '100%',
  height = 200,
  fit = 'cover',
  shape = 'rounded',
  fallback,
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
}) {
  /** 圆形时强制 50% 圆角；圆角形状由 antd-mobile Image 默认处理 */
  const style: CSSProperties = {
    borderRadius: shape === 'circle' ? '50%' : undefined,
  };

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      fit={fit}
      style={style}
      fallback={fallback}
      lazy
    />
  );
}
