"use client";

import { useState, useEffect } from "react";
import { PullToRefresh, List, DotLoading, ErrorBlock } from "antd-mobile";
import { useTravelContext } from "../hooks/use-locations";
import { useMoments } from "../hooks/use-moments";
import { LocationListItem } from "../components/location-list-item";
import { LocationViewPopup } from "../components/location-view-popup";
import { LocationEditPopup } from "../components/location-edit-popup";
import { MomentEditPopup } from "../components/moment-edit-popup";
import { SearchPopup } from "../components/search-popup";
import type { Location, Moment } from "../types";

export default function LocationListPage() {
  const { sortedLocations, loading, add, update, remove, load } =
    useTravelContext();

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
  } = useMoments(viewLocation?.id || "");

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener("travel:open-search", onOpenSearch);
    return () => window.removeEventListener("travel:open-search", onOpenSearch);
  }, []);

  // ── 列表操作 ──

  async function handleToggle(location: Location) {
    await update(location.id, { checked: !location.checked });
    // 同步更新 viewLocation 和 editLocation 中的引用
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }

  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

  // ── 搜索添加 ──

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
    <div>
      {loading && sortedLocations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <DotLoading />
        </div>
      ) : sortedLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无位置" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {sortedLocations.map((location) => (
              <LocationListItem
                key={location.id}
                location={location}
                onClick={setViewLocation}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      {/* 查看浮层 */}
      <LocationViewPopup
        location={viewLocation}
        visible={!!viewLocation}
        onClose={() => setViewLocation(null)}
        moments={moments}
        onEdit={(loc) => setEditLocation(loc)}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAddMoment={() =>
          setEditMoment({ locationId: viewLocation!.id, moment: null })
        }
        onEditMoment={(m) =>
          setEditMoment({ locationId: viewLocation!.id, moment: m })
        }
        onDeleteMoment={removeMoment}
      />

      {/* 编辑位置浮层 */}
      <LocationEditPopup
        location={editLocation}
        visible={!!editLocation}
        onClose={() => setEditLocation(null)}
        onSave={update}
      />

      {/* 编辑瞬间浮层 */}
      <MomentEditPopup
        moment={editMoment?.moment || null}
        visible={!!editMoment}
        onClose={() => setEditMoment(null)}
        onSave={updateMoment}
        onAdd={addMoment}
      />

      {/* 搜索浮层 */}
      <SearchPopup
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onAdd={handleAdd}
      />
    </div>
  );
}
