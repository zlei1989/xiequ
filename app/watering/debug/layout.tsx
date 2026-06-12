/**
 * 调试面板布局 — 仅在 NODE_ENV=development 时渲染子页面
 */

import type { ReactNode } from 'react';

export default function DebugLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="py-12 text-center text-gray-400">
        调试面板仅在开发环境可用
      </div>
    );
  }

  return <>{children}</>;
}
