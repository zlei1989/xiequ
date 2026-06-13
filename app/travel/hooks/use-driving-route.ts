/**
 * 驾车路线数据 Hook
 *
 * 根据路线标注点（时间顺序），调用高德 AMap.Driving API 获取真实驾车路线。
 * 途经点超过 16 个时自动分段，串行请求后拼接 path。
 *
 * 注意：仅在 active=true 时触发请求（弹层打开时），避免无效调用。
 */

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

import { loadAmap } from '../services/amap';

import type { RouteMarker } from '../types';

/** 单段最多 18 个点（起点 + 16 途经点 + 终点） */
const MAX_POINTS_PER_SEGMENT = 18;

interface DrivingRouteResult {
  path: [number, number][];
  loading: boolean;
  error: string | null;
}

/** 将标注列表按 MAX_POINTS_PER_SEGMENT 分段 */
function buildSegments(markers: RouteMarker[]): RouteMarker[][] {
  if (markers.length <= MAX_POINTS_PER_SEGMENT) return [markers];

  const segments: RouteMarker[][] = [];
  let start = 0;

  while (start < markers.length - 1) {
    const end = Math.min(start + MAX_POINTS_PER_SEGMENT - 1, markers.length - 1);
    segments.push(markers.slice(start, end + 1));
    // 当前段终点作为下一段起点（重叠，保证路线连续）
    start = end;
  }

  return segments;
}

/** 单段驾车路线请求，返回路径坐标数组 */
function fetchSegmentPath(
  segment: RouteMarker[],
): Promise<[number, number][]> {
  return new Promise((resolve, reject) => {
    const AMap = window.AMap;
    // 防御性检查：loadAmap 后 window.AMap 理论上存在，但运行时可能被覆盖
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!AMap) {
      reject(new Error('AMap 未加载'));
      return;
    }

    const driving = new AMap.Driving({ policy: 0 });

    const first = segment[0];
    const last = segment[segment.length - 1];
    if (!first || !last) {
      reject(new Error('分段数据异常'));
      return;
    }
    // 途经点：去掉首尾的中间点
    const waypoints: [number, number][] = segment
      .slice(1, -1)
      .map((m) => [m.longitude, m.latitude]);

    driving.search(
      [first.longitude, first.latitude],
      [last.longitude, last.latitude],
      { waypoints: waypoints.length > 0 ? waypoints : undefined },
      (
        status: string,
        result: {
          routes?: Array<{
            steps?: Array<{
              path?: Array<{ lng: number; lat: number }>;
            }>;
          }>;
        },
      ) => {
        if (status === 'complete' && result.routes && result.routes.length > 0) {
          const firstRoute = result.routes[0];
          if (!firstRoute) { resolve([]); return; }
          const steps = firstRoute.steps;
          if (!steps) {
            resolve([]);
            return;
          }
          // 提取所有 step 的 path 并拼接
          const path: [number, number][] = [];
          for (const step of steps) {
            if (step.path) {
              for (const p of step.path) {
                path.push([p.lng, p.lat]);
              }
            }
          }
          resolve(path);
        } else {
          reject(new Error(status === 'no_data' ? '无路线数据' : `驾车路线查询失败: ${status}`));
        }
      },
    );
  });
}

/**
 * 驾车路线 Hook
 *
 * 根据路线标注点（时间顺序），调用高德 AMap.Driving API 获取真实驾车路线。
 * 途经点超过 16 个时自动分段，串行请求后拼接 path。
 *
 * **依赖设计：**
 * - `markersKey`（基于内容哈希的字符串）替代 `markers` 数组引用，避免 `[] !== []` 导致的无限循环
 * - 仅依赖 `markersKey` + `active`，不从依赖数组读取自身输出（`path.length`）
 * - `lastKeyRef` 在 `active=false` 时重置，确保下次打开弹层时重新请求
 *
 * @param markers - 路线标注点（时间顺序）
 * @param active - 是否激活请求（弹层打开时为 true）
 */
export function useDrivingRoute(
  markers: RouteMarker[],
  active: boolean,
): DrivingRouteResult {
  const [path, setPath] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 记录上次已完成请求的 markersKey，用于跳过重复请求 */
  const lastKeyRef = useRef<string>('');

  /**
   * 基于 markers 内容生成稳定 key。
   * 用 useMemo 确保新空数组 `[]` 也产出稳定的 `""` 字符串，
   * 避免 `Object.is([], []) === false` 导致 effect 无限重执行。
   */
  const markersKey = useMemo(
    () => markers.map((m) => m.locationId).join(','),
    [markers],
  );

  useEffect(() => {
    // 弹层关闭时重置所有状态，包括 key，确保下次打开时重新请求
    if (!active) {
      /* eslint-disable react-hooks/set-state-in-effect -- 弹层关闭时重置状态，属外部系统同步 */
      setPath([]);
      setLoading(false);
      setError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      lastKeyRef.current = '';
      return;
    }

    // 标记不足 2 个时无需请求
    if (markers.length < 2) {
      setPath([]);
      setLoading(false);
      setError(null);
      return;
    }

    // 标记未变化时跳过（避免重复请求同一组 markers）
    if (markersKey === lastKeyRef.current) return;

    lastKeyRef.current = markersKey;
    let aborted = false;

    async function fetchRoute() {
      setLoading(true);
      setError(null);
      try {
        await loadAmap();

        if (aborted) return;

        const segments = buildSegments(markers);
        const allPaths: [number, number][] = [];

        // 串行请求各段
        for (const seg of segments) {
          // aborted 可能在 async 迭代中被 cleanup 设为 true
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (aborted) return;
          const segPath = await fetchSegmentPath(seg);
          allPaths.push(...segPath);
        }

        // aborted 可能被 cleanup 修改
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!aborted) {
          setPath(allPaths);
        }
      } catch (err: unknown) {
        if (!aborted) {
          const message = err instanceof Error ? err.message : '路线加载失败';
          console.error('[Travel] 驾车路线获取失败:', message);
          setError(message);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    void fetchRoute();

    return () => {
      aborted = true;
    };
    // markersKey 基于内容哈希，稳定可靠；markers.length 变化时 key 必然变化
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上方"依赖设计"注释
  }, [markersKey, active]);

  return { path, loading, error };
}
