/**
 * 位置列表项 — 支持左滑操作（切换状态/删除），有精彩瞬间时状态锁定
 */

'use client';

import { Dialog, List, SwipeAction, Tag, Toast } from 'antd-mobile';

import { CoverImage } from './cover-image';

import type { Location } from '../types';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/**
 * 位置列表行组件
 *
 * 基于 antd-mobile SwipeAction 实现左滑操作 ——
 * 切换状态（已有精彩瞬间时隐藏）和删除（需二次确认）。
 * 点击行触发 onClick 回调。
 */
export function LocationListItem({
  location,
  hasMoments,
  onClick,
  onToggle,
  onDelete,
}: {
  location: Location;
  hasMoments: boolean;
  onClick: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
}) {
  const iconUrl = `/travel/api/download?type=icon&id=${location.id}`;

  /**
   * 左滑切换位置状态 —— 调用父组件 onToggle 执行 Server Action，
   * 失败时打 ERROR 日志并 Toast 提示。
   */
  async function handleToggle() {
    try {
      await onToggle(location);
    } catch (err: unknown) {
      console.error('[Travel] 切换位置状态失败:', err, { locationId: location.id });
      if (err instanceof Error && err.stack) console.error(err.stack);
      Toast.show({ icon: 'fail', content: getErrorMessage(err, '操作失败') });
    }
  }

  /**
   * 左滑删除位置 —— 二次确认后调用父组件 onDelete 执行 Server Action，
   * 失败时打 ERROR 日志并 Toast 提示。
   */
  function handleDelete() {
    void Dialog.confirm({
      content: `确认删除「${location.name}」及备注等信息？不可恢复。`,
      confirmText: '确定',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await onDelete(location);
        } catch (err: unknown) {
          console.error('[Travel] 删除位置失败:', err, { locationId: location.id });
          if (err instanceof Error && err.stack) console.error(err.stack);
          Toast.show({ icon: 'fail', content: getErrorMessage(err, '删除失败') });
        }
      },
    });
  }

  return (
    <SwipeAction
      rightActions={[
        // 有精彩瞬间时隐藏切换按钮（状态锁定为已去）
        ...(hasMoments ? [] : [{
          key: 'toggle',
          text: location.checked ? '标记待去' : '标记已去',
          color: 'light' as const,
          onClick: handleToggle,
        }]),
        {
          key: 'delete',
          text: '删除',
          color: 'danger' as const,
          onClick: handleDelete,
        },
      ]}
    >
      <List.Item
        description={location.address}
        extra={
          <Tag color={location.checked ? 'success' : 'primary'} fill="outline">
            {location.checked ? '已去' : '待去'}
          </Tag>
        }
        prefix={
          <CoverImage
            alt={location.name}
            height={44}
            shape="circle"
            src={iconUrl}
            width={44}
          />
        }
        onClick={() => { onClick(location); }}
      >
        {location.name}
      </List.Item>
    </SwipeAction>
  );
}
