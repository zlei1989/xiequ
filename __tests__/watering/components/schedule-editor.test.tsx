// @vitest-environment jsdom

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { ScheduleConfigPicker } from '@/app/watering/components/schedule-config-picker';
import type { ScheduleConfig } from '@/app/watering/types';

const defaultSchedule: ScheduleConfig = {
  type: 'day',
  startTime: new Date('2026-06-17T00:00:00+08:00').getTime(),
  value: 28800000,
  interval: 0,
  process: 0,
};

const mockProcesses = [
  { name: '浇水流程' },
  { name: '施肥流程' },
];

describe('ScheduleConfigPicker', () => {
  afterEach(() => { cleanup(); });

  it('渲染循环类型选择器', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={defaultSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getAllByText('天').length).toBeGreaterThan(0);
  });

  it('day 类型渲染间隔 Stepper', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={defaultSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const steppers = screen.getAllByRole('button', { name: /加|减/ });
    expect(steppers.length).toBeGreaterThan(0);
  });

  it('渲染禁用任务开关（改名为"禁用任务"）', () => {
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={{ ...defaultSchedule, disabled: false }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getAllByText('禁用任务').length).toBeGreaterThan(0);
  });

  it('minute 类型不显示循环时间字段', () => {
    const minuteSchedule: ScheduleConfig = {
      type: 'minute',
      startTime: Date.now(),
      interval: 30,
      process: 0,
    };
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={minuteSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText('循环时间')).toBeNull();
  });

  it('week 类型显示星期字段', () => {
    const weekSchedule: ScheduleConfig = {
      type: 'week',
      startTime: Date.now(),
      week: 1,
      value: 28800000,
      process: 0,
    };
    render(
      <ScheduleConfigPicker
        open={true}
        processes={mockProcesses}
        schedule={weekSchedule}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getAllByText('星期').length).toBeGreaterThan(0);
  });
});
