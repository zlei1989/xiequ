/**
 * 浇花模块布局
 *
 * 使用 antd-mobile SafeArea 适配刘海屏，顶部和底部留出安全区域，
 * 中间 content 区域填充剩余空间并允许滚动。
 */

'use client';

import { SafeArea } from 'antd-mobile';

import type { ReactNode } from 'react';

/** 浇花模块布局 — SafeArea + 内容区 */
export default function WateringLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <SafeArea position="top" />
      <div className="flex-1 overflow-auto">{children}</div>
      <SafeArea position="bottom" />
    </div>
  );
}
