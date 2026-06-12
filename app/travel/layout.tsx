/**
 * 旅行计划模块布局
 *
 * 职责：
 * - 通过 Suspense 包裹 useSearchParams（Next.js 要求）
 * - 从 URL 读取 filter 参数，初始化 useLocations hook
 * - 通过 TravelContext 向下传递位置数据
 * - 首次加载时显示 LoadingScreen，数据就绪后渲染 Shell（TabBar + 内容区）
 */

'use client';

import { DotLoading } from 'antd-mobile';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Shell } from './components/shell';
import { useLocations, TravelContext } from './hooks/use-locations';

import type { ReactNode } from 'react';


/** 全屏加载占位 */
function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <DotLoading />
    </div>
  );
}

/**
 * 布局内部组件（需 useSearchParams，必须被 Suspense 包裹）
 */
function TravelLayoutInner({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter') as 'checked' | 'uncheck' | null;
  const filter: 'all' | 'checked' | 'uncheck' = filterParam || 'all';
  // 在 layout 层加载数据，避免每个子页面重复请求
  const data = useLocations(filter);

  return (
    <TravelContext.Provider value={data}>
      {data.loading && data.locations.length === 0 ? (
        <LoadingScreen />
      ) : (
        <Shell>{children}</Shell>
      )}
    </TravelContext.Provider>
  );
}

/** 旅行模块布局入口 — Suspense 包裹 useSearchParams 的消费者 */
export default function TravelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TravelLayoutInner>{children}</TravelLayoutInner>
    </Suspense>
  );
}
