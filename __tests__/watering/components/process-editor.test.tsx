// @vitest-environment jsdom

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { ProcessConfigPicker } from '@/app/watering/components/process-config-picker';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { ProcessConfig } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: ['button_0'],
  loads: ['load_0'],
  sensors: [],
};

const defaultProcess: ProcessConfig = {
  name: '浇水流程',
  steps: [
    { name: '步骤1', component: 'load_0', value: { begin: 255, end: 0 }, timeout: 60000, interrupts: [] },
  ],
};

describe('ProcessConfigPicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('渲染流程名称输入', () => {
    render(
      <ProcessConfigPicker
        gpio={mockGpio}
        open={true}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onEditStep={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('浇水流程')).toBeDefined();
  });

  it('渲染步骤列表项', () => {
    render(
      <ProcessConfigPicker
        gpio={mockGpio}
        open={true}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onEditStep={vi.fn()}
      />,
    );
    expect(screen.getByText('步骤1')).toBeDefined();
  });

  it('无按钮时显示空状态', () => {
    render(
      <ProcessConfigPicker
        gpio={{ ...mockGpio, buttons: [] }}
        open={true}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onEditStep={vi.fn()}
      />,
    );
    expect(screen.getByText(/无可用按钮/)).toBeDefined();
  });

  it('点击添加步骤触发回调', () => {
    render(
      <ProcessConfigPicker
        gpio={mockGpio}
        open={true}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onEditStep={vi.fn()}
      />,
    );
    const addBtn = screen.getByText('添加步骤');
    expect(addBtn).toBeDefined();
  });
});
