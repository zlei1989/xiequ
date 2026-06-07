"use client";

import { Tag } from "antd";
import type { Location } from "../types";

export function LocationListItem({
  location,
  onClick,
}: {
  location: Location;
  onClick: (location: Location) => void;
}) {
  const iconUrl = `/travel/api/download?type=icon&id=${location.id}`;

  return (
    <div
      onClick={() => onClick(location)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        padding: "16px 20px",
        borderBottom: "1px solid rgb(235, 238, 245)",
        whiteSpace: "nowrap",
      }}
    >
      <img
        src={iconUrl}
        alt={location.name}
        style={{
          width: 48,
          height: 48,
          minWidth: 48,
          minHeight: 48,
          overflow: "hidden",
          objectFit: "cover",
          borderRadius: "50%",
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjBmMGYwIi8+PC9zdmc+";
        }}
      />
      <div
        style={{
          flex: 1,
          margin: "0 20px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 500 }}>{location.name}</div>
        <div
          style={{
            color: "#999",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "18em",
          }}
        >
          {location.address}
        </div>
      </div>
      {location.checked ? (
        <Tag color="green">已去</Tag>
      ) : (
        <Tag color="blue">待去</Tag>
      )}
    </div>
  );
}
