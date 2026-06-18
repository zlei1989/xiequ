/**
 * 计划任务检查逻辑单元测试
 *
 * 测试 once/day/minute/week 四种循环类型的触发判断：
 * - 触发时间计算
 * - 45 分钟误差容忍
 * - interval 去重
 * - disabled 跳过
 * - 时区解耦：计算结果不依赖服务器本地时区
 */

import { describe, it, expect } from 'vitest';

/** 计划任务检查的最大误差容忍（毫秒） */
const SCHEDULE_OFFSET = 45 * 60 * 1000;

/** 测试用固定时区偏移（UTC+8 = 480 分钟） */
const TZ_OFFSET = 480;

/**
 * 获取配置时区下某天的零点 UTC 时间戳（毫秒）
 *
 * 与 get-state/route.ts 中 startOfDayInTz 逻辑一致。
 */
function startOfDayInTz(date: Date): number {
  const localMs = date.getTime() + TZ_OFFSET * 60000;
  const localDate = new Date(localMs);
  const midnightOffset =
    localDate.getUTCHours() * 3600000 +
    localDate.getUTCMinutes() * 60000 +
    localDate.getUTCSeconds() * 1000 +
    localDate.getUTCMilliseconds();
  return localMs - midnightOffset - TZ_OFFSET * 60000;
}

/**
 * 获取配置时区下的星期几（1=周一...7=周日）
 *
 * 与 get-state/route.ts 中 getWeekDayInTz 逻辑一致。
 */
function getWeekDayInTz(date: Date): number {
  const localDate = new Date(date.getTime() + TZ_OFFSET * 60000);
  const jsDay = localDate.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * 计算 day/week 类型计划任务的今日触发时间戳（毫秒）
 *
 * 使用 startOfDayInTz，与 get-state/route.ts 中实现一致。
 */
function calcDayLoopTriggerTime(now: Date, value: number): number {
  return startOfDayInTz(now) + value;
}

/**
 * 计算 minute 类型计划任务的当前理论触发时间戳（毫秒）
 */
function calcMinuteTriggerTime(startTime: number, intervalMinutes: number, now: Date): number {
  const intervalMs = intervalMinutes * 60000;
  const elapsed = now.getTime() - startTime;
  if (elapsed < 0) return startTime;
  const n = Math.floor(elapsed / intervalMs);
  return startTime + n * intervalMs;
}

/**
 * 计算 week 类型计划任务的今日触发时间戳（毫秒）
 */
function calcWeekTriggerTime(now: Date, value: number, week: number): number | null {
  if (getWeekDayInTz(now) !== week) return null;
  return calcDayLoopTriggerTime(now, value);
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
    const startDateMidnight = startOfDayInTz(new Date(startTime));
    const nowMidnight = startOfDayInTz(now);
    expect(startDateMidnight > nowMidnight).toBe(true);
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
    expect(getWeekDayInTz(now)).toBe(1);
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
    expect(getWeekDayInTz(now)).toBe(7);
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

// ---- 时区解耦 ----
describe('时区解耦 — startOfDayInTz / getWeekDayInTz', () => {
  it('startOfDayInTz: UTC+8 下北京时间 6:00 的零点应与本地时区计算一致', () => {
    // 北京时间 2026-06-18 06:05 → 零点应为 2026-06-18 00:00+08:00
    const bjTime = new Date('2026-06-18T06:05:00+08:00');
    const midnight = startOfDayInTz(bjTime);
    const expected = new Date('2026-06-18T00:00:00+08:00').getTime();
    expect(midnight).toBe(expected);
  });

  it('startOfDayInTz: UTC 时间下计算 UTC+8 零点结果一致', () => {
    // 同一物理时刻，用 +08:00 和 Z 两种表示
    const bjTime = new Date('2026-06-18T06:05:00+08:00');
    const utcTime = new Date('2026-06-17T22:05:00Z');
    expect(bjTime.getTime()).toBe(utcTime.getTime());
    // 两种表示计算出的 UTC+8 零点应相同
    expect(startOfDayInTz(bjTime)).toBe(startOfDayInTz(utcTime));
  });

  it('startOfDayInTz: 跨日边界 — UTC 时间仍是前一天时，UTC+8 已是新的一天', () => {
    // UTC 22:30 = 北京时间次日 06:30，零点应是北京时间的次日零点
    const utcLateNight = new Date('2026-06-17T22:30:00Z');
    const midnight = startOfDayInTz(utcLateNight);
    // 北京时间 2026-06-18 00:00 = UTC 2026-06-17T16:00:00Z
    const expected = new Date('2026-06-17T16:00:00Z').getTime();
    expect(midnight).toBe(expected);
  });

  it('getWeekDayInTz: UTC 时间 22:00 周日 → UTC+8 已是周一 (week=1)', () => {
    // 2026-06-14 是周日，UTC 22:00 = 北京时间周一 06:00
    const utcSunday = new Date('2026-06-14T22:00:00Z');
    expect(getWeekDayInTz(utcSunday)).toBe(1); // 周一
  });

  it('getWeekDayInTz: 北京时间白天判断星期与 Date.getDay 一致', () => {
    // 2026-06-15 周一，北京时间 10:00
    const bjTime = new Date('2026-06-15T10:00:00+08:00');
    expect(getWeekDayInTz(bjTime)).toBe(1);
  });

  it('calcDayLoopTriggerTime: UTC 服务器计算 UTC+8 的 6:00 触发时间', () => {
    // 模拟 UTC 服务器：当前 UTC 06:05 = 北京时间 14:05
    const utcNow = new Date('2026-06-18T06:05:00Z');
    // value = 6:00 = 21600000ms，在 UTC+8 下指北京时间 06:00
    const triggerTime = calcDayLoopTriggerTime(utcNow, 6 * 3600000);
    // 北京时间 06:00 = UTC 前一天 22:00
    const expected = new Date('2026-06-17T22:00:00Z').getTime();
    expect(triggerTime).toBe(expected);
    // 触发时间应在过去（北京时间 14:05 已过 06:00）
    expect(triggerTime <= utcNow.getTime()).toBe(true);
  });
});
