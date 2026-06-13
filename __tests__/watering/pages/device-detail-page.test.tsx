// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

// Mock Next.js router & useParams
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useParams: () => ({ chipId: 'chip_001' }),
}));

// Mock DeviceEditor 简化渲染
vi.mock('@/app/watering/components/device-editor', () => ({
  DeviceEditor: () => <div data-testid="device-editor" />,
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

afterEach(() => { cleanup(); });

describe('DeviceDetailPage', () => {
  it('渲染设备名称（NavBar 标题）', async () => {
    render(<DeviceDetailPage />);
    const title = await screen.findByText('测试设备');
    expect(title).toBeDefined();
  });

  it('渲染 DeviceEditor', async () => {
    render(<DeviceDetailPage />);
    const editor = await screen.findByTestId('device-editor');
    expect(editor).toBeDefined();
  });
});
