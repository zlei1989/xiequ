/**
 * 旅行路线页面
 *
 * 以列表展示所有旅行路线，点击路线弹出地图弹层。
 * 支持下拉刷新重新加载数据。
 */

'use client';

import { PullToRefresh, List, ErrorBlock, DotLoading } from 'antd-mobile';
import { useState } from 'react';

import { RouteListItem } from '../components/route-list-item';
import { RouteMapPopup } from '../components/route-map-popup';
import { useTravelContext } from '../hooks/use-locations';
import { useRoutes } from '../hooks/use-routes';

import type { Route } from '../types';

export default function RoutesPage() {
  const { loading, load, locations } = useTravelContext();
  const { routes } = useRoutes();
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  if (loading && locations.length === 0) {
    return (
      <List>
        <List.Item prefix={<DotLoading />}>加载中</List.Item>
      </List>
    );
  }

  if (routes.length === 0) {
    return (
      <ErrorBlock
        status="empty"
        title="暂无路线"
        description="添加精彩瞬间后将自动生成路线"
      />
    );
  }

  return (
    <>
      <PullToRefresh onRefresh={load}>
        <List>
          {routes.map((route) => (
            <RouteListItem
              key={route.id}
              route={route}
              onClick={setSelectedRoute}
            />
          ))}
        </List>
      </PullToRefresh>

      <RouteMapPopup
        route={selectedRoute}
        visible={!!selectedRoute}
        onClose={() => { setSelectedRoute(null); }}
      />
    </>
  );
}
