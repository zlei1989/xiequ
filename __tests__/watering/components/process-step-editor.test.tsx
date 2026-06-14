// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ProcessStepEditor } from '@/app/watering/components/process-step-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { StepConfig } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: [],
  loads: ['load_0', 'load_1'],
  sensors: ['sensor_0'],
};

const defaultStep: StepConfig = {
  name: '测试步骤',
  component: 'load_0',
  value: { begin: 255, end: 0 },
  timeout: 600000,
  interrupts: [
    { name: '中断1', component: 'sensor_0', state: 0, signalType: 'digital' as const, logic: '>' as const, threshold: 0, intercept: 0, delay: 0, duration: 0 },
  ],
};

describe('ProcessStepEditor', () => {
  it('渲染步骤名称输入', () => {
    render(
      <ProcessStepEditor
        gpio={mockGpio}
        step={defaultStep}
        onAddInterrupt={vi.fn()}
        onChange={vi.fn()}
        onEditInterrupt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('测试步骤')).toBeDefined();
  });

  it('渲染中断列表项', () => {
    render(
      <ProcessStepEditor
        gpio={mockGpio}
        step={defaultStep}
        onAddInterrupt={vi.fn()}
        onChange={vi.fn()}
        onEditInterrupt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // SwipeAction 在 jsdom 下可能重复渲染，使用 getAllByText 兼容
    const items = screen.getAllByText('中断1');
    expect(items.length).toBeGreaterThan(0);
  });

  it('无负载时显示空状态', () => {
    const stepNoLoad: StepConfig = {
      ...defaultStep,
      component: undefined,
    };
    render(
      <ProcessStepEditor
        gpio={{ ...mockGpio, loads: [] }}
        step={stepNoLoad}
        onAddInterrupt={vi.fn()}
        onChange={vi.fn()}
        onEditInterrupt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(/无可用负载/)).toBeDefined();
  });

  it('点击添加中断按钮存在', () => {
    render(
      <ProcessStepEditor
        gpio={mockGpio}
        step={defaultStep}
        onAddInterrupt={vi.fn()}
        onChange={vi.fn()}
        onEditInterrupt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // Button + List.Item 在 jsdom 下可能重复渲染，使用 getAllByText 兼容
    const btns = screen.getAllByText('添加中断');
    expect(btns.length).toBeGreaterThan(0);
  });
});
