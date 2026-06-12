'use client';

/**
 * 地图亮暗主题跟随 Hook
 *
 * 读取 document.documentElement.dataset.prefersColorScheme 获取系统主题，
 * 通过 MutationObserver 监听变化，调用 map.setMapStyle() 切换 AMap 暗色/亮色样式。
 *
 * 使用 useSyncExternalStore 订阅 DOM 属性变化，
 * 避免 effect 中同步 setState 导致的级联渲染，同时确保 map 实例晚于 hook
 * 挂载（异步加载）的场景下，map 变为可用时能立即同步当前主题样式。
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** AMap 地图样式 ID */
export const STYLE_MAP = {
  light: 'amap://styles/light',
  dark: 'amap://styles/dark',
} as const;

type Theme = keyof typeof STYLE_MAP;

/**
 * 从 DOM 同步读取当前系统主题
 *
 * 可在 map 构造函数中调用，确保地图首帧即用正确样式，避免 setMapStyle 闪烁。
 */
export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const val = document.documentElement.dataset.prefersColorScheme;
  return val === 'dark' ? 'dark' : 'light';
}

/**
 * 监听系统主题变化并同步到 AMap 地图
 *
 * @param map — AMap.Map 实例（null 时不做任何操作）
 * @returns 当前主题字符串（'light' | 'dark'），map 为 null 时返回 null
 */
export function useMapTheme(map: AMap.Map | null): Theme | null {
  // 用 useSyncExternalStore 订阅 DOM 属性变化，
  // React 自动管理订阅生命周期和重渲染
  const theme = useSyncExternalStore(
    useCallback((onStoreChange: () => void) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-prefers-color-scheme'],
      });
      return () => { observer.disconnect(); };
    }, []),
    useCallback(() => readTheme(), []),
    // SSR 快照：服务端无 DOM，始终返回 light
    useCallback(() => 'light', []),
  );

  // 当 map 实例或主题变化时，同步到地图样式
  useEffect(() => {
    if (!map) return;
    map.setMapStyle(STYLE_MAP[theme]);
  }, [map, theme]);

  return map ? theme : null;
}
