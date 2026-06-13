/**
 * 高德地图组件
 *
 * 使用 forwardRef + useImperativeHandle 暴露 setCenter 方法供父组件调用。
 * 异步加载 AMap SDK，通过 aborted 标记防止卸载后内存泄漏。
 * 通过 mapReady 状态串行化地图初始化与标注重建时序，防止竞态导致标注消失。
 * 集成 MarkerEngine（增量 diff + 聚类）和 useMapTheme（系统主题跟随）。
 */

'use client';

import { Button, ErrorBlock } from 'antd-mobile';
import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';

import { readTheme, STYLE_MAP, useMapTheme } from '../hooks/use-map-theme';
import { loadAmap } from '../services/amap';
import { createMarkerEngine } from '../services/marker-engine';
import { createNumberedMarkerIcon } from '../services/marker-style';

import type { Location, RouteMarker } from '../types';
import type { CSSProperties } from 'react';

export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void },
  {
    locations: Location[];
    onMarkerClick: (location: Location) => void;
    className?: string;
    style?: CSSProperties;
    /** 路线模式：禁用聚类，使用路线标注 + 连线 */
    routeMode?: boolean;
    /** 路线连线数据 */
    polylines?: { path: [number, number][]; color?: string }[];
    /** 路线标注数据（routeMode 时使用，替代 locations） */
    routeMarkers?: RouteMarker[];
    /** 路线标注点击回调（routeMode 时使用） */
    onRouteMarkerClick?: (marker: RouteMarker) => void;
    /** 路线标注更新后自动适配视野以包含所有标注（仅 routeMode 时生效） */
    fitViewOnUpdate?: boolean;
    /** 当前激活的标注 locationId（routeMode 时高亮） */
    activeMarkerId?: string;
  }
>(function TripMap(
      {
        locations,
        onMarkerClick,
        className,
        style,
        routeMode = false,
        polylines,
        routeMarkers,
        onRouteMarkerClick,
        fitViewOnUpdate = false,
        activeMarkerId,
      },
      ref,
    ) {
      const containerRef = useRef<HTMLDivElement>(null);
      const mapRef = useRef<AMap.Map | null>(null);
      const engineRef = useRef<ReturnType<typeof createMarkerEngine> | null>(null);
      /** 路线模式下的标注和连线引用（用于清理） */
      const routeMarkersRef = useRef<AMap.Marker[]>([]);
      const polylinesRef = useRef<AMap.Polyline[]>([]);

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
            // 构造时即传入当前主题样式，避免地图先用默认亮色再 setMapStyle 切暗色导致的闪烁
            mapStyle: STYLE_MAP[readTheme()],
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
          // 清理路线标注和连线（必须在 map 销毁前）
          if (polylinesRef.current.length > 0 && mapRef.current) {
            for (const p of polylinesRef.current) {
              mapRef.current.remove(p);
            }
            polylinesRef.current = [];
          }
          if (routeMarkersRef.current.length > 0 && mapRef.current) {
            for (const m of routeMarkersRef.current) {
              mapRef.current.remove(m);
            }
            routeMarkersRef.current = [];
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
        if (routeMode || !mapReady || !mapRef.current) return;

        // 首次运行时创建引擎
        if (!engineRef.current) {
          engineRef.current = createMarkerEngine(mapRef.current, onMarkerClick);
        }

        engineRef.current.update(locations);
      }, [locations, mapReady, onMarkerClick, routeMode]);

      /** 路线标注和连线渲染 effect（仅在 routeMode 时生效） */
      useEffect(() => {
        if (!routeMode || !mapReady || !mapRef.current) return;

        const map = mapRef.current;

        // 清理旧标注和连线
        for (const m of routeMarkersRef.current) {
          map.remove(m);
        }
        routeMarkersRef.current = [];
        for (const p of polylinesRef.current) {
          map.remove(p);
        }
        polylinesRef.current = [];

        // 创建路线标注（带编号的双圈 SVG 图标，与地图页标注样式统一）
        if (routeMarkers && routeMarkers.length > 0) {
          let index = 0;
          for (const rm of routeMarkers) {
            const i = index++;
            const isActive = rm.locationId === activeMarkerId;
            const marker = new window.AMap.Marker({
              position: [rm.longitude, rm.latitude],
              title: rm.name,
              icon: new window.AMap.Icon(createNumberedMarkerIcon(i + 1, isActive)),
              offset: new window.AMap.Pixel(-14, -14),
            });
            marker.on('click', () => {
              onRouteMarkerClick?.(rm);
            });
            map.add(marker);
            routeMarkersRef.current.push(marker);
          }
        }

        // 创建连线
        if (polylines && polylines.length > 0) {
          for (const pl of polylines) {
            const polyline = new window.AMap.Polyline({
              path: pl.path,
              strokeColor: pl.color || '#1677ff',
              strokeWeight: 3,
              strokeOpacity: 0.7,
              showDir: true,
            });
            map.add(polyline);
            polylinesRef.current.push(polyline);
          }
        }

        // 自动适配视野以包含所有标注
        if (fitViewOnUpdate && routeMarkersRef.current.length > 0) {
          map.setFitView(routeMarkersRef.current, false, [48, 48, 48, 48]);
        }
      }, [
        routeMode,
        routeMarkers,
        polylines,
        mapReady,
        onRouteMarkerClick,
        fitViewOnUpdate,
        activeMarkerId,
      ]);

      /** 重试加载 —— 递增 retryKey 触发 effect 重新执行 */
      function handleRetry() {
        setRetryKey((k) => k + 1);
        setLoadError(null);
      }

      // 加载失败降级 UI（重试 3 次后放弃）
      if (loadError && retryKey >= 3) {
        return (
          <div className="flex h-full items-center justify-center">
            <ErrorBlock
              description="请检查网络连接后刷新页面"
              status="default"
              title="地图加载失败"
            />
          </div>
        );
      }

      if (loadError) {
        return (
          <div className="flex h-full items-center justify-center">
            <ErrorBlock status="default" title={loadError}>
              <Button color="primary" fill="outline" onClick={handleRetry}>
                重试
              </Button>
            </ErrorBlock>
          </div>
        );
      }

      return (
        <div
          ref={containerRef}
          // w-full + h-[calc(100vh-64px)] 替代内联 width/height，
          // bg-[var(--background)] 跟随系统主题，避免 AMap 接管前透出白色
          className={`h-[calc(100vh-64px)] w-full bg-[var(--background)] ${className || ''}`}
          style={style}
        />
      );
    });
