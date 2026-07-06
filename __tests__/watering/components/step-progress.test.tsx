/**
 * step-progress 组件单元测试
 *
 * 测试步骤状态判定逻辑和导航按钮禁用条件。
 */

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StepProgress } from '@/app/watering/components/step-progress';
import type { StepConfig } from '@/app/watering/types';

/** 构建测试用步骤列表 */
function makeSteps(count: number): StepConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `步骤${i + 1}`,
    value: { begin: 0, end: 0 },
  }));
}

afterEach(cleanup);

describe('StepProgress', () => {
  it('不在执行中时不渲染', () => {
    const { container } = render(
      <StepProgress
        online={true}
        running={false}
        stepIndex={0}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('步骤列表为空时不渲染', () => {
    const { container } = render(
      <StepProgress
        running
        online={true}
        stepIndex={0}
        steps={[]}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('无 stepIndex 时不显示导航按钮', () => {
    render(
      <StepProgress
        running
        online={true}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    expect(screen.queryByText('← 上一步')).toBeNull();
    expect(screen.queryByText('下一步 →')).toBeNull();
  });

  it('stepIndex=0 时上一步按钮禁用', () => {
    render(
      <StepProgress
        running
        online={true}
        stepIndex={0}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    const prevBtn = screen.getByText('← 上一步');
    expect(prevBtn).toBeDefined();
    const btn = prevBtn.closest('button');
    expect(btn?.disabled).toBe(true);
  });

  it('stepIndex=0 时下一步按钮可用', () => {
    render(
      <StepProgress
        running
        online={true}
        stepIndex={0}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    const nextBtn = screen.getByText('下一步 →');
    expect(nextBtn).toBeDefined();
    const btn = nextBtn.closest('button');
    expect(btn?.disabled).toBe(false);
  });

  it('stepIndex 在最后一步时下一步按钮禁用', () => {
    render(
      <StepProgress
        running
        online={true}
        stepIndex={2}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    const nextBtn = screen.getByText('下一步 →');
    const btn = nextBtn.closest('button');
    expect(btn?.disabled).toBe(true);
  });

  it('设备离线时所有导航按钮禁用', () => {
    render(
      <StepProgress
        running
        online={false}
        stepIndex={1}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    const prevBtn = screen.getByText('← 上一步').closest('button');
    const nextBtn = screen.getByText('下一步 →').closest('button');
    expect(prevBtn?.disabled).toBe(true);
    expect(nextBtn?.disabled).toBe(true);
  });

  it('渲染所有步骤名称', () => {
    render(
      <StepProgress
        running
        online={true}
        stepIndex={0}
        steps={makeSteps(3)}
        onNext={() => {}}
        onPrev={() => {}}
      />,
    );
    expect(screen.getByText('步骤1')).toBeDefined();
    expect(screen.getByText('步骤2')).toBeDefined();
    expect(screen.getByText('步骤3')).toBeDefined();
  });
});
