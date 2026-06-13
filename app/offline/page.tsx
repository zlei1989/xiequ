'use client';

/**
 * 离线兜底页
 *
 * 当用户断网时，Service Worker 拦截导航请求并返回此页面。
 * Client Component（依赖 antd-mobile），使用 Tailwind CSS 保持风格统一。
 */

import { Result } from 'antd-mobile';
import Link from 'next/link';

/**
 * 离线状态展示组件
 *
 * 显示网络断开提示和返回首页的链接。
 * 用户点击链接后若网络已恢复则正常渲染目标页面。
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Result
        description="请检查网络设置后重试"
        status="error"
        title="当前无网络连接"
      />
      <div className="mt-6 text-center">
        <Link
          className="inline-block rounded-lg px-6 py-3 no-underline"
          href="/"
          style={{ backgroundColor: 'var(--adm-color-primary, #1677ff)', color: '#fff' }}
        >
          重新加载
        </Link>
      </div>
    </div>
  );
}
