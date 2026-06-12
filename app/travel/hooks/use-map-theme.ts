/**
 * 地图亮暗主题跟随 Hook
 *
 * 读取 document.documentElement.dataset.prefersColorScheme 获取系统主题，
 * 通过 MutationObserver 监听变化，调用 map.setMapStyle() 切换 AMap 暗色/亮色样式。
 */

import { useEffect, useState } from 'react';

/** AMap 地图样式 ID */
const STYLE_MAP = {
  light: 'amap://styles/light',
  dark: 'amap://styles/dark',
} as const;

type Theme = keyof typeof STYLE_MAP;

/** 从 DOM 读取当前系统主题 */
function readTheme(): Theme {
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
  // 在 state 初始化时同步设置地图样式，避免 effect 中额外 setState
  const [theme, setTheme] = useState<Theme | null>(() => {
    if (!map) return null;
    const initial = readTheme();
    map.setMapStyle(STYLE_MAP[initial]);
    return initial;
  });

  useEffect(() => {
    if (!map) return;

    // 监听 data-prefers-color-scheme 属性变化
    const observer = new MutationObserver(() => {
      const next = readTheme();
      // 用 functional setState 比较新旧主题，避免闭包过期问题
      setTheme((prev) => {
        if (next !== prev) {
          map.setMapStyle(STYLE_MAP[next]);
          return next;
        }
        return prev;
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-prefers-color-scheme'],
    });

    return () => {
      observer.disconnect();
    };
  }, [map]);

  return theme;
}
