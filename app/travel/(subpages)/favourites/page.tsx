/**
 * 旅行收藏页
 *
 * 以列表形式展示位置，支持搜索过滤、下拉刷新。
 * 切换"待去→已去"时自动创建一条当天日期的精彩瞬间记录。
 * 有精彩瞬间的位置锁定为"已去"状态，不可回退。
 */

'use client';

import { PullToRefresh, List, DotLoading, ErrorBlock, Toast, SearchBar } from 'antd-mobile';
import { useState, useEffect, useMemo } from 'react';

import { createMoment } from '../../actions';
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
   * 判断位置是否有精彩瞬间记录
   *
   * 有记录的位置锁定为"已去"状态，UI 上禁用切换按钮。
   * 通过检查 moments 对象是否有键来判断（而非检查数组长度），避免空对象误判。
   */
  function hasMoments(location: Location): boolean {
    const moments = location.moments;
    return !!moments && Object.keys(moments).length > 0;
  }

  /**
   * 提取错误消息
   *
   * 优先使用 Error.message，类型不确定时回退到预设文案。
   */
  function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  }

  /**
   * 切换位置打卡状态
   *
   * 从"待去"切到"已去"时自动创建一条当天日期的空文本精彩瞬间记录，
   * 确保每个已去位置至少有一笔记录。有精彩瞬间的位置锁定为已去状态，不可回退。
   * 创建记录失败时中断切换，保持原状态。
   */
  async function handleToggle(location: Location) {
    // 有精彩瞬间时状态锁定，不可切换（防御性，UI 已禁用不会触发）
    if (hasMoments(location)) return;

    // 从待去切到已去时，自动创建一条当天日期的空文本精彩瞬间
    if (!location.checked) {
      try {
        await createMoment(location.id, {
          date: new Date().toISOString().slice(0, 10),
          text: '',
        });
      } catch (err: unknown) {
        console.error('[Travel] handleToggle 创建精彩瞬间失败', {
          locationId: location.id,
          error: err,
        });
        Toast.show({ icon: 'fail', content: getErrorMessage(err, '创建记录失败') });
        return; // 创建失败则不切换状态
      }
    }

    await update(location.id, { checked: !location.checked });
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);

    // 刷新列表数据（moments 变更后需要更新 hasMoments 判断）
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
      <SearchBar
        placeholder="搜索名称、地址、备注"
        value={searchText}
        onChange={setSearchText}
        onClear={() => { setSearchText(''); }}
      />

      {loading && sortedLocations.length === 0 ? (
        <DotLoading />
      ) : sortedLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无位置" />
      ) : searchText.trim() && filteredLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无搜索结果" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {filteredLocations.map((location) => (
              <LocationListItem
                hasMoments={hasMoments(location)}
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
