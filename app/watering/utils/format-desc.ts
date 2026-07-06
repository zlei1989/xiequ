/**
 * 列表描述文本生成工具
 *
 * 为功能、步骤、中断、计划任务、传感器五种配置自动生成简洁描述，
 * 字段有值才显示，disabled 时追加【已禁用】标记。
 */

import dayjs from 'dayjs';

import type { InterruptConfig, ProcessConfig, ScheduleConfig, SensorConfig, StepConfig } from '../types';

/**
 * 将毫秒转为中文时间字符串
 * 规则：<1秒用毫秒，1~59秒用秒，≥60秒用 X分X秒（整分省略秒）
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}毫秒`;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}秒`;

  if (seconds === 0) return `${minutes}分`;

  return `${minutes}分${seconds}秒`;
}

/**
 * 生成步骤列表描述
 * 格式：组件名 · 值:begin~end · 延迟X秒 · 超时X分X秒 · N个中断【已禁用】
 */
export function formatStepDesc(step: StepConfig): string {
  const parts: string[] = [];

  if (step.component) parts.push(step.component);

  const hasBegin = step.value.begin !== undefined && step.value.begin !== null;
  const hasEnd = step.value.end !== undefined && step.value.end !== null;
  if (hasBegin || hasEnd) {
    const begin = hasBegin ? String(step.value.begin) : '?';
    const end = hasEnd ? String(step.value.end) : '?';
    parts.push(`值:${begin}~${end}`);
  }

  if (step.delay && step.delay > 0) parts.push(`延迟${formatMs(step.delay)}`);

  if (step.timeout !== undefined && step.timeout > 0) parts.push(`超时${formatMs(step.timeout)}`);

  if (step.interrupts && step.interrupts.length > 0) parts.push(`${step.interrupts.length}个中断`);

  if (step.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}

/**
 * 生成中断列表描述
 * 格式：组件名 · 条件 · 拦截N次 · 延迟X秒 · 持续X分X秒【已禁用】
 */
export function formatInterruptDesc(intr: InterruptConfig): string {
  const parts: string[] = [];

  if (intr.component) parts.push(intr.component);

  // 条件：模拟信号用 logic+threshold，数字信号用 state 布尔值
  if (intr.signalType === 'analog' && intr.logic && intr.threshold !== undefined) {
    parts.push(`${intr.logic}${intr.threshold}`);
  } else if (intr.signalType === 'digital') {
    parts.push(`=${intr.state ? '开' : '关'}`);
  }

  if (intr.intercept && intr.intercept > 0) parts.push(`拦截${intr.intercept}次`);

  if (intr.delay && intr.delay > 0) parts.push(`延迟${formatMs(intr.delay)}`);

  if (intr.duration && intr.duration > 0) parts.push(`持续${formatMs(intr.duration)}`);

  if (intr.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}

/** 星期中文映射（1=周一...7=周日） */
const WEEKDAY_LABELS: Record<number, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '日',
};

/**
 * 生成计划任务列表标题
 * 格式按类型：单次 · yyyy-MM-dd HH:mm / 每天 HH:mm / 每隔N天 HH:mm / 每隔N分钟 / 每周X HH:mm
 */
export function formatScheduleTitle(sch: ScheduleConfig, _processes: ProcessConfig[]): string {
  switch (sch.type) {
    case 'once':
      return `单次 · ${dayjs(sch.startTime).format('YYYY-MM-DD HH:mm')}`;
    case 'day': {
      const timeStr = dayjs().startOf('day').add(sch.value ?? 0, 'millisecond').format('HH:mm');
      return sch.interval && sch.interval > 0
        ? `每隔${sch.interval}天 ${timeStr}`
        : `每天 ${timeStr}`;
    }
    case 'minute':
      return `每隔${sch.interval ?? 30}分钟`;
    case 'week': {
      const weekLabel = WEEKDAY_LABELS[sch.week ?? 1] ?? '一';
      const timeStr = dayjs().startOf('day').add(sch.value ?? 0, 'millisecond').format('HH:mm');
      return `每周${weekLabel} ${timeStr}`;
    }
  }
}

/**
 * 生成计划任务列表描述
 * 格式：流程名 · 开始 yyyy-MM-dd[ HH:mm]【已禁用】
 * once 类型不显示"开始"（标题已含完整时间），minute 类型"开始"含时间。
 */
export function formatScheduleDesc(sch: ScheduleConfig, processes: ProcessConfig[]): string {
  const parts: string[] = [];

  const proc = sch.process < processes.length ? processes[sch.process] : undefined;
  if (proc?.name) {
    parts.push(proc.name);
  }

  // once 不显示"开始"（标题已含完整时间）
  if (sch.type !== 'once') {
    if (sch.type === 'minute') {
      // minute 类型"开始"含日期和时间
      parts.push(`开始 ${dayjs(sch.startTime).format('YYYY-MM-DD HH:mm')}`);
    } else {
      // day/week 类型只显示日期
      parts.push(`开始 ${dayjs(sch.startTime).format('YYYY-MM-DD')}`);
    }
  }

  if (sch.disabled === true) parts.push('【已禁用】');

  return parts.join(' · ');
}

/**
 * 生成功能列表描述
 * 格式：N个步骤 · 触发:XXX
 */
export function formatProcessDesc(proc: ProcessConfig): string {
  const parts: string[] = [];

  parts.push(`${proc.steps.length}个步骤`);

  if (proc.trigger) parts.push(`触发:${proc.trigger}`);

  return parts.join(' · ');
}

/**
 * 生成传感器列表描述
 * 格式按类型/转换：
 * - 数字信号：sensor_0 · 数字
 * - 模拟信号无转换：sensor_1 · 模拟 · ADC
 * - 分压：sensor_0 · 模拟 · 分压 · R1=30kΩ R2=10kΩ
 * - 温感：sensor_1 · 模拟 · 温感 · B=3435
 */
export function formatSensorDesc(s: SensorConfig): string {
  const typeLabels: Record<string, string> = {
    digital: '数字',
    analog: '模拟',
  };

  const parts = [s.sensor, typeLabels[s.type] ?? s.type];

  if (s.type === 'analog') {
    if (s.conversion === 'resistor_divider') {
      const r1 = (s.r1 ?? 30000) / 1000;
      const r2 = (s.r2 ?? 10000) / 1000;
      parts.push('分压', `R1=${r1}kΩ R2=${r2}kΩ`);
    } else if (s.conversion === 'ntc_10k') {
      parts.push('温感', `B=${s.bValue ?? 3435}`);
    } else {
      parts.push('ADC');
    }
  }

  return parts.join(' · ');
}
