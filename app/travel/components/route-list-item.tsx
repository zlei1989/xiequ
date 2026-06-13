/**
 * 路线列表项
 *
 * 展示路线标题（起点 → 终点）和描述（天数 + 日期范围）。
 * 点击触发 onRouteClick 回调。
 */

'use client';

import { List } from 'antd-mobile';

import type { Route } from '../types';

export function RouteListItem({
  route,
  onClick,
}: {
  route: Route;
  onClick: (route: Route) => void;
}) {
  function handleClick() {
    onClick(route);
  }

  return (
    <List.Item
      clickable
      description={`${String(route.days)}天 · ${String(route.locationCount)}个位置 · ${route.startDate} 至 ${route.endDate}`}
      onClick={handleClick}
    >
      {route.startName} → {route.endName}
    </List.Item>
  );
}
