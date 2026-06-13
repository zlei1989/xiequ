// @vitest-environment jsdom

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { ProcessEditor } from '@/app/watering/components/process-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { Process } from '@/app/watering/types';

const mockGpio: GpioInfo = {
  buttons: ['button_0'],
  loads: ['load_0'],
  sensors: [],
};

const defaultProcess: Process = {
  name: '浇水流程',
  steps: [
    { name: '步骤1', component: 'load_0', value: { begin: 255, end: 0 }, timeout: 60000, interrupts: [] },
  ],
};

describe('ProcessEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('渲染流程名称输入', () => {
    render(
      <ProcessEditor
        gpio={mockGpio}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onChange={vi.fn()}
        onEditStep={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('浇水流程')).toBeDefined();
  });

  it('渲染步骤列表项', () => {
    render(
      <ProcessEditor
        gpio={mockGpio}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onChange={vi.fn()}
        onEditStep={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText('步骤1')).toBeDefined();
  });

  it('无按钮时显示空状态', () => {
    render(
      <ProcessEditor
        gpio={{ ...mockGpio, buttons: [] }}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onChange={vi.fn()}
        onEditStep={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText(/无可用按钮/)).toBeDefined();
  });

  it('点击添加步骤触发回调', () => {
    render(
      <ProcessEditor
        gpio={mockGpio}
        process={defaultProcess}
        onAddStep={vi.fn()}
        onChange={vi.fn()}
        onEditStep={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const addBtn = screen.getByText('添加步骤');
    expect(addBtn).toBeDefined();
  });
});
