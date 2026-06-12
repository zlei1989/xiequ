import { describe, it, expect, vi } from 'vitest';

import { createMarkerIcon, getAdmColor } from '@/app/travel/services/marker-style';

describe('getAdmColor', () => {
  it('returns fallback color when document is not available', () => {
    // node 环境下 document 不可用（getComputedStyle 不存在），应返回 fallback
    const result = getAdmColor('--adm-color-success', '#00b578');
    expect(result).toBe('#00b578');
  });

  it('returns fallback when CSS variable is empty', () => {
    // 模拟 getComputedStyle 返回空字符串
    const originalGetComputedStyle = global.getComputedStyle;
    global.getComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue(''),
    });

    const result = getAdmColor('--adm-color-success', '#00b578');
    expect(result).toBe('#00b578');

    global.getComputedStyle = originalGetComputedStyle;
  });
});

describe('createMarkerIcon', () => {
  it('returns icon config with success color for visited status', () => {
    // node 环境使用 fallback
    const icon = createMarkerIcon('visited');
    expect(icon.image).toContain('%2300b578'); // # 已被编码为 %23
    expect(icon.image).toContain('data:image/svg+xml');
    expect(icon.size).toEqual([24, 24]);
    expect(icon.imageSize).toEqual([24, 24]);
  });

  it('returns icon config with primary color for unvisited status', () => {
    const icon = createMarkerIcon('unvisited');
    expect(icon.image).toContain('%231677ff'); // # 已被编码为 %23
  });

  it('generates valid SVG with circle elements', () => {
    const icon = createMarkerIcon('visited');
    // 解码 data URL：先还原 %23 → #，再取 SVG 内容
    const decoded = decodeURIComponent(
      icon.image.replace('data:image/svg+xml;charset=utf-8,', ''),
    );
    expect(decoded).toContain('<circle');
    expect(decoded).toContain('r="11"');
    expect(decoded).toContain('r="4"');
  });
});
