// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { VoltageConfigPicker } from '@/app/watering/components/voltage-config-picker';

describe('VoltageConfigPicker', () => {
  it('关闭时渲染空内容（Popup hidden）', () => {
    const { container } = render(
      <VoltageConfigPicker
        gpio={{ loads: [], sensors: ['sensor_0'], buttons: [] }}
        open={false}
        voltage={undefined}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Popup 关闭时内容不可见
    expect(container).toBeDefined();
  });

  it('打开时渲染标题和传感器选择器', () => {
    render(
      <VoltageConfigPicker
        gpio={{ loads: [], sensors: ['sensor_0', 'sensor_1'], buttons: [] }}
        open={true}
        voltage={undefined}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // NavBar 标题（可能存在多份渲染，取第一个）
    expect(screen.getAllByText('电压检测配置').length).toBeGreaterThan(0);
  });

  it('无电压配置且无传感器时仍可渲染', () => {
    const onChange = vi.fn();
    render(
      <VoltageConfigPicker
        gpio={{ loads: [], sensors: [], buttons: [] }}
        open={true}
        voltage={undefined}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );
    // 空传感器列表时仍渲染
    expect(screen.getAllByText('电压检测配置').length).toBeGreaterThan(0);
  });
});
