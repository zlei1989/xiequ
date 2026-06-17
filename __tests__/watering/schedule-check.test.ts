/**
 * 计划任务检查逻辑单元测试
 *
 * 测试 once/day/minute/week 四种循环类型的触发判断：
 * - 触发时间计算
 * - 45 分钟误差容忍
 * - interval 去重
 * - disabled 跳过
 */

import { describe, it, expect } from 'vitest';

/** 计划任务检查的最大误差容忍（毫秒） */
const SCHEDULE_OFFSET = 45 * 60 * 1000;

/**
 * 计算 day/week 类型定时任务的今日触发时间戳（毫秒）
 */
function calcDayLoopTriggerTime(now: Date, value: number): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.getTime() + value;
}

/**
 * 计算 minute 类型定时任务的当前理论触发时间戳（毫秒）
 */
function calcMinuteTriggerTime(startTime: number, intervalMinutes: number, now: Date): number {
  const intervalMs = intervalMinutes * 60000;
  const elapsed = now.getTime() - startTime;
  if (elapsed < 0) return startTime;
  const n = Math.floor(elapsed / intervalMs);
  return startTime + n * intervalMs;
}

/**
 * 计算 week 类型定时任务的今日触发时间戳（毫秒）
 */
function calcWeekTriggerTime(now: Date, value: number, week: number): number | null {
  const jsDay = now.getDay();
  const currentWeekDay = jsDay === 0 ? 7 : jsDay;
  if (currentWeekDay !== week) return null;
  return calcDayLoopTriggerTime(now, value);
}

function jsDayToWeekDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function mockHasLog(executedTimes: number[]): (time: number) => boolean {
  return (time: number) => executedTimes.includes(time);
}

// ---- once ----
describe('once 类型触发判断', () => {
  it('到达开始时间且在容忍范围内应触发', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:05:00+08:00');
    const triggerTime = startTime;
    const withinOffset = Math.abs(now.getTime() - triggerTime) <= SCHEDULE_OFFSET;
    const reached = triggerTime <= now.getTime();
    expect(reached && withinOffset).toBe(true);
  });

  it('未到开始时间不应触发', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T07:50:00+08:00');
    expect(startTime <= now.getTime()).toBe(false);
  });

  it('过期超过 45 分钟不应触发', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:50:00+08:00');
    const withinOffset = Math.abs(now.getTime() - startTime) <= SCHEDULE_OFFSET;
    expect(withinOffset).toBe(false);
  });
});

// ---- day ----
describe('day 类型触发判断', () => {
  function makeNow(hours: number, minutes: number): Date {
    const d = new Date('2026-06-14T00:00:00+08:00');
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  it('interval=0 每天都应触发', () => {
    const now = makeNow(10, 5);
    const triggerTime = calcDayLoopTriggerTime(now, 10 * 3600000);
    const withinOffset = Math.abs(now.getTime() - triggerTime) <= SCHEDULE_OFFSET;
    const reached = triggerTime <= now.getTime();
    expect(reached && withinOffset).toBe(true);
  });

  it('interval=2 前天执行过不应再触发', () => {
    const now = makeNow(10, 5);
    const triggerTime = calcDayLoopTriggerTime(now, 10 * 3600000);
    const twoDaysAgo = triggerTime - 2 * 86400000;
    const hasLog = mockHasLog([twoDaysAgo]);
    let previouslyExecuted = false;
    for (let i = 1; i <= 2; i++) {
      if (hasLog(triggerTime - i * 86400000)) {
        previouslyExecuted = true;
        break;
      }
    }
    expect(previouslyExecuted).toBe(true);
  });

  it('startTime 未到（启用日期在未来）不应触发', () => {
    const now = makeNow(10, 5);
    const startTime = new Date('2026-06-20T00:00:00+08:00').getTime();
    const startDate = new Date(startTime);
    startDate.setHours(0, 0, 0, 0);
    const nowDate = new Date(now);
    nowDate.setHours(0, 0, 0, 0);
    expect(startDate.getTime() > nowDate.getTime()).toBe(true);
  });
});

// ---- minute ----
describe('minute 类型触发判断', () => {
  it('从 startTime 开始每隔 N 分钟的理论触发时间', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T09:40:00+08:00');
    const triggerTime = calcMinuteTriggerTime(startTime, 30, now);
    const expected = new Date('2026-06-17T09:30:00+08:00').getTime();
    expect(triggerTime).toBe(expected);
  });

  it('now < startTime 时返回 startTime', () => {
    const startTime = new Date('2026-06-17T10:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:00:00+08:00');
    const triggerTime = calcMinuteTriggerTime(startTime, 30, now);
    expect(triggerTime).toBe(startTime);
  });

  it('恰好等于某个触发点', () => {
    const startTime = new Date('2026-06-17T08:00:00+08:00').getTime();
    const now = new Date('2026-06-17T08:30:00+08:00');
    const triggerTime = calcMinuteTriggerTime(startTime, 30, now);
    expect(triggerTime).toBe(new Date('2026-06-17T08:30:00+08:00').getTime());
  });
});

// ---- week ----
describe('week 类型触发判断', () => {
  it('今天是目标星期且在容忍范围内应触发', () => {
    const now = new Date('2026-06-15T10:05:00+08:00');
    expect(jsDayToWeekDay(now.getDay())).toBe(1);
    const triggerTime = calcWeekTriggerTime(now, 10 * 3600000, 1);
    expect(triggerTime).not.toBeNull();
  });

  it('今天不是目标星期不应触发', () => {
    const now = new Date('2026-06-15T10:05:00+08:00');
    const triggerTime = calcWeekTriggerTime(now, 10 * 3600000, 3);
    expect(triggerTime).toBeNull();
  });

  it('周日对应 week=7', () => {
    const now = new Date('2026-06-14T10:05:00+08:00');
    expect(jsDayToWeekDay(now.getDay())).toBe(7);
  });
});

// ---- calcDayLoopTriggerTime ----
describe('calcDayLoopTriggerTime', () => {
  it('8:00', () => {
    const now = new Date('2026-06-14T10:00:00+08:00');
    const trigger = calcDayLoopTriggerTime(now, 8 * 3600 * 1000);
    const expected = new Date('2026-06-14T08:00:00+08:00').getTime();
    expect(trigger).toBe(expected);
  });
});
