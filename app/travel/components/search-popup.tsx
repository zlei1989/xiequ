"use client";

import { useState } from "react";
import { Popup, SearchBar, List, Button, Toast } from "antd-mobile";
import { searchPlace } from "../services/amap";
import type { AMapPoiItem } from "../services/amap";

export function SearchPopup({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) => void;
}) {
  const [results, setResults] = useState<AMapPoiItem[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(keyword: string) {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const items = await searchPlace(keyword);
      setResults(items);
    } catch (err: any) {
      Toast.show({ icon: "fail", content: "搜索失败: " + err.message });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        minHeight: "60vh",
      }}
    >
      <div style={{ padding: "8px 0" }}>
        <SearchBar
          placeholder="选择位置"
          onSearch={handleSearch}
          showCancelButton
          style={{ "--border-radius": "8px" as React.CSSProperties }}
        />
      </div>
      <List>
        {results.map((item) => (
          <List.Item
            key={item.id}
            description={item.address}
            extra={
              <Button
                size="small"
                color="primary"
                onClick={() =>
                  onAdd({
                    name: item.name,
                    address: item.address,
                    longitude: item.longitude,
                    latitude: item.latitude,
                  })
                }
              >
                添加
              </Button>
            }
          >
            {item.name}
          </List.Item>
        ))}
      </List>
    </Popup>
  );
}
