"use client";

import { Modal, Input, Flex, message } from "antd";
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
    <Modal title="查询位置" open={open} onCancel={onClose} footer={null} width="90%">
      <Input.Search
        placeholder="选择位置"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onSearch={onSearch}
        loading={searching}
        style={{ marginBottom: 16 }}
      />
      <Flex vertical>
        {results.map((item) => (
          <Flex
            key={item.id}
            justify="space-between"
            align="center"
            style={{
              padding: "12px 0",
              borderBottom: "1px solid rgb(235, 238, 245)",
            }}
          >
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</div>
              <div
                style={{
                  color: "#666",
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.address}
              </div>
            </div>
            <a
              onClick={() =>
                onAdd({
                  name: item.name,
                  address: item.address,
                  longitude: item.longitude,
                  latitude: item.latitude,
                })
              }
              style={{ marginLeft: 12, whiteSpace: "nowrap" }}
            >
              添加
            </a>
          </Flex>
        ))}
      </Flex>
    </Modal>
  );
}
