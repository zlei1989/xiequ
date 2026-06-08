"use client";

import { useState } from "react";
import { List, SwipeAction, Dialog, Toast } from "antd-mobile";
import { PictureWrongOutline } from "antd-mobile-icons";
import type { Location } from "../types";

export function LocationListItem({
  location,
  onClick,
  onToggle,
  onDelete,
}: {
  location: Location;
  onClick: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
}) {
  const iconUrl = `/travel/api/download?type=icon&id=${location.id}`;
  const [iconError, setIconError] = useState(false);

  async function handleToggle() {
    try {
      await onToggle(location);
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "操作失败" });
    }
  }

  function handleDelete() {
    Dialog.confirm({
      content: `确认删除「${location.name}」及备注等信息？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDelete(location);
        } catch (err: any) {
          Toast.show({ icon: "fail", content: err.message || "删除失败" });
        }
      },
    });
  }

  const rightActions = [
    {
      key: "toggle",
      text: location.checked ? "待去" : "已去",
      color: location.checked ? "warning" : "primary",
      onClick: handleToggle,
    },
    {
      key: "delete",
      text: "删除",
      color: "danger",
      onClick: handleDelete,
    },
  ];

  return (
    <SwipeAction rightActions={rightActions}>
      <List.Item
        prefix={
          iconError ? (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#f5f5f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PictureWrongOutline style={{ fontSize: 24, color: "#bbb" }} />
            </div>
          ) : (
            <img
              src={iconUrl}
              alt={location.name}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                objectFit: "cover",
              }}
              onError={() => setIconError(true)}
            />
          )
        }
        description={
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
              maxWidth: "60vw",
            }}
          >
            {location.address}
          </span>
        }
        extra={
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 12,
              color: location.checked ? "#52c41a" : "#1677ff",
              background: location.checked ? "#f6ffed" : "#e6f7ff",
              border: `1px solid ${location.checked ? "#b7eb8f" : "#91d5ff"}`,
              whiteSpace: "nowrap",
            }}
          >
            {location.checked ? "已去" : "待去"}
          </span>
        }
        onClick={() => onClick(location)}
      >
        <span style={{ fontWeight: 500 }}>{location.name}</span>
      </List.Item>
    </SwipeAction>
  );
}
