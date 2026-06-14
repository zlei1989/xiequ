// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { InterruptConfigPicker } from '@/app/watering/components/interrupt-config-picker';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { InterruptConfig } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: [],
  loads: [],
  sensors: ['sensor_0', 'sensor_1'],
};

const defaultInterrupt: InterruptConfig = {
  name: '测试中断',
  component: 'sensor_0',
  state: 0,
  signalType: 'digital',
  logic: '>',
  threshold: 100,
  intercept: 200,
  delay: 500,
  duration: 1000,
};

describe('InterruptConfigPicker', () => {
  it('渲染中断名称输入框', () => {
    const onConfirm = vi.fn();
    render(
      <InterruptConfigPicker
        gpio={mockGpio}
        interrupt={defaultInterrupt}
        open={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    // 名称输入框存在
    const input = screen.getByDisplayValue('测试中断');
    expect(input).toBeDefined();
  });

  it('数字信号模式显示触发状态开关', () => {
    render(
      <InterruptConfigPicker
        gpio={mockGpio}
        interrupt={{ ...defaultInterrupt, signalType: 'digital' }}
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const switches = screen.getAllByRole('switch');
    // 至少有一个 switch：触发状态 + 禁用
    expect(switches.length).toBeGreaterThanOrEqual(1);
  });

  it('模拟信号模式显示逻辑选择器', () => {
    render(
      <InterruptConfigPicker
        gpio={mockGpio}
        interrupt={{ ...defaultInterrupt, signalType: 'analog' }}
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    // 模拟信号模式下有"大于"选项
    expect(screen.getByText('大于')).toBeDefined();
  });

  it('无传感器时显示空状态提示', () => {
    const emptyGpio: GpioInfo = { buttons: [], loads: [], sensors: [] };
    render(
      <InterruptConfigPicker
        gpio={emptyGpio}
        interrupt={defaultInterrupt}
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    // 无传感器时显示等待上报提示
    expect(screen.getByText(/请等待设备上报/)).toBeDefined();
  });
});
