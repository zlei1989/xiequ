// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ScheduleConfigPicker } from '@/app/watering/components/schedule-config-picker';
import type { ScheduleConfig } from '@/app/watering/types';

const defaultSchedule: ScheduleConfig = {
  type: 'day',
  value: 28800000, // 08:00
  interval: 1,
  process: 0,
};

const mockProcesses = [
  { name: '浇水流程' },
  { name: '施肥流程' },
];

describe('ScheduleConfigPicker', () => {
  it('渲染类型显示文本', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={defaultSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    // 类型默认为 day，显示"每天"
    expect(screen.getByText('每天')).toBeDefined();
  });

  it('渲染间隔 Stepper', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={defaultSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    // 间隔值 1 存在，Stepper 有加减按钮
    const steppers = screen.getAllByRole('button', { name: /加|减/ });
    expect(steppers.length).toBeGreaterThan(0);
  });

  it('渲染禁用开关', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={{ ...defaultSchedule, disabled: false }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const switches = screen.getAllByRole('switch');
    // 启用/禁用开关
    expect(switches.length).toBeGreaterThanOrEqual(1);
  });
});
