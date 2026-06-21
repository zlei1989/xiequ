/**
 * 旅行收藏页
 *
 * 以列表形式展示位置，支持搜索过滤、下拉刷新。
 * 切换待去→已去时自动检查并创建精彩瞬间，已去→待去无限制。
 */

'use client';

import { PullToRefresh, List, DotLoading, ErrorBlock, SearchBar } from 'antd-mobile';
import { useState, useEffect, useMemo } from 'react';

import { LocationEditPopup } from '../../components/location-edit-popup';
import { LocationListItem } from '../../components/location-list-item';
import { LocationViewPopup } from '../../components/location-view-popup';
import { MomentEditPopup } from '../../components/moment-edit-popup';
import { SearchPopup } from '../../components/search-popup';
import { useTravelContext } from '../../hooks/use-locations';
import { useMoments } from '../../hooks/use-moments';
import { filterLocations } from '../../lib/filter-locations';

import type { Location, Moment } from '../../types';

export default function FavouritesPage() {
  const { sortedLocations, loading, add, update, remove, load } =
    useTravelContext();

  // 搜索状态
  const [searchText, setSearchText] = useState('');

  // 对已筛选列表做二次搜索过滤
  const filteredLocations = useMemo(
    () => filterLocations(sortedLocations, searchText),
    [sortedLocations, searchText],
  );

  // Popup 状态
  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);

  // 当前查看位置的精彩瞬间
  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
    toggleChecked,
  } = useMoments(viewLocation?.id || '');

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener('travel:open-search', onOpenSearch);
    return () => { window.removeEventListener('travel:open-search', onOpenSearch); };
  }, []);

  // ── 列表操作 ──

  /**
   * 切换位置打卡状态
   *
   * 统一使用 useMoments.toggleChecked，待去→已去时自动检查并创建精彩瞬间。
   * 更新后同步刷新弹窗数据和全量位置列表。
   */
  async function handleToggle(location: Location) {
    await toggleChecked(location, update);
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
    // 刷新全量位置数据（使列表项反映最新 checked 状态）
    await load();
  }

  /** 删除位置（软删除），同时关闭该位置的查看弹窗 */
  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  // ── 搜索添加 ──

  /**
   * 从搜索结果中添加新位置
   *
   * 创建成功后关闭搜索弹窗并打开该位置的查看弹窗。
   */
  async function handleAdd(data: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) {
    const newLoc = await add(data);
    setSearchVisible(false);
    setViewLocation(newLoc);
  }

  // ── 渲染 ──

  return (
    <>
      {/* 搜索框 — 始终渲染在顶部 */}
      <div className="sticky top-0 z-10">
        <SearchBar
          placeholder="搜索名称、地址、备注"
          style={{ '--border-radius': '0px' }}
          value={searchText}
          onChange={setSearchText}
          onClear={() => { setSearchText(''); }}
        />
      </div>

      {loading && sortedLocations.length === 0 ? (
        <DotLoading />
      ) : sortedLocations.length === 0 ? (
        <ErrorBlock description="" status="empty" title="暂无位置" />
      ) : searchText.trim() && filteredLocations.length === 0 ? (
        <ErrorBlock description="" status="empty" title="暂无搜索结果" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {filteredLocations.map((location) => (
              <LocationListItem
                key={location.id}
                location={location}
                onClick={setViewLocation}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      <LocationViewPopup
        location={viewLocation}
        moments={moments}
        visible={!!viewLocation && !editMoment && !editLocation}
        onAddMoment={() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 非空
          setEditMoment({ locationId: viewLocation!.id, moment: null });
        }}
        onClose={() => { setViewLocation(null); }}
        onDelete={handleDelete}
        onDeleteMoment={async (m) => {
          await removeMoment(m.id);
        }}
        onEdit={(loc) => { setEditLocation(loc); }}
        onEditMoment={(m) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 非空
          setEditMoment({ locationId: viewLocation!.id, moment: m });
        }}
        onToggle={handleToggle}
      />

      <LocationEditPopup
        location={editLocation}
        visible={!!editLocation}
        onClose={() => { setEditLocation(null); }}
        onSave={update}
      />

      <MomentEditPopup
        moment={editMoment?.moment || null}
        visible={!!editMoment}
        onAdd={addMoment}
        onClose={() => { setEditMoment(null); }}
        onSave={updateMoment}
      />

      <SearchPopup
        visible={searchVisible}
        onAdd={(data) => { void handleAdd(data); }}
        onClose={() => { setSearchVisible(false); }}
      />
    </>
  );
}
