/**
 * 高德地图组件
 *
 * 使用 forwardRef + useImperativeHandle 暴露 setCenter 方法供父组件调用。
 * 异步加载 AMap SDK，通过 aborted 标记防止卸载后内存泄漏。
 * 通过 mapReady 状态串行化地图初始化与标注重建时序，防止竞态导致标注消失。
 * 集成 MarkerEngine（增量 diff + 聚类）和 useMapTheme（系统主题跟随）。
 */

'use client';

import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';

import { useMapTheme } from '../hooks/use-map-theme';
import { loadAmap } from '../services/amap';
import { createMarkerEngine } from '../services/marker-engine';

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
      const engineRef = useRef<ReturnType<typeof createMarkerEngine> | null>(null);

      /** 地图实例是否就绪 */
      const [mapReady, setMapReady] = useState(false);
      /** SDK 加载错误 */
      const [loadError, setLoadError] = useState<string | null>(null);
      /** 重试计数 —— 作为 useEffect 依赖，递增时触发重新初始化 */
      const [retryKey, setRetryKey] = useState(0);

      // 主题跟随（mapReady 后再传实例）
      useMapTheme(mapReady ? mapRef.current : null);

      useImperativeHandle(ref, () => ({
        setCenter(pos: [number, number]) {
          if (mapRef.current) {
            mapRef.current.setCenter(pos);
            mapRef.current.setZoom(15);
          }
        },
      }));

      /** 地图初始化 effect */
      useEffect(() => {
        let aborted = false;

        async function createMap() {
          if (!containerRef.current) return;

          const startTime = Date.now();
          let AMap: AMapModule;
          try {
            AMap = await loadAmap();
          } catch (err: unknown) {
            console.error('[Travel] 高德地图 SDK 加载失败:', err);
            if (err instanceof Error && err.stack) console.error(err.stack);
            if (!aborted) setLoadError('地图加载失败，请检查网络后重试');
            return;
          }
          const loadElapsed = Date.now() - startTime;
          if (loadElapsed > 500) {
            console.info(`[Travel] 高德地图 SDK 加载耗时 ${String(loadElapsed)}ms`);
          }

          if (aborted) return;

          const container = containerRef.current;

          const centerStr = localStorage.getItem('TRAVEL_MAP_CENTER');
          const zoomStr = localStorage.getItem('TRAVEL_MAP_ZOOM');
          const center: [number, number] = centerStr
            ? (JSON.parse(centerStr) as [number, number])
            : [116.397477, 39.908692];
          const zoom: number = zoomStr ? (JSON.parse(zoomStr) as number) : 13;

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

          // aborted 由 cleanup 跨异步设置，TypeScript 无法追踪此突变
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!aborted) {
            mapRef.current = map;
            setMapReady(true);
          } else {
            map.destroy();
          }
        }

        void createMap();

        return () => {
          aborted = true;
          // 清理标注引擎
          if (engineRef.current) {
            engineRef.current.destroy();
            engineRef.current = null;
          }
          if (mapRef.current) {
            mapRef.current.destroy();
            mapRef.current = null;
          }
          setMapReady(false);
        };
      }, [retryKey]);

      /** 标注重建 effect —— 依赖 mapReady + locations */
      useEffect(() => {
        if (!mapReady || !mapRef.current) return;

        // 首次运行时创建引擎
        if (!engineRef.current) {
          engineRef.current = createMarkerEngine(mapRef.current, onMarkerClick);
        }

        engineRef.current.update(locations);
      }, [locations, mapReady, onMarkerClick]);

      /** 重试加载 —— 递增 retryKey 触发 effect 重新执行 */
      function handleRetry() {
        setRetryKey((k) => k + 1);
        setLoadError(null);
      }

      // 加载失败降级 UI（重试 3 次后放弃）
      if (loadError && retryKey >= 3) {
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#999',
              fontSize: 14,
              gap: 12,
            }}
          >
            <span>地图加载失败</span>
            <span style={{ fontSize: 12 }}>请检查网络连接后刷新页面</span>
          </div>
        );
      }

      if (loadError) {
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#999',
              fontSize: 14,
              gap: 12,
            }}
          >
            <span>{loadError}</span>
            <button
              onClick={handleRetry}
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                border: '1px solid #1677ff',
                background: 'white',
                color: '#1677ff',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        );
      }

      return (
        <div
          ref={containerRef}
          className={className}
          style={{ width: '100%', height: 'calc(100vh - 64px)', ...style }}
        />
      );
    });
