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
      onClick={handleClick}
      description={`${String(route.days)}天 · ${route.startDate} 至 ${route.endDate}`}
    >
      {route.startName} → {route.endName}
    </List.Item>
  );
}
