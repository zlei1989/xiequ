/**
 * 路线地图弹层
 *
 * 使用 antd-mobile Popup 包裹 TripMap（routeMode），展示路线标注和连线。
 * 标注点击时打开 LocationViewPopup 查看地点详情。
 */

'use client';

import { NavBar, Popup } from 'antd-mobile';
import { useCallback, useState } from 'react';

import { useMoments } from '../hooks/use-moments';
import { useTravelContext } from '../hooks/use-locations';
import { TripMap } from './trip-map';
import { LocationViewPopup } from './location-view-popup';
import { MomentEditPopup } from './moment-edit-popup';
import { LocationEditPopup } from './location-edit-popup';

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
          <TripMap
            locations={[]}
            onMarkerClick={() => {}}
            routeMode
            routeMarkers={route.markers}
            polylines={
              route.polyline.length > 0
                ? [{ path: route.polyline, color: '#1677ff' }]
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
