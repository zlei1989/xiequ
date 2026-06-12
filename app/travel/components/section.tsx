/**
 * 通用 Section 组件 — 带标题和额外操作区的 Card 包装
 */

'use client';

import { Card } from 'antd-mobile';

import type { ReactNode } from 'react';

/**
 * 带标题和可选操作区的 Card 容器
 */
export function Section({
  title,
  extra,
  children,
}: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title} extra={extra}>
      {children}
    </Card>
  );
}
