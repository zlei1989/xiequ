/**
 * 路线地图弹层
 *
 * 使用 antd-mobile Popup 包裹 TripMap（routeMode），展示路线标注和连线。
 * 标注点击时打开 LocationViewPopup 查看地点详情。
 */

'use client';

import { DotLoading, NavBar, Popup, Toast } from 'antd-mobile';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDrivingRoute } from '../hooks/use-driving-route';
import { useTravelContext } from '../hooks/use-locations';
import { useMoments } from '../hooks/use-moments';

import { LocationEditPopup } from './location-edit-popup';
import { LocationViewPopup } from './location-view-popup';
import { MomentEditPopup } from './moment-edit-popup';
import { TripMap } from './trip-map';

import type { Route, RouteMarker, Location, Moment } from '../types';

export function RouteMapPopup({
  route,
  visible,
  onClose,
}: {
  route: Route | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { locations, update, remove } = useTravelContext();

  // 位置详情弹层
  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);

  const {
    moments,
    add: addMoment,
    update: updateMoment,
    remove: removeMoment,
  } = useMoments(viewLocation?.id || '');

  /**
   * 稳定 markers 引用，避免 `route?.markers ?? []` 在 route=null 时
   * 每次渲染都创建新空数组导致 useDrivingRoute 不必要的重渲染
   */
  const markers = useMemo(
    () => route?.markers ?? [],
    [route?.markers],
  );

  const {
    path: drivingPath,
    loading: drivingLoading,
    error: drivingError,
  } = useDrivingRoute(markers, visible);

  useEffect(() => {
    if (drivingError) {
      Toast.show({ icon: 'fail', content: '路线加载失败' });
    }
  }, [drivingError]);

  /** 路线标注点击 → 查找完整 Location 对象并打开详情 */
  const handleRouteMarkerClick = useCallback(
    (marker: RouteMarker) => {
      const loc = locations.find((l) => l.id === marker.locationId);
      if (loc) setViewLocation(loc);
    },
    [locations],
  );

  /** 切换打卡状态 */
  async function handleToggle(location: Location) {
    await update(location.id, { checked: !location.checked });
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }

  /** 删除位置 */
  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  if (!route) return null;

  return (
    <>
      <Popup
        visible={visible}
        onClose={onClose}
        position="bottom"
        bodyStyle={{ height: '80vh' }}
      >
        <NavBar
          onBack={onClose}
          back="关闭"
        >
          {route.startName} → {route.endName}
        </NavBar>
        <div className="h-[calc(80vh-45px)]">
          {drivingLoading && (
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/80 px-4 py-2 shadow">
              <DotLoading /> 加载路线...
            </div>
          )}
          <TripMap
            locations={[]}
            onMarkerClick={() => {}}
            routeMode
            fitViewOnUpdate={visible}
            routeMarkers={route.markers}
            polylines={
              drivingPath.length > 0
                ? [{ path: drivingPath, color: '#1677ff' }]
                : []
            }
            onRouteMarkerClick={handleRouteMarkerClick}
            className="h-full"
          />
        </div>
      </Popup>

      <LocationViewPopup
        location={viewLocation}
        visible={!!viewLocation && !editMoment && !editLocation}
        onClose={() => { setViewLocation(null); }}
        moments={moments}
        onEdit={(loc) => { setEditLocation(loc); }}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddMoment={() => {
          if (viewLocation) setEditMoment({ locationId: viewLocation.id, moment: null });
        }}
        onEditMoment={(m) => {
          if (viewLocation) setEditMoment({ locationId: viewLocation.id, moment: m });
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
    </>
  );
}
