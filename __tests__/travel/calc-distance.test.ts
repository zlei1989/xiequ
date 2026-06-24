/**
 * 地理距离计算工具单元测试
 *
 * 测试 Haversine 距离计算正确性、对称性和边界情况，
 * 以及 readMapCenter 在 localStorage 各类数据场景下的防御性读取行为。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  haversineDistance,
  readMapCenter,
  MAP_CENTER_KEY,
  DEFAULT_CENTER,
} from '@/app/travel/lib/calc-distance';

// ── localStorage / window mock ──
//
// 注意：测试环境为 node（无 window），需要同时模拟两者才能使
// readMapCenter 绕过 SSR 守卫进入 localStorage 读取分支。

function mockLocalStorage(store: Record<string, string> = {}) {
  // 模拟浏览器环境，让 SSR 守卫通过
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    writable: true,
    configurable: true,
  });

  const getItem = vi.fn((key: string) => store[key] ?? null);
  const setItem = vi.fn((key: string, value: string) => {
    store[key] = value;
  });
  const removeItem = vi.fn((key: string) => {
    delete store[key];
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem, setItem, removeItem },
    writable: true,
    configurable: true,
  });
  return { getItem, setItem, removeItem };
}

function clearLocalStorage() {
  Object.defineProperty(globalThis, 'window', {
    value: undefined,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ── haversineDistance ──

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(39.9, 116.4, 39.9, 116.4)).toBe(0);
  });

  it('returns a reasonable value for known distance (Beijing -> Shanghai ~1060 km)', () => {
    // 北京 (39.9, 116.4) -> 上海 (31.2, 121.5)
    const distance = haversineDistance(39.9, 116.4, 31.2, 121.5);
    // 允许 +/- 50 km 误差（经纬度取的近似值）
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1120);
  });

  it('is symmetric (A->B equals B->A)', () => {
    const d1 = haversineDistance(39.9, 116.4, 31.2, 121.5);
    const d2 = haversineDistance(31.2, 121.5, 39.9, 116.4);
    expect(d1).toBe(d2);
  });

  it('returns positive distance for distinct nearby points', () => {
    // 两栋相邻建筑（约 100m）
    const d = haversineDistance(39.9, 116.4, 39.901, 116.401);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(1); // 应小于 1 km
  });
});

// ── readMapCenter ──

describe('readMapCenter', () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  it('returns default center when localStorage is empty', () => {
    mockLocalStorage({});
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns stored center when valid data present', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify([120.15, 30.28]),
    });
    const result = readMapCenter();
    // [lng, lat]
    expect(result).toEqual([120.15, 30.28]);
  });

  it('returns default center when JSON is malformed', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: 'not-valid-json{{{',
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when stored data is not an array', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: '"just-a-string"',
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when array has wrong length', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify([120.15]),
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when array elements are not numbers', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify(['120.15', '30.28']),
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center when array contains NaN', () => {
    mockLocalStorage({
      [MAP_CENTER_KEY]: JSON.stringify([NaN, 30.28]),
    });
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });

  it('returns default center in SSR environment (no window)', () => {
    // clearLocalStorage 已在 beforeEach 执行，移除了 window
    // readMapCenter 应被 SSR 守卫拦截返回默认值
    const result = readMapCenter();
    expect(result).toEqual(DEFAULT_CENTER);
  });
});
