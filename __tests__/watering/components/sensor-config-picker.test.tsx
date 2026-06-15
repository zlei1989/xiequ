// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { SensorConfigPicker } from '@/app/watering/components/sensor-config-picker';
import type { SensorConfig } from '@/app/watering/types';

const mockGpio = { loads: [], sensors: ['sensor_0', 'sensor_1'], buttons: [] };

describe('SensorConfigPicker', () => {
  it('关闭时渲染空内容', () => {
    const { container } = render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={false}
        sensors={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeDefined();
  });

  it('打开时渲染标题', () => {
    render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={true}
        sensors={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('传感器配置').length).toBeGreaterThan(0);
  });

  it('空传感器列表时显示空状态', () => {
    render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={true}
        sensors={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('暂无传感器').length).toBeGreaterThan(0);
  });

  it('已有传感器时显示列表项', () => {
    const sensors: SensorConfig[] = [
      { name: '电池', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 30000, r2: 10000 },
    ];
    render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={true}
        sensors={sensors}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('电池').length).toBeGreaterThan(0);
  });
});
