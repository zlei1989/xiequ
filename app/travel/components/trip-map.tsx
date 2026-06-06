"use client";

import { useEffect, useRef, useCallback } from "react";
import { loadAmap } from "../services/amap";
import type { Location } from "../types";

export function TripMap({
  locations,
  onMarkerClick,
}: {
  locations: Location[];
  onMarkerClick: (location: Location) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const createMap = useCallback(async () => {
    if (!containerRef.current) return;
    const AMap = await loadAmap();

    // 从 localStorage 恢复地图状态
    const centerStr = localStorage.getItem("TRAVEL_MAP_CENTER");
    const zoomStr = localStorage.getItem("TRAVEL_MAP_ZOOM");
    const center = centerStr ? JSON.parse(centerStr) : [116.397477, 39.908692];
    const zoom = zoomStr ? JSON.parse(zoomStr) : 13;

    const map = new AMap.Map(containerRef.current, {
      zoom,
      center,
      resizeEnable: true,
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      localStorage.setItem("TRAVEL_MAP_CENTER", JSON.stringify([c.lng, c.lat]));
    });
    map.on("zoomend", () => {
      localStorage.setItem("TRAVEL_MAP_ZOOM", JSON.stringify(map.getZoom()));
    });

    mapRef.current = map;
  }, []);

  // 初始化地图
  useEffect(() => {
    createMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [createMap]);

  // 更新标注点
  useEffect(() => {
    if (!mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    // 清除旧标注
    markersRef.current.forEach((m) => mapRef.current.remove(m));
    markersRef.current = [];

    // 添加新标注
    for (const loc of locations) {
      const marker = new AMap.Marker({
        position: [loc.longitude, loc.latitude],
        title: loc.name,
        label: {
          content: loc.name,
          offset: new AMap.Pixel(0, -30),
        },
      });
      marker.on("click", () => onMarkerClick(loc));
      mapRef.current.add(marker);
      markersRef.current.push(marker);
    }
  }, [locations, onMarkerClick]);

  return <div ref={containerRef} style={{ width: "100%", height: "calc(100vh - 64px)" }} />;
}
