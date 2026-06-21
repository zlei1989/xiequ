/**
 * 旅行计划地图页
 *
 * 以高德地图为主视图，展示所有位置标记。
 * 点击标记弹出详情（LocationViewPopup），支持编辑、切换状态、删除。
 * 通过自定义事件 "travel:open-search" 触发搜索弹窗。
 */

'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

import { LocationEditPopup } from './components/location-edit-popup';
import { LocationViewPopup } from './components/location-view-popup';
import { MomentEditPopup } from './components/moment-edit-popup';
import { SearchPopup } from './components/search-popup';
import { TripMap } from './components/trip-map';
import { useTravelContext } from './hooks/use-locations';
import { useMoments } from './hooks/use-moments';

import type { Location, Moment } from './types';

export default function TravelPage() {
  const { sortedLocations, add, update, remove } = useTravelContext();

  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const mapRef = useRef<{
    setCenter: (pos: [number, number]) => void;
    goToMyLocation: () => Promise<void>;
  }>(null);

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

  // 监听 shell.tsx 菜单触发的"我的位置"定位事件
  useEffect(() => {
    function onGoMyLocation() {
      void mapRef.current?.goToMyLocation();
    }
    window.addEventListener('travel:go-my-location', onGoMyLocation);
    return () => { window.removeEventListener('travel:go-my-location', onGoMyLocation); };
  }, []);

  const onMarkerClick = useCallback((location: Location) => {
    setViewLocation(location);
  }, []);

  /**
   * 切换位置打卡状态
   *
   * 更新后同步刷新当前打开的查看/编辑弹窗中的位置数据。
   */
  async function handleToggle(location: Location) {
    await update(location.id, { checked: !location.checked });
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }

  /** 删除位置（软删除），同时关闭该位置的查看弹窗 */
  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  /**
   * 从搜索结果中添加新位置
   *
   * 创建成功后关闭搜索弹窗并直接打开该位置的查看弹窗。
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

  return (
    <div className="relative flex h-full flex-col">
      <TripMap
        className="flex-1"
        locations={sortedLocations}
        ref={mapRef}
        onMarkerClick={onMarkerClick}
      />

      <LocationViewPopup
        location={viewLocation}
        moments={moments}
        visible={!!viewLocation}
        onAddMoment={() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 非空
          setEditMoment({ locationId: viewLocation!.id, moment: null });
        }}
        onClose={() => { setViewLocation(null); }}
        onDelete={handleDelete}
        onDeleteMoment={async (m) => { await removeMoment(m.id); }}
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
    </div>
  );
}
