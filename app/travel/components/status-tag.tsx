/**
 * 状态标签组件 — "已去"（绿色）/ "待去"（蓝色）
 */

'use client';

import { Tag } from 'antd-mobile';

/**
 * 根据 checked 状态展示"已去"（绿色）或"待去"（蓝色）标签
 */
export function StatusTag({ checked }: { checked: boolean }) {
  return (
    <Tag color={checked ? 'success' : 'primary'} fill="outline">
      {checked ? '已去' : '待去'}
    </Tag>
  );
}
