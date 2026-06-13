/**
 * 通用操作栏组件 — 底部 Footer 中排列一组操作按钮
 */

'use client';

import { Button, Footer, Space } from 'antd-mobile';

/** 操作按钮配置 */
type Action = {
  /** 唯一标识 */
  key: string;
  /** 按钮文本 */
  text: string;
  /** 按钮颜色，对应 antd-mobile Button color */
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  /** 填充模式：实底、线框或无 */
  fill?: 'solid' | 'outline' | 'none';
  /** 是否显示加载态 */
  loading?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick: () => void;
};

/**
 * 渲染底部操作栏，将 Action 数组映射为一组按钮
 */
export function ActionBar({ actions }: { actions: Action[] }) {
  return (
    <Footer
      content={
        <Space wrap>
          {actions.map((action) => (
            <Button
              color={action.color}
              disabled={action.disabled}
              fill={action.fill}
              key={action.key}
              loading={action.loading}
              size="small"
              onClick={action.onClick}
            >
              {action.text}
            </Button>
          ))}
        </Space>
      }
    />
  );
}
