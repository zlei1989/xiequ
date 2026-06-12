/**
 * 旅行计划地图页
 *
 * 以高德地图为主视图，展示所有位置标记。
 * 点击标记弹出详情（LocationViewPopup），支持编辑、切换状态、删除。
 * 通过自定义事件 "travel:open-search" 触发搜索弹窗。
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, useEffect } from 'react';

import { LocationEditPopup } from './components/location-edit-popup';
import { LocationViewPopup } from './components/location-view-popup';
import { MomentEditPopup } from './components/moment-edit-popup';
import { SearchPopup } from './components/search-popup';
import { TripMap } from './components/trip-map';
import { useTravelContext } from './hooks/use-locations';
import { useMoments } from './hooks/use-moments';
import { getCurrentPosition } from './services/amap';

import type { Location, Moment } from './types';

export default function TravelPage() {
  const router = useRouter();
  const { sortedLocations, add, update, remove } = useTravelContext();

  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const mapRef = useRef<{ setCenter: (pos: [number, number]) => void }>(null);

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

  // 监听 "我的位置" 跳转
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('center') === 'my-location') {
      getCurrentPosition()
        .then(([lng, lat]) => {
          if (mapRef.current) {
            mapRef.current.setCenter([lng, lat]);
          }
        })
        .catch((err: unknown) => {
          // WARN：GPS 定位不可用（用户拒绝授权或设备不支持），地图仍可正常使用
          console.warn('[Travel] 获取当前位置失败', err);
        });
      // 清除 query 参数
      router.replace('/travel');
    }
  }, [router]);

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
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TripMap
        ref={mapRef}
        locations={sortedLocations}
        onMarkerClick={onMarkerClick}
        style={{ flex: 1 }}
      />

      <LocationViewPopup
        location={viewLocation}
        visible={!!viewLocation}
        onClose={() => { setViewLocation(null); }}
        moments={moments}
        onEdit={(loc) => { setEditLocation(loc); }}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddMoment={() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 由 visible 条件保证非空
          setEditMoment({ locationId: viewLocation!.id, moment: null });
        }}
        onEditMoment={(m) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- viewLocation 由 visible 条件保证非空
          setEditMoment({ locationId: viewLocation!.id, moment: m });
        }}
        onDeleteMoment={async (m) => { await removeMoment(m.id); }}
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
        onClose={() => { setEditMoment(null); }}
        onSave={updateMoment}
        onAdd={addMoment}
      />

      <SearchPopup
        visible={searchVisible}
        onClose={() => { setSearchVisible(false); }}
        onAdd={(data) => { void handleAdd(data); }}
      />
    </div>
  );
}
