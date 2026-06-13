/**
 * offline/page 组件测试
 *
 * 验证离线兜底页渲染"当前无网络连接"提示。
 */

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import OfflinePage from '@/app/offline/page';

describe('OfflinePage', () => {
  it('渲染离线提示信息', () => {
    render(<OfflinePage />);

    // 应包含离线提示文本
    expect(screen.getByText('当前无网络连接')).toBeDefined();
  });

  it('包含重新加载链接', () => {
    render(<OfflinePage />);

    const links = screen.getAllByRole('link', { name: /重新加载/ });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
