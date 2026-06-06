"use client";

import { useCallback, useRef, useState } from "react";
import { Button, Space, Select } from "antd";
import { PlusOutlined, AimOutlined } from "@ant-design/icons";
import { useLocations } from "./hooks/use-locations";
import { TripMap } from "./components/trip-map";
import { LocationDrawer } from "./components/location-drawer";
import { SearchDialog } from "./components/search-dialog";
import { getCurrentPosition } from "./services/amap";
import type { Location } from "./types";

export default function TravelPage() {
  const { locations, loading, filter, setFilter, add, update, summary } = useLocations();
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const mapRef = useRef<any>(null);

  const onMarkerClick = useCallback((location: Location) => {
    setSelectedLocation(location);
    setDrawerVisible(true);
  }, []);

  async function onAdd(location: { name: string; address: string; longitude: number; latitude: number }) {
    const newLoc = await add(location);
    setSearchVisible(false);
    setSelectedLocation(newLoc);
    setDrawerVisible(true);
  }

  async function onMyLocation() {
    try {
      const [lng, lat] = await getCurrentPosition();
      if (mapRef.current) {
        mapRef.current.setCenter([lng, lat]);
      }
    } catch {
      // 定位失败，静默处理
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, background: "#fff", padding: "4px 8px", borderRadius: 6 }}>
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 120 }}
            size="small"
            options={[
              { value: "all", label: `全部 (${summary.count})` },
              { value: "uncheck", label: `待去 (${summary.uncheckCount})` },
              { value: "checked", label: `已去 (${summary.checkedCount})` },
            ]}
          />
          <Button size="small" icon={<AimOutlined />} onClick={onMyLocation}>
            我的位置
          </Button>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setSearchVisible(true)}>
            添加
          </Button>
        </Space>
      </div>
      <TripMap locations={locations} onMarkerClick={onMarkerClick} />
      <LocationDrawer
        location={selectedLocation}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onUpdate={update}
      />
      <SearchDialog open={searchVisible} onClose={() => setSearchVisible(false)} onAdd={onAdd} />
    </div>
  );
}
