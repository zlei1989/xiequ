/**
 * 旅行路线页面
 *
 * 以列表展示所有旅行路线，点击路线弹出地图弹层。
 * 支持按地点名搜索过滤、下拉刷新重新加载数据。
 */

'use client';

import { PullToRefresh, List, ErrorBlock, DotLoading, SearchBar } from 'antd-mobile';
import { useState, useMemo } from 'react';

import { RouteListItem } from '../../components/route-list-item';
import { RouteMapPopup } from '../../components/route-map-popup';
import { useTravelContext } from '../../hooks/use-locations';
import { useRoutes } from '../../hooks/use-routes';
import { filterRoutes } from '../../lib/filter-routes';

import type { Route } from '../../types';

export default function RoutesPage() {
  const { loading, load, locations } = useTravelContext();
  const { routes } = useRoutes();
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  // 搜索状态
  const [searchText, setSearchText] = useState('');

  // 对路线列表做搜索过滤
  const filteredRoutes = useMemo(
    () => filterRoutes(routes, searchText),
    [routes, searchText],
  );

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
        description="添加精彩瞬间后将自动生成路线"
        status="empty"
        title="暂无路线"
      />
    );
  }

  return (
    <>
      {/* 搜索框 — 始终固定在顶部 */}
      <div className="sticky top-0 z-10">
        <SearchBar
          placeholder="搜索路线中的地点"
          style={{ '--border-radius': '0px' }}
          value={searchText}
          onChange={setSearchText}
          onClear={() => { setSearchText(''); }}
        />
      </div>

      {searchText.trim() && filteredRoutes.length === 0 ? (
        <ErrorBlock description="" status="empty" title="暂无搜索结果" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {filteredRoutes.map((route) => (
              <RouteListItem
                key={route.id}
                route={route}
                onClick={setSelectedRoute}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      <RouteMapPopup
        route={selectedRoute}
        visible={!!selectedRoute}
        onClose={() => { setSelectedRoute(null); }}
      />
    </>
  );
}
