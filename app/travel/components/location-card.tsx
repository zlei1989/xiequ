"use client";

import { Card, Tag } from "antd";
import type { Location } from "../types";

export function LocationCard({
  location,
  onClick,
}: {
  location: Location;
  onClick: (location: Location) => void;
}) {
  return (
    <Card
      hoverable
      onClick={() => onClick(location)}
      style={{ marginBottom: 12 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 500 }}>{location.name}</div>
          <div style={{ color: "#999", fontSize: 13 }}>{location.address}</div>
          {location.comments && (
            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{location.comments}</div>
          )}
        </div>
        {location.checked ? (
          <Tag color="green">已去</Tag>
        ) : (
          <Tag color="blue">待去</Tag>
        )}
      </div>
    </Card>
  );
}
