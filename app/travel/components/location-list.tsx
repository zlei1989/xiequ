"use client";

import { LocationCard } from "./location-card";
import type { Location } from "../types";

export function LocationList({
  locations,
  onLocationClick,
}: {
  locations: Location[];
  onLocationClick: (location: Location) => void;
}) {
  if (locations.length === 0) {
    return <div style={{ color: "#999", textAlign: "center", padding: 48 }}>暂无位置</div>;
  }

  return (
    <div>
      {locations.map((location) => (
        <LocationCard
          key={location.id}
          location={location}
          onClick={onLocationClick}
        />
      ))}
    </div>
  );
}
