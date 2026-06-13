/**
 * 路线地图弹层
 *
 * 使用 antd-mobile Popup 包裹 TripMap（routeMode），展示路线标注和连线。
 * 标注点击时打开 LocationViewPopup 查看地点详情。
 * 右上角"列表"按钮打开右侧位置列表面板，按日期分组展示瞬间条目。
 */

'use client';

import { ErrorBlock, List, NavBar, Popup, Toast } from 'antd-mobile';
import { UnorderedListOutline,EnvironmentOutline } from 'antd-mobile-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBackButton } from '@/lib/back-button';

import { useDrivingRoute } from '../hooks/use-driving-route';
import { useTravelContext } from '../hooks/use-locations';
import { useMoments } from '../hooks/use-moments';

import { LocationEditPopup } from './location-edit-popup';
import { LocationViewPopup } from './location-view-popup';
import { MomentEditPopup } from './moment-edit-popup';
import { TripMap } from './trip-map';

import type { Route, RouteMarker, Location, Moment, RouteEntry } from '../types';

export function RouteMapPopup({
  route,
  visible,
  onClose,
}: {
  route: Route | null;
  visible: boolean;
  onClose: () => void;
}) {
  useBackButton(visible, onClose);

  const { locations, update, remove } = useTravelContext();

  // 位置详情弹层
  const [viewLocation, setViewLocation] = useState<Location | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [editMoment, setEditMoment] = useState<{
    locationId: string;
    moment: Moment | null;
  } | null>(null);

  /** TripMap 引用，用于 setCenter */
  const mapRef = useRef<{ setCenter: (pos: [number, number]) => void }>(null);

  /** Toast 引用，用于关闭加载路线提示 */
  const loadingToastRef = useRef<ReturnType<typeof Toast.show> | null>(null);

  /** 位置列表面板是否打开 */
  const [showEntryList, setShowEntryList] = useState(false);

  useBackButton(showEntryList, () => { setShowEntryList(false); });

  /** 当前高亮的标注 locationId */
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

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

  /** 已删除位置的 locationId 集合（用于过滤位置列表） */
  const deletedIds = useMemo(
    () => new Set(locations.filter((l) => l.deleted).map((l) => l.id)),
    [locations],
  );

  /** 按日期分组的瞬间条目（过滤已删除位置） */
  const groupedEntries = useMemo(() => {
    const entries = route?.entries ?? [];
    const active = entries.filter((e) => !deletedIds.has(e.locationId));
    const groups = new Map<string, RouteEntry[]>();
    for (const e of active) {
      const list = groups.get(e.date);
      if (list) list.push(e);
      else groups.set(e.date, [e]);
    }
    return groups;
  }, [route?.entries, deletedIds]);

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

  /** 路线加载中 → Toast 轻提示 */
  useEffect(() => {
    if (drivingLoading) {
      loadingToastRef.current = Toast.show({
        content: '加载路线...',
        position: 'bottom',
      });
    } else if (loadingToastRef.current) {
      loadingToastRef.current.close();
      loadingToastRef.current = null;
    }
    return () => {
      loadingToastRef.current?.close();
    };
  }, [drivingLoading]);

  /** 路线标注点击 → 关闭列表面板 → 高亮标注 → 打开详情 */
  const handleRouteMarkerClick = useCallback(
    (marker: RouteMarker) => {
      setShowEntryList(false);
      setActiveLocationId(marker.locationId);
      const loc = locations.find((l) => l.id === marker.locationId);
      if (loc) setViewLocation(loc);
    },
    [locations],
  );

  /** 位置列表条目点击 → 关闭面板 → 移动地图 → 打开详情 */
  const handleEntryClick = useCallback(
    (entry: RouteEntry) => {
      setShowEntryList(false);
      setActiveLocationId(entry.locationId);
      mapRef.current?.setCenter([entry.longitude, entry.latitude]);
      const loc = locations.find((l) => l.id === entry.locationId);
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
        bodyStyle={{ height: '75vh' }}
        closeOnMaskClick={true}
        position="bottom"
        visible={visible}
        onClose={onClose}
        onMaskClick={onClose}
      >
        <NavBar
          right={
            route.entries.length > 0 ? (
              <UnorderedListOutline  style={{ color: 'var(--adm-color-primary)' }}
                onClick={() => { setShowEntryList(true); }} />
            ) : null
          }
          onBack={onClose}
        >
          {route.startName} → {route.endName}
        </NavBar>
        <div className="h-[calc(80vh-45px)]">
          <TripMap
            routeMode
            activeMarkerId={activeLocationId ?? undefined}
            className="h-full"
            fitViewOnUpdate={visible}
            locations={[]}
            polylines={
              drivingPath.length > 0
                ? [{ path: drivingPath, color: '#1677ff' }]
                : []
            }
            ref={mapRef}
            routeMarkers={route.markers}
            onMarkerClick={() => { }}
            onRouteMarkerClick={handleRouteMarkerClick}
          />
        </div>
      </Popup>

      {/* 位置列表面板 */}
      <Popup
        bodyClassName="overflow-auto"
        bodyStyle={{ width: '75vw' }}
        closeOnMaskClick={true}
        position="right"
        visible={showEntryList}
        onClose={() => { setShowEntryList(false); }}
        onMaskClick={() => { setShowEntryList(false); }}
      >
        {groupedEntries.size === 0 ? (
          <ErrorBlock status="empty" title="暂无位置" />
        ) : (
          Array.from(groupedEntries.entries()).map(([date, entries]) => (
            <List header={date} key={date}>
              {entries.map((entry, i) => (
                <List.Item
                  arrowIcon={false}
                  key={`${entry.locationId}-${i}`}
                  prefix={<EnvironmentOutline />}
                  // eslint-disable-next-line react-hooks/refs -- onClick 是事件处理器，ref 在此场景合法
                  onClick={() => { handleEntryClick(entry); }}
                >
                  {entry.name}
                </List.Item>
              ))}
            </List>
          ))
        )}
      </Popup>

      <LocationViewPopup
        location={viewLocation}
        moments={moments}
        visible={!!viewLocation && !editMoment && !editLocation}
        onAddMoment={() => {
          if (viewLocation) setEditMoment({ locationId: viewLocation.id, moment: null });
        }}
        onClose={() => { setViewLocation(null); setActiveLocationId(null); }}
        onDelete={handleDelete}
        onDeleteMoment={async (m) => { await removeMoment(m.id); }}
        onEdit={(loc) => { setEditLocation(loc); }}
        onEditMoment={(m) => {
          if (viewLocation) setEditMoment({ locationId: viewLocation.id, moment: m });
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
    </>
  );
}
