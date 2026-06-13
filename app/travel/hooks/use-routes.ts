/**
 * 路线数据 Hook
 *
 * 从 TravelContext 获取全量位置数据，调用 buildRoutes 纯函数生成路线列表。
 * 依赖 locations 变化自动重新计算。
 */

'use client';

import { useMemo } from 'react';

import { buildRoutes } from '../lib/build-routes';

import { useTravelContext } from './use-locations';

import type { Route } from '../types';

/** 从上下文位置数据构建路线列表 */
export function useRoutes(): { routes: Route[] } {
  const { locations } = useTravelContext();

  const routes = useMemo(() => buildRoutes(locations), [locations]);

  return { routes };
}
