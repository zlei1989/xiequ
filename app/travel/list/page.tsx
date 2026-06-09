"use client";

import { useState, useEffect } from "react";
import { PullToRefresh, List, DotLoading, ErrorBlock, Toast } from "antd-mobile";
import { useTravelContext } from "../hooks/use-locations";
import { useMoments } from "../hooks/use-moments";
import { LocationListItem } from "../components/location-list-item";
import { LocationViewPopup } from "../components/location-view-popup";
import { LocationEditPopup } from "../components/location-edit-popup";
import { MomentEditPopup } from "../components/moment-edit-popup";
import { SearchPopup } from "../components/search-popup";
import { createMoment } from "../actions";
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

  // 判断位置是否有精彩瞬间记录
  function hasMoments(location: Location): boolean {
    const moments = (location as any).moments as Record<string, unknown> | undefined;
    return !!moments && Object.keys(moments).length > 0;
  }

  function getErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  }

  async function handleToggle(location: Location) {
    // 有精彩瞬间时状态锁定，不可切换（防御性，UI 已禁用不会触发）
    if (hasMoments(location)) return;

    // 从待去切到已去时，自动创建一条当天日期的空文本精彩瞬间
    if (!location.checked) {
      try {
        await createMoment(location.id, {
          date: new Date().toISOString().slice(0, 10),
          text: "",
        });
      } catch (err: unknown) {
        Toast.show({ icon: "fail", content: getErrorMessage(err, "创建记录失败") });
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
    <>
      {loading && sortedLocations.length === 0 ? (
        <List>
          <List.Item prefix={<DotLoading />}>加载中</List.Item>
        </List>
      ) : sortedLocations.length === 0 ? (
        <ErrorBlock status="empty" title="暂无位置" />
      ) : (
        <PullToRefresh onRefresh={load}>
          <List>
            {sortedLocations.map((location) => (
              <LocationListItem
                key={location.id}
                location={location}
                hasMoments={hasMoments(location)}
                onClick={setViewLocation}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </List>
        </PullToRefresh>
      )}

      <LocationViewPopup
        location={viewLocation}
        visible={!!viewLocation && !editMoment && !editLocation}
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
        onDeleteMoment={async (m) => {
          await removeMoment(m.id);
        }}
      />

      <LocationEditPopup
        location={editLocation}
        visible={!!editLocation}
        onClose={() => setEditLocation(null)}
        onSave={update}
      />

      <MomentEditPopup
        moment={editMoment?.moment || null}
        visible={!!editMoment}
        onClose={() => setEditMoment(null)}
        onSave={updateMoment}
        onAdd={addMoment}
      />

      <SearchPopup
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onAdd={handleAdd}
      />
    </>
  );
}
