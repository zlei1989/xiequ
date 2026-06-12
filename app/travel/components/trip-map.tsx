/**
 * 高德地图组件
 *
 * 使用 forwardRef + useImperativeHandle 暴露 setCenter 方法供父组件调用。
 * 异步加载 AMap SDK，通过 aborted 标记防止卸载后内存泄漏。
 * 中心点/缩放级别持久化到 localStorage，locations 变化时增量更新 Marker。
 */

'use client';

import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';

import { loadAmap } from '../services/amap';

import type { Location } from '../types';
import type { CSSProperties } from 'react';

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

        /**
     * 异步初始化高德地图实例 —— 加载 SDK、从 localStorage 恢复视口、
     * 绑定持久化事件，并在组件卸载时通过 aborted 标记安全销毁。
     */
        async function createMap() {
          if (!containerRef.current) return;

          const startTime = Date.now();
          let AMap: any;
          try {
            AMap = await loadAmap();
          } catch (err: unknown) {
            console.error('[Travel] 高德地图 SDK 加载失败:', err);
            if (err instanceof Error && err.stack) console.error(err.stack);
            return;
          }
          const loadElapsed = Date.now() - startTime;
          if (loadElapsed > 500) {
            console.info(`[Travel] 高德地图 SDK 加载耗时 ${loadElapsed}ms`);
          }

          // 组件可能在异步加载期间被卸载，需重新检查
          if (aborted || !containerRef.current || mapRef.current) return;

          const centerStr = localStorage.getItem('TRAVEL_MAP_CENTER');
          const zoomStr = localStorage.getItem('TRAVEL_MAP_ZOOM');
          const center = centerStr ? JSON.parse(centerStr) : [116.397477, 39.908692];
          const zoom = zoomStr ? JSON.parse(zoomStr) : 13;

          const map = new AMap.Map(containerRef.current, {
            zoom,
            center,
            resizeEnable: true,
          });

          map.on('moveend', () => {
            const c = map.getCenter();
            localStorage.setItem('TRAVEL_MAP_CENTER', JSON.stringify([c.lng, c.lat]));
          });
          map.on('zoomend', () => {
            localStorage.setItem('TRAVEL_MAP_ZOOM', JSON.stringify(map.getZoom()));
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
          marker.on('click', () => { onMarkerClick(loc); });
          mapRef.current.add(marker);
          markersRef.current.push(marker);
        }
      }, [locations, onMarkerClick]);

      return (
        <div
          ref={containerRef}
          style={{ width: '100%', height: 'calc(100vh - 64px)', ...style }}
        />
      );
    });
