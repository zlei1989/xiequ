"use client";

import { forwardRef, useImperativeHandle, useEffect, useRef, CSSProperties } from "react";
import { loadAmap } from "../services/amap";
import type { Location } from "../types";

export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void },
  {
    locations: Location[];
    onMarkerClick: (location: Location) => void;
    style?: CSSProperties;
  }
>(function TripMap({ locations, onMarkerClick, style }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useImperativeHandle(ref, () => ({
    setCenter(pos: [number, number]) {
      if (mapRef.current) {
        mapRef.current.setCenter(pos);
        mapRef.current.setZoom(15);
      }
    },
  }));

  useEffect(() => {
    let aborted = false;

    async function createMap() {
      if (!containerRef.current) return;
      const AMap = await loadAmap();

      // 组件可能在异步加载期间被卸载，需重新检查
      if (aborted || !containerRef.current || mapRef.current) return;

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

      // 二次确认：设置 mapRef 前检查组件是否仍在挂载状态
      if (!aborted) {
        mapRef.current = map;
      } else {
        map.destroy();
      }
    }

    createMap();

    return () => {
      aborted = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const AMap = (window as any).AMap;
    if (!AMap) return;

    markersRef.current.forEach((m) => mapRef.current.remove(m));
    markersRef.current = [];

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

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "calc(100vh - 64px)", ...style }}
    />
  );
});
