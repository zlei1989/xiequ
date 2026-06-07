"use client";

import { useState, useEffect } from "react";
import { Spin } from "antd";
import { useTravelContext } from "../hooks/use-locations";
import { LocationListItem } from "../components/location-list-item";
import { LocationDrawer } from "../components/location-drawer";
import { SearchDialog } from "../components/search-dialog";
import type { Location } from "../types";

export default function LocationListPage() {
  const { sortedLocations, loading, add, update, remove } = useTravelContext();

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  // 监听 layout 触发的 open-search 事件
  useEffect(() => {
    function onOpenSearch() {
      setSearchVisible(true);
    }
    window.addEventListener("travel:open-search", onOpenSearch);
    return () => window.removeEventListener("travel:open-search", onOpenSearch);
  }, []);

  function onLocationClick(location: Location) {
    setSelectedLocation(location);
    setDrawerVisible(true);
  }

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
    <div>
      {loading && sortedLocations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : sortedLocations.length === 0 ? (
        <div style={{ color: "#999", textAlign: "center", padding: 48 }}>暂无位置</div>
      ) : (
        sortedLocations.map((location) => (
          <LocationListItem
            key={location.id}
            location={location}
            onClick={onLocationClick}
          />
        ))
      )}

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
