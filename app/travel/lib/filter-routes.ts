/**
 * 路线搜索过滤
 *
 * 按关键字在 markers 中每个 marker 的 name 字段模糊匹配（不区分大小写）。
 * 只要路径中任意一个 marker 的名称包含关键字，该路线即匹配。
 * 空关键字返回全量。
 */

import type { Route } from '../types';

/** 按关键字过滤路线列表（匹配 markers 中的地点名） */
export function filterRoutes(
  routes: Route[],
  keyword: string,
): Route[] {
  if (!keyword.trim()) return routes;

  const kw = keyword.toLowerCase();
  return routes.filter((route) => {
    return route.markers.some((m) =>
      m.name.toLowerCase().includes(kw),
    );
  });
}
