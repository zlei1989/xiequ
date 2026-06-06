"use client";

import { Modal, Input, List, message } from "antd";
import { useState, useCallback } from "react";
import { searchPlace } from "../services/amap";
import type { AMapPoiItem } from "../services/amap";

export function SearchDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (location: { name: string; address: string; longitude: number; latitude: number }) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<AMapPoiItem[]>([]);
  const [searching, setSearching] = useState(false);

  const onSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    try {
      const items = await searchPlace(keyword);
      setResults(items);
    } catch (err: any) {
      message.error("搜索失败: " + err.message);
    } finally {
      setSearching(false);
    }
  }, [keyword]);

  return (
    <Modal title="搜索地点" open={open} onCancel={onClose} footer={null} width={600}>
      <Input.Search
        placeholder="输入地点名称"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onSearch={onSearch}
        loading={searching}
        style={{ marginBottom: 16 }}
      />
      <List
        dataSource={results}
        renderItem={(item) => (
          <List.Item
            actions={[<a key="add" onClick={() => onAdd({ name: item.name, address: item.address, longitude: item.longitude, latitude: item.latitude })}>添加</a>]}
          >
            <List.Item.Meta title={item.name} description={item.address} />
          </List.Item>
        )}
      />
    </Modal>
  );
}
