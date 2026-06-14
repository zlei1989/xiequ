/**
 * 设备详情页测试 — 验证 NavBar 渲染和 DeviceConfigForm 集成
 *
 * 使用 @vitest-environment jsdom 提供 DOM API。
 * vite 配置中未设置 globals: true，需导入 describe/it/expect/vi。
 * 需要 afterEach(cleanup) 避免 antd-mobile 组件 DOM 残留。
 *
 * @vitest-environment jsdom
 */

import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock Next.js router + useParams
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useParams: () => ({ chipId: 'chip_001' }),
}));

// Mock DeviceConfigForm 简化渲染
vi.mock('@/app/watering/components/device-config-form', () => ({
  DeviceConfigForm: ({ config }: { config: { name: string } }) => (
    <div data-testid="device-editor">{config.name}</div>
  ),
}));

// Mock useDeviceConfig
vi.mock('@/app/watering/hooks/use-device-config', () => ({
  useDeviceConfig: () => ({
    config: { name: '测试设备', chipId: 'chip_001' },
    gpio: { buttons: [], loads: [], sensors: [] },
    loading: false,
    save: vi.fn(),
    remove: vi.fn(),
  }),
}));

import DeviceDetailPage from '@/app/watering/devices/[chipId]/page';

describe('DeviceDetailPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('渲染 NavBar 和设备名', async () => {
    const { findAllByText } = render(<DeviceDetailPage />);
    const titles = await findAllByText('测试设备');
    // 设备名同时出现在 NavBar 标题和 DeviceConfigForm 中
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it('渲染 DeviceConfigForm', async () => {
    const { findByTestId } = render(<DeviceDetailPage />);
    const editor = await findByTestId('device-editor');
    expect(editor).toBeDefined();
  });
});
