'use client';

/**
 * 离线兜底页
 *
 * 当用户断网时，Service Worker 拦截导航请求并返回此页面。
 * Client Component（依赖 antd-mobile），使用 Tailwind CSS 保持风格统一。
 */

import { Button, ErrorBlock } from 'antd-mobile';

/**
 * 离线状态展示组件
 *
 * 显示网络断开提示和重新加载按钮。
 * 用户点击按钮后若网络已恢复则正常进入首页。
 */
export default function OfflinePage() {
  const handleReload = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <ErrorBlock
        description="请检查网络设置后重试"
        status="disconnected"
        title="当前无网络连接"
      >
        <Button color="primary" onClick={handleReload}>
          重新加载
        </Button>
      </ErrorBlock>
    </div>
  );
}
