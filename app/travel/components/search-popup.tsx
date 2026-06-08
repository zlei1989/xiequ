"use client";

import { useState } from "react";
import { DotLoading, ErrorBlock, List, Popup, SearchBar, Toast } from "antd-mobile";
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "搜索失败";
      Toast.show({ icon: "fail", content: "搜索失败: " + message });
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
        maxHeight: "90vh",
        overflow: "auto",
      }}
    >
      <SearchBar placeholder="选择位置" onSearch={handleSearch} showCancelButton />
      {searching ? (
        <List>
          <List.Item prefix={<DotLoading />}>搜索中</List.Item>
        </List>
      ) : results.length === 0 ? (
        <ErrorBlock status="empty" title="暂无搜索结果" />
      ) : (
        <List>
          {results.map((item) => (
            <List.Item
              key={item.id}
              description={item.address}
              clickable
              onClick={() =>
                onAdd({
                  name: item.name,
                  address: item.address,
                  longitude: item.longitude,
                  latitude: item.latitude,
                })
              }
            >
              {item.name}
            </List.Item>
          ))}
        </List>
      )}
    </Popup>
  );
}
