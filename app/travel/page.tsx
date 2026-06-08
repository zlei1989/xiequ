"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTravelContext } from "./hooks/use-locations";
import { useMoments } from "./hooks/use-moments";
import { TripMap } from "./components/trip-map";
import { LocationViewPopup } from "./components/location-view-popup";
import { LocationEditPopup } from "./components/location-edit-popup";
import { MomentEditPopup } from "./components/moment-edit-popup";
import { SearchPopup } from "./components/search-popup";
import { getCurrentPosition } from "./services/amap";
import type { Location, Moment } from "./types";

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
  } = useMoments(viewLocation?.id || "");

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener("travel:open-search", onOpenSearch);
    return () => window.removeEventListener("travel:open-search", onOpenSearch);
  }, []);

  // 监听 "我的位置" 跳转
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("center") === "my-location") {
      getCurrentPosition()
        .then(([lng, lat]) => {
          if (mapRef.current) {
            mapRef.current.setCenter([lng, lat]);
          }
        })
        .catch(() => {});
      // 清除 query 参数
      router.replace("/travel");
    }
  }, [router]);

  const onMarkerClick = useCallback((location: Location) => {
    setViewLocation(location);
  }, []);

  async function handleToggle(location: Location) {
    await update(location.id, { checked: !location.checked });
    const updated = { ...location, checked: !location.checked };
    if (viewLocation?.id === location.id) setViewLocation(updated);
    if (editLocation?.id === location.id) setEditLocation(updated);
  }

  async function handleDelete(location: Location) {
    await remove(location.id);
    if (viewLocation?.id === location.id) setViewLocation(null);
  }

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
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <TripMap
        ref={mapRef}
        locations={sortedLocations}
        onMarkerClick={onMarkerClick}
        style={{ flex: 1 }}
      />

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
        onDeleteMoment={async (m) => { await removeMoment(m.id); }}
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
    </div>
  );
}
