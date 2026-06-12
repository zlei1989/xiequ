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
    className?: string;
    style?: CSSProperties;
  }
>(function TripMap({ locations, onMarkerClick, className, style }, ref) {
      const containerRef = useRef<HTMLDivElement>(null);
      const mapRef = useRef<AMap.Map | null>(null);
      const markersRef = useRef<AMap.Marker[]>([]);

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
          let AMap: AMapModule;
          try {
            AMap = await loadAmap();
          } catch (err: unknown) {
            console.error('[Travel] 高德地图 SDK 加载失败:', err);
            if (err instanceof Error && err.stack) console.error(err.stack);
            return;
          }
          const loadElapsed = Date.now() - startTime;
          if (loadElapsed > 500) {
            console.info(`[Travel] 高德地图 SDK 加载耗时 ${String(loadElapsed)}ms`);
          }

          // 组件可能在异步加载期间被卸载（aborted 由 cleanup 设置），需重新检查
          if (aborted || mapRef.current) return;
          // aborted 覆盖了组件卸载场景，ref 在 mount 阶段已校验为非 null
          const container = containerRef.current;

          const centerStr = localStorage.getItem('TRAVEL_MAP_CENTER');
          const zoomStr = localStorage.getItem('TRAVEL_MAP_ZOOM');
          const center: [number, number] = centerStr
            ? JSON.parse(centerStr) as [number, number]
            : [116.397477, 39.908692];
          /** localStorage 中 zoom 为数字，JSON.parse 返回 number |
           *  此处断言后传给 AMap.Map */
          const zoom: number = zoomStr ? JSON.parse(zoomStr) as number : 13;

          const map = new AMap.Map(container, {
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
          // aborted 由 cleanup 跨异步设置，TypeScript 无法追踪此突变
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!aborted) {
            mapRef.current = map;
          } else {
            map.destroy();
          }
        }

        void createMap();

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
        /**
         * window.AMap 由 loadAmap() 在首个 effect 中异步注入，
         * 类型系统无法追踪此注入时机，此处为运行时防护
         */
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!window.AMap) return;
        const AMap = window.AMap;

        const map = mapRef.current;
        markersRef.current.forEach((m) => { map.remove(m); });
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
          className={className}
          style={{ width: '100%', height: 'calc(100vh - 64px)', ...style }}
        />
      );
    });
