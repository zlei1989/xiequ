/**
 * format-desc 工具函数单元测试
 *
 * 测试 formatMs / formatStepDesc / formatInterruptDesc /
 * formatScheduleDesc / formatProcessDesc。
 */

import { describe, it, expect } from 'vitest';

import type { StepConfig, InterruptConfig, ScheduleConfig, ProcessConfig } from '@/app/watering/types';
import {
  formatMs,
  formatStepDesc,
  formatInterruptDesc,
  formatScheduleDesc,
  formatProcessDesc,
} from '@/app/watering/utils/format-desc';

// ================================================================
// formatMs
// ================================================================

describe('formatMs', () => {
  it('< 1000 毫秒显示毫秒', () => {
    expect(formatMs(500)).toBe('500毫秒');
    expect(formatMs(0)).toBe('0毫秒');
  });

  it('1000 ~ 59999 毫秒显示秒', () => {
    expect(formatMs(1000)).toBe('1秒');
    expect(formatMs(2000)).toBe('2秒');
    expect(formatMs(59000)).toBe('59秒');
  });

  it('≥ 60000 毫秒显示分秒，整分省略秒', () => {
    expect(formatMs(60000)).toBe('1分');
    expect(formatMs(120000)).toBe('2分');
    expect(formatMs(90000)).toBe('1分30秒');
    expect(formatMs(125000)).toBe('2分5秒');
  });
});

// ================================================================
// formatStepDesc
// ================================================================

describe('formatStepDesc', () => {
  it('仅组件名', () => {
    const step: StepConfig = { name: '测试步骤', value: { begin: undefined, end: undefined }, component: 'pump_1' };
    expect(formatStepDesc(step)).toBe('pump_1');
  });

  it('所有字段都有的完整步骤', () => {
    const step: StepConfig = {
      name: '浇花',
      component: 'motor_0',
      value: { begin: 0, end: 100 },
      delay: 2000,
      timeout: 90000,
      interrupts: [{ name: '过热', component: 'sensor_0', state: 1 }],
    };
    expect(formatStepDesc(step)).toBe('motor_0 · 值:0~100 · 延迟2秒 · 超时1分30秒 · 1个中断');
  });

  it('value 缺 begin 显示 ?', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: 50 }, component: 'p' };
    expect(formatStepDesc(step)).toBe('p · 值:?~50');
  });

  it('value 缺 end 显示 ?', () => {
    const step: StepConfig = { name: 's', value: { begin: 10, end: undefined }, component: 'p' };
    expect(formatStepDesc(step)).toBe('p · 值:10~?');
  });

  it('disabled 追加【已禁用】', () => {
    const step: StepConfig = { name: '禁', component: 'motor_0', value: { begin: undefined, end: undefined }, disabled: true };
    expect(formatStepDesc(step)).toBe('motor_0 · 【已禁用】');
  });

  it('disabled 为 false 时不显示', () => {
    const step: StepConfig = { name: '启', component: 'motor_0', value: { begin: undefined, end: undefined }, disabled: false };
    expect(formatStepDesc(step)).toBe('motor_0');
  });

  it('delay/timeout 为 0 时不显示', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: undefined }, delay: 0, timeout: 0 };
    expect(formatStepDesc(step)).toBe('');
  });

  it('timeout 为 undefined 时不显示', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: undefined }, timeout: undefined, component: 'p' };
    expect(formatStepDesc(step)).toBe('p');
  });

  it('中断数组为空时不显示', () => {
    const step: StepConfig = { name: 's', value: { begin: undefined, end: undefined }, component: 'p', interrupts: [] };
    expect(formatStepDesc(step)).toBe('p');
  });
});

// ================================================================
// formatInterruptDesc
// ================================================================

describe('formatInterruptDesc', () => {
  it('模拟信号 + 完整字段', () => {
    const intr: InterruptConfig = {
      name: '温度过高',
      component: 'sensor_0',
      state: 30,
      signalType: 'analog',
      logic: '>',
      threshold: 30,
      intercept: 3,
      delay: 1000,
      duration: 65000,
      disabled: false,
    };
    expect(formatInterruptDesc(intr)).toBe('sensor_0 · >30 · 拦截3次 · 延迟1秒 · 持续1分5秒');
  });

  it('数字信号 — state true 显示 =开', () => {
    const intr: InterruptConfig = { name: '按钮', component: 'button_0', state: true, signalType: 'digital' };
    expect(formatInterruptDesc(intr)).toBe('button_0 · =开');
  });

  it('数字信号 — state false 显示 =关', () => {
    const intr: InterruptConfig = { name: '按钮', component: 'button_0', state: false, signalType: 'digital' };
    expect(formatInterruptDesc(intr)).toBe('button_0 · =关');
  });

  it('无 signalType 时不显示条件', () => {
    const intr: InterruptConfig = { name: '空', component: 's', state: 1 };
    expect(formatInterruptDesc(intr)).toBe('s');
  });

  it('模拟信号缺 logic 时不显示条件', () => {
    const intr: InterruptConfig = { name: 'x', component: 's', state: 0, signalType: 'analog', threshold: 10 };
    expect(formatInterruptDesc(intr)).toBe('s');
  });

  it('已禁用', () => {
    const intr: InterruptConfig = { name: '禁', component: 'sensor_0', state: 1, disabled: true };
    expect(formatInterruptDesc(intr)).toBe('sensor_0 · 【已禁用】');
  });

  it('intercept/delay/duration 为 0 时跳过', () => {
    const intr: InterruptConfig = { name: 'x', component: 's', state: 1, intercept: 0, delay: 0, duration: 0 };
    expect(formatInterruptDesc(intr)).toBe('s');
  });
});

// ================================================================
// formatScheduleDesc
// ================================================================

describe('formatScheduleDesc', () => {
  const processes: ProcessConfig[] = [
    { name: '浇灌', steps: [] },
    { name: '施肥', steps: [] },
  ];

  it('显示流程名和间隔天', () => {
    const sch: ScheduleConfig = { type: 'day', value: 28800000, interval: 2, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 间隔2天');
  });

  it('type=minute 显示间隔分钟', () => {
    const sch: ScheduleConfig = { type: 'minute', value: 0, interval: 5, process: 1 };
    expect(formatScheduleDesc(sch, processes)).toBe('施肥 · 间隔5分钟');
  });

  it('interval=1 不显示间隔', () => {
    const sch: ScheduleConfig = { type: 'day', value: 28800000, interval: 1, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌');
  });

  it('已禁用', () => {
    const sch: ScheduleConfig = { type: 'day', value: 28800000, interval: 2, process: 0, disabled: true };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 间隔2天 · 【已禁用】');
  });

  it('process 索引越界时不显示流程名', () => {
    const sch: ScheduleConfig = { type: 'day', value: 0, interval: 3, process: 99 };
    expect(formatScheduleDesc(sch, processes)).toBe('间隔3天');
  });
});

// ================================================================
// formatProcessDesc
// ================================================================

describe('formatProcessDesc', () => {
  it('仅步骤数', () => {
    const proc: ProcessConfig = { name: '浇花', steps: [{ name: 's1', value: { begin: undefined, end: undefined } }, { name: 's2', value: { begin: undefined, end: undefined } }] };
    expect(formatProcessDesc(proc)).toBe('2个步骤');
  });

  it('有触发时追加触发', () => {
    const proc: ProcessConfig = { name: '浇花', trigger: 'button_1', steps: [{ name: 's1', value: { begin: undefined, end: undefined } }] };
    expect(formatProcessDesc(proc)).toBe('1个步骤 · 触发:button_1');
  });

  it('0个步骤时显示 0个步骤', () => {
    const proc: ProcessConfig = { name: '空', steps: [] };
    expect(formatProcessDesc(proc)).toBe('0个步骤');
  });
});
