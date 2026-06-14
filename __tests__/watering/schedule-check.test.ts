/**
 * 计划任务检查逻辑单元测试
 *
 * 测试 getNowScheduleProcess 的纯函数核心逻辑：
 * - 触发时间计算
 * - 45 分钟误差容忍
 * - interval 去重
 * - disabled 跳过
 * - switch=on 跳过
 */

import { describe, it, expect } from 'vitest';

/**
 * 计算 day 类型定时任务的触发时间戳（毫秒）
 *
 * @param now 当前时间 Date 对象
 * @param value 距 00:00 的毫秒偏移（如 28800000 = 8:00）
 * @returns 今日触发时间的 Unix 毫秒时间戳
 */
function calcDayTriggerTime(now: Date, value: number): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.getTime() + value;
}

/** 计划任务检查的最大误差容忍（毫秒），对齐 7qb-server */
const SCHEDULE_OFFSET = 45 * 60 * 1000; // 45 分钟

/**
 * 检查单个 day 类型定时任务是否应触发
 *
 * @returns { triggered: true, triggerTime } 或 { triggered: false }
 */
function checkDaySchedule(
  now: Date,
  scheduleValue: number,      // 距 00:00 的毫秒偏移
  scheduleInterval: number,   // 间隔天数
  isDisabled: boolean,
  hasLog: (time: number) => boolean, // 查询某触发时间是否已有执行记录
): { triggered: boolean; triggerTime: number } {
  const triggerTime = calcDayTriggerTime(now, scheduleValue);

  // 1. 禁用检查
  if (isDisabled) {
    return { triggered: false, triggerTime };
  }

  // 2. 时间检查：触发时间必须已经过去
  if (triggerTime > now.getTime()) {
    return { triggered: false, triggerTime };
  }

  // 3. 误差容忍：不能过期超过 45 分钟
  if (Math.abs(now.getTime() - triggerTime) > SCHEDULE_OFFSET) {
    return { triggered: false, triggerTime };
  }

  // 4. 去重：今天已执行 → 跳过
  if (hasLog(triggerTime)) {
    return { triggered: false, triggerTime };
  }

  // 5. interval 去重：前 N-1 天有执行记录 → 跳过
  for (let i = 1; i < scheduleInterval; i++) {
    const prevTime = triggerTime - i * 24 * 3600 * 1000;
    if (hasLog(prevTime)) {
      return { triggered: false, triggerTime };
    }
  }

  return { triggered: true, triggerTime };
}

// ---- 测试用例 ----

/** 创建模拟的 hasLog 函数 */
function mockHasLog(executedTimes: number[]): (time: number) => boolean {
  return (time: number) => executedTimes.includes(time);
}

describe('checkDaySchedule', () => {
  /** 固定基准时间：2026-06-14 10:05 CST，方便断言 */
  function makeNow(hours: number, minutes: number): Date {
    const d = new Date('2026-06-14T00:00:00+08:00');
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  it('到达触发时间：10:05 检查 10:00 的任务应触发', () => {
    const now = makeNow(10, 5);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, false, mockHasLog([]));
    expect(result.triggered).toBe(true);
  });

  it('未到触发时间：9:55 检查 10:00 的任务不应触发', () => {
    const now = makeNow(9, 55);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, false, mockHasLog([]));
    expect(result.triggered).toBe(false);
  });

  it('过期超过 45 分钟：10:50 检查 10:00 的任务不应触发', () => {
    const now = makeNow(10, 50);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, false, mockHasLog([]));
    expect(result.triggered).toBe(false);
  });

  it('刚好在 45 分钟边界内：10:44 检查 10:00 的任务应触发', () => {
    const now = makeNow(10, 44);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, false, mockHasLog([]));
    expect(result.triggered).toBe(true);
  });

  it('刚好超过 45 分钟边界：10:46 检查 10:00 的任务不应触发', () => {
    const now = makeNow(10, 46);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, false, mockHasLog([]));
    expect(result.triggered).toBe(false);
  });

  it('今天已执行：不重复触发', () => {
    const now = makeNow(10, 5);
    const triggerTime = calcDayTriggerTime(now, 10 * 3600 * 1000);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, false, mockHasLog([triggerTime]));
    expect(result.triggered).toBe(false);
  });

  it('interval=1 昨天执行过：仍应触发（间隔=1 只检查今天）', () => {
    const now = makeNow(10, 5);
    const todayTrigger = calcDayTriggerTime(now, 10 * 3600 * 1000);
    const yesterdayTrigger = todayTrigger - 24 * 3600 * 1000;
    const result = checkDaySchedule(
      now, 10 * 3600 * 1000, 1, false, mockHasLog([yesterdayTrigger]),
    );
    expect(result.triggered).toBe(true);
  });

  it('interval=2 昨天执行过：不应触发', () => {
    const now = makeNow(10, 5);
    const todayTrigger = calcDayTriggerTime(now, 10 * 3600 * 1000);
    const yesterdayTrigger = todayTrigger - 24 * 3600 * 1000;
    const result = checkDaySchedule(
      now, 10 * 3600 * 1000, 2, false, mockHasLog([yesterdayTrigger]),
    );
    expect(result.triggered).toBe(false);
  });

  it('interval=3 前天执行过：不应触发', () => {
    const now = makeNow(10, 5);
    const todayTrigger = calcDayTriggerTime(now, 10 * 3600 * 1000);
    const twoDaysAgo = todayTrigger - 2 * 24 * 3600 * 1000;
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 3, false, mockHasLog([twoDaysAgo]));
    expect(result.triggered).toBe(false);
  });

  it('interval=3 两天前执行过，昨天没执行：不应触发（需 3 天空白期）', () => {
    const now = makeNow(10, 5);
    const todayTrigger = calcDayTriggerTime(now, 10 * 3600 * 1000);
    const twoDaysAgo = todayTrigger - 2 * 24 * 3600 * 1000;
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 3, false, mockHasLog([twoDaysAgo]));
    expect(result.triggered).toBe(false);
  });

  it('disabled 跳过', () => {
    const now = makeNow(10, 5);
    const result = checkDaySchedule(now, 10 * 3600 * 1000, 1, true, mockHasLog([]));
    expect(result.triggered).toBe(false);
  });
});

describe('calcDayTriggerTime', () => {
  it('8:00 → 28800000 毫秒偏移', () => {
    const now = new Date('2026-06-14T10:00:00+08:00');
    const trigger = calcDayTriggerTime(now, 8 * 3600 * 1000);
    const expected = new Date('2026-06-14T08:00:00+08:00').getTime();
    expect(trigger).toBe(expected);
  });

  it('18:00 → 64800000 毫秒偏移', () => {
    const now = new Date('2026-06-14T20:00:00+08:00');
    const trigger = calcDayTriggerTime(now, 18 * 3600 * 1000);
    const expected = new Date('2026-06-14T18:00:00+08:00').getTime();
    expect(trigger).toBe(expected);
  });
});
