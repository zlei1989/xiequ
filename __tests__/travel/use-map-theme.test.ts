// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useMapTheme } from '@/app/travel/hooks/use-map-theme';

describe('useMapTheme', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-prefers-color-scheme', 'light');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-prefers-color-scheme');
  });

  it('returns null when map is null', () => {
    const { result } = renderHook(() => useMapTheme(null));
    expect(result.current).toBeNull();
  });

  it('returns current theme when map is provided', () => {
    const mockMap = {
      setMapStyle: vi.fn(),
    };
    const { result } = renderHook(() => useMapTheme(mockMap as unknown as AMap.Map));
    expect(result.current).toBe('light');
  });

  it('calls map.setMapStyle with dark style when data-prefers-color-scheme is dark', () => {
    document.documentElement.setAttribute('data-prefers-color-scheme', 'dark');
    const mockMap = {
      setMapStyle: vi.fn(),
    };
    renderHook(() => useMapTheme(mockMap as unknown as AMap.Map));
    expect(mockMap.setMapStyle).toHaveBeenCalledWith('amap://styles/dark');
  });

  it('calls map.setMapStyle with light style when data-prefers-color-scheme is light', () => {
    const mockMap = {
      setMapStyle: vi.fn(),
    };
    renderHook(() => useMapTheme(mockMap as unknown as AMap.Map));
    expect(mockMap.setMapStyle).toHaveBeenCalledWith('amap://styles/light');
  });
});
