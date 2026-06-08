"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTravelContext } from "./hooks/use-locations";
import { TripMap } from "./components/trip-map";
import { LocationDrawer } from "./components/location-drawer";
import { SearchDialog } from "./components/search-dialog";
import { getCurrentPosition } from "./services/amap";
import type { Location } from "./types";

export default function TravelPage() {
  const router = useRouter();
  const { sortedLocations, add, update, remove } = useTravelContext();

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const mapRef = useRef<{ setCenter: (pos: [number, number]) => void }>(null);

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
    setSelectedLocation(location);
    setDrawerVisible(true);
  }, []);

  async function onAdd(location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) {
    const newLoc = await add(location);
    setSearchVisible(false);
    setSelectedLocation(newLoc);
    setDrawerVisible(true);
  }

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <TripMap
        ref={mapRef}
        locations={sortedLocations}
        onMarkerClick={onMarkerClick}
        style={{ flex: 1 }}
      />
      <LocationDrawer
        location={selectedLocation}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onUpdate={update}
        onRemove={remove}
      />
      <SearchDialog
        open={searchVisible}
        onClose={() => setSearchVisible(false)}
        onAdd={onAdd}
      />
    </div>
  );
}
