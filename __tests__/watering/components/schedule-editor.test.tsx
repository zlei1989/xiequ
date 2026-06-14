// @vitest-environment jsdom

import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { ScheduleEditor } from '@/app/watering/components/schedule-editor';
import type { Schedule } from '@/app/watering/types';

afterEach(cleanup);

const defaultSchedule: Schedule = {
  type: 'day',
  value: 28800000, // 08:00
  interval: 1,
  process: 0,
};

const mockProcesses = [
  { name: '浇水流程' },
  { name: '施肥流程' },
];

describe('ScheduleEditor', () => {
  it('渲染类型选择器', () => {
    render(
      <ScheduleEditor
        processes={mockProcesses}
        schedules={[defaultSchedule]}
        onChange={vi.fn()}
      />,
    );
    // 有"每天"文本
    expect(screen.getByText('每天')).toBeDefined();
  });

  it('渲染间隔 Stepper', () => {
    const onChange = vi.fn();
    render(
      <ScheduleEditor
        processes={mockProcesses}
        schedules={[defaultSchedule]}
        onChange={onChange}
      />,
    );
    // 间隔值 1 存在
    const steppers = screen.getAllByRole('button', { name: /加|减/ });
    expect(steppers.length).toBeGreaterThan(0);
  });

  it('渲染禁用开关', () => {
    render(
      <ScheduleEditor
        processes={mockProcesses}
        schedules={[{ ...defaultSchedule, disabled: false }]}
        onChange={vi.fn()}
      />,
    );
    const switches = screen.getAllByRole('switch');
    // 启用/禁用开关
    expect(switches.length).toBe(1);
  });

  it('空 schedules 返回 null', () => {
    const { container } = render(
      <ScheduleEditor
        processes={mockProcesses}
        schedules={[]}
        onChange={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
