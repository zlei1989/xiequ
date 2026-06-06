"use client";

import { Button, Select, Space, Spin } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocations } from "../hooks/use-locations";
import { LocationList } from "../components/location-list";
import { SearchDialog } from "../components/search-dialog";
import type { Location } from "../types";

export default function LocationListPage() {
  const router = useRouter();
  const { locations, loading, filter, setFilter, load, add, update, summary } = useLocations();
  const [searchVisible, setSearchVisible] = useState(false);

  function onLocationClick(location: Location) {
    router.push(`/travel/locations/${location.id}`);
  }

  async function onAdd(location: { name: string; address: string; longitude: number; latitude: number }) {
    await add(location);
    setSearchVisible(false);
  }

  async function onToggleChecked(location: Location) {
    await update(location.id, { checked: !location.checked });
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 120 }}
            options={[
              { value: "all", label: `全部 (${summary.count})` },
              { value: "uncheck", label: `待去 (${summary.uncheckCount})` },
              { value: "checked", label: `已去 (${summary.checkedCount})` },
            ]}
          />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setSearchVisible(true)}>
            添加位置
          </Button>
        </Space>
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 48 }}><Spin /></div>
      ) : (
        <LocationList locations={locations} onLocationClick={onLocationClick} />
      )}
      <SearchDialog open={searchVisible} onClose={() => setSearchVisible(false)} onAdd={onAdd} />
    </div>
  );
}
