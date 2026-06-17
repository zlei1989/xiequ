/**
 * format-desc 工具函数单元测试
 *
 * 测试 formatMs / formatStepDesc / formatInterruptDesc /
 * formatScheduleDesc / formatProcessDesc / formatSensorDesc。
 */

import { describe, it, expect } from 'vitest';

import type { StepConfig, InterruptConfig, ScheduleConfig, ProcessConfig, SensorConfig } from '@/app/watering/types';
import {
  formatMs,
  formatStepDesc,
  formatInterruptDesc,
  formatScheduleDesc,
  formatScheduleTitle,
  formatProcessDesc,
  formatSensorDesc,
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
// formatScheduleTitle
// ================================================================

describe('formatScheduleTitle', () => {
  const processes: ProcessConfig[] = [
    { name: '浇灌', steps: [] },
  ];

  it('once 类型 — 显示"单次 · yyyy-MM-dd HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'once', startTime: new Date('2026-06-17T08:30:00+08:00').getTime(), process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('单次 · 2026-06-17 08:30');
  });

  it('day 类型 interval=0 — 显示"每天 HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: Date.now(), value: 8 * 3600000 + 30 * 60000, interval: 0, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每天 08:30');
  });

  it('day 类型 interval=2 — 显示"每隔2天 HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: Date.now(), value: 14 * 3600000, interval: 2, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每隔2天 14:00');
  });

  it('minute 类型 — 显示"每隔N分钟"', () => {
    const sch: ScheduleConfig = { type: 'minute', startTime: Date.now(), interval: 30, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每隔30分钟');
  });

  it('week 类型 — 显示"每周X HH:mm"', () => {
    const sch: ScheduleConfig = { type: 'week', startTime: Date.now(), week: 1, value: 8 * 3600000, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每周一 08:00');
  });

  it('week 类型周日 — 显示"每周日"', () => {
    const sch: ScheduleConfig = { type: 'week', startTime: Date.now(), week: 7, value: 18 * 3600000, process: 0 };
    expect(formatScheduleTitle(sch, processes)).toBe('每周日 18:00');
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

  it('once 类型 — 仅显示流程名', () => {
    const sch: ScheduleConfig = { type: 'once', startTime: new Date('2026-06-17T08:30:00+08:00').getTime(), process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌');
  });

  it('day 类型 — 显示流程名 + 开始日期', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), value: 28800000, interval: 0, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 开始 2026-06-17');
  });

  it('minute 类型 — 显示流程名 + 开始日期时间', () => {
    const sch: ScheduleConfig = { type: 'minute', startTime: new Date('2026-06-17T10:00:00+08:00').getTime(), interval: 30, process: 1 };
    expect(formatScheduleDesc(sch, processes)).toBe('施肥 · 开始 2026-06-17 10:00');
  });

  it('week 类型 — 显示流程名 + 开始日期', () => {
    const sch: ScheduleConfig = { type: 'week', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), week: 1, value: 28800000, process: 0 };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 开始 2026-06-17');
  });

  it('已禁用 — 追加【已禁用】', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), value: 28800000, interval: 0, process: 0, disabled: true };
    expect(formatScheduleDesc(sch, processes)).toBe('浇灌 · 开始 2026-06-17 · 【已禁用】');
  });

  it('process 索引越界时不显示流程名', () => {
    const sch: ScheduleConfig = { type: 'day', startTime: new Date('2026-06-17T00:00:00+08:00').getTime(), value: 28800000, interval: 0, process: 99 };
    expect(formatScheduleDesc(sch, processes)).toBe('开始 2026-06-17');
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

// ================================================================
// formatSensorDesc
// ================================================================

describe('formatSensorDesc', () => {
  it('数字信号 — 显示引脚名和"数字"', () => {
    const s: SensorConfig = { name: '按钮', sensor: 'sensor_0', type: 'digital' };
    expect(formatSensorDesc(s)).toBe('sensor_0 · 数字');
  });

  it('模拟信号无转换 — 显示引脚名和"模拟 · ADC"', () => {
    const s: SensorConfig = { name: '原始值', sensor: 'sensor_1', type: 'analog' };
    expect(formatSensorDesc(s)).toBe('sensor_1 · 模拟 · ADC');
  });

  it('分压电阻 — 显示 R1/R2 值', () => {
    const s: SensorConfig = {
      name: '电压',
      sensor: 'sensor_0',
      type: 'analog',
      conversion: 'resistor_divider',
      r1: 30000,
      r2: 10000,
    };
    expect(formatSensorDesc(s)).toBe('sensor_0 · 模拟 · 分压 · R1=30kΩ R2=10kΩ');
  });

  it('NTC 温感 — 显示 B 值', () => {
    const s: SensorConfig = {
      name: '温度',
      sensor: 'sensor_1',
      type: 'analog',
      conversion: 'ntc_10k',
      bValue: 3950,
    };
    expect(formatSensorDesc(s)).toBe('sensor_1 · 模拟 · 温感 · B=3950');
  });

  it('分压电阻缺省 R1/R2 — 使用默认值 30kΩ/10kΩ', () => {
    const s: SensorConfig = {
      name: '默认分压',
      sensor: 'sensor_0',
      type: 'analog',
      conversion: 'resistor_divider',
    };
    expect(formatSensorDesc(s)).toBe('sensor_0 · 模拟 · 分压 · R1=30kΩ R2=10kΩ');
  });

  it('NTC 温感缺省 B 值 — 使用默认 3435', () => {
    const s: SensorConfig = {
      name: '默认温感',
      sensor: 'sensor_1',
      type: 'analog',
      conversion: 'ntc_10k',
    };
    expect(formatSensorDesc(s)).toBe('sensor_1 · 模拟 · 温感 · B=3435');
  });
});
