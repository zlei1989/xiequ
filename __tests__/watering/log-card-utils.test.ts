// @vitest-environment jsdom

/**
 * log-card 工具函数单元测试
 *
 * 测试 groupByStateId / formatDuration / formatSimpleDuration / formatMessage /
 * formatCause / extractProcessNames / countSteps / calcSleepDuration。
 */

import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';

import {
  groupByStateId,
  formatDuration,
  formatMessage,
  formatCause,
  extractProcessNames,
  countSteps,
  calcSleepDuration,
  formatSeconds,
  parseLogMessage,
} from '@/app/watering/components/log-card';
import type { LogItem } from '@/app/watering/components/log-card';

import type React from 'react';

/** 构造测试用 LogItem，只需传覆写字段 */
function makeLog(overrides: Partial<LogItem> = {}): LogItem {
  return {
    event: 'execute',
    createdTime: '2026-06-13T10:00:00.000Z',
    stateId: 'state_001',
    voltage: 3.7,
    ...overrides,
  };
}

// ================================================================
// groupByStateId
// ================================================================

describe('groupByStateId', () => {
  it('空数组返回空列表', () => {
    expect(groupByStateId([])).toEqual([]);
  });

  it('单组单条日志直接返回一组', () => {
    const result = groupByStateId([makeLog()]);
    expect(result).toHaveLength(1);
    expect(result[0]?.stateId).toBe('state_001');
    expect(result[0]?.items).toHaveLength(1);
  });

  it('多条同 stateId 归入同组，组内按时间正序', () => {
    const logs = [
      makeLog({ createdTime: '2026-06-13T10:00:03.000Z', stateId: 's1' }),
      makeLog({ createdTime: '2026-06-13T10:00:01.000Z', stateId: 's1' }),
      makeLog({ createdTime: '2026-06-13T10:00:02.000Z', stateId: 's1' }),
    ];
    const result = groupByStateId(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.stateId).toBe('s1');
    expect(result[0]?.items.map((i) => i.createdTime)).toEqual([
      '2026-06-13T10:00:01.000Z',
      '2026-06-13T10:00:02.000Z',
      '2026-06-13T10:00:03.000Z',
    ]);
  });

  it('不同 stateId 分组，组间按最新事件倒序', () => {
    const logs = [
      makeLog({ createdTime: '2026-06-13T10:00:01.000Z', stateId: 'group_A' }),
      makeLog({ createdTime: '2026-06-13T10:00:05.000Z', stateId: 'group_A' }),
      makeLog({ createdTime: '2026-06-13T10:00:10.000Z', stateId: 'group_B' }),
      makeLog({ createdTime: '2026-06-13T10:00:08.000Z', stateId: 'group_B' }),
    ];
    const result = groupByStateId(logs);
    expect(result).toHaveLength(2);
    expect(result[0]?.stateId).toBe('group_B');
    expect(result[1]?.stateId).toBe('group_A');
  });

  it('缺失 stateId 归入 _unknown 组', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:01.000Z', stateId: undefined }),
      makeLog({ createdTime: '2026-06-13T10:00:02.000Z', stateId: undefined }),
    ] as LogItem[];
    const result = groupByStateId(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.stateId).toBe('_unknown');
    expect(result[0]?.items).toHaveLength(2);
  });
});

// ================================================================
// formatDuration & formatSimpleDuration
// ================================================================

describe('formatDuration', () => {
  it('少于 2 条返回空字符串', () => {
    expect(formatDuration([])).toBe('');
    expect(formatDuration([makeLog()])).toBe('');
  });

  it('小于 60 秒返回"刚刚"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:00:45.000Z' }),
    ];
    expect(formatDuration(items)).toBe('刚刚');
  });

  it('60 秒 ~ 1 小时返回"X分钟"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:03:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('3分钟');
  });

  it('1 小时 ~ 1 天返回"X小时"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T15:30:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('5小时');
  });

  it('≥1 天返回"X天"', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-15T10:00:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('2天');
  });
});

// ================================================================
// formatSeconds
// ================================================================

describe('formatSeconds', () => {
  it('0 返回 "0秒"', () => {
    expect(formatSeconds(0)).toBe('0秒');
  });

  it('小于 60 秒保持原样', () => {
    expect(formatSeconds(45)).toBe('45秒');
  });

  it('整分钟省略秒', () => {
    expect(formatSeconds(120)).toBe('2分');
  });

  it('分钟 + 秒', () => {
    expect(formatSeconds(1000)).toBe('16分40秒');
  });

  it('整小时省略分秒', () => {
    expect(formatSeconds(3600)).toBe('1小时');
  });

  it('小时 + 分 + 秒', () => {
    expect(formatSeconds(3661)).toBe('1小时1分1秒');
  });

  it('多整小时', () => {
    expect(formatSeconds(7200)).toBe('2小时');
  });

  it('小时 + 秒（无分钟）', () => {
    expect(formatSeconds(7205)).toBe('2小时5秒');
  });

  it('负数取绝对值', () => {
    expect(formatSeconds(-120)).toBe('2分');
  });
});

// ================================================================
// parseLogMessage
// ================================================================

describe('parseLogMessage', () => {
  it('纯文本无占位符返回单个 text 段', () => {
    const result = parseLogMessage('设备开机');
    expect(result).toEqual([{ type: 'text', value: '设备开机' }]);
  });

  it('空字符串返回空数组', () => {
    const result = parseLogMessage('');
    expect(result).toEqual([]);
  });

  it('单个非时间占位符', () => {
    const result = parseLogMessage('{processName:浇花}');
    expect(result).toEqual([{ type: 'var', value: '浇花' }]);
  });

  it('单个时间占位符（timeout）转换为可读格式', () => {
    const result = parseLogMessage('{timeout:1000}');
    expect(result).toEqual([{ type: 'var', value: '16分40秒' }]);
  });

  it('多个时间 key 均转换：duration, stepDuration, expire', () => {
    expect(parseLogMessage('{duration:120}')).toEqual([{ type: 'var', value: '2分' }]);
    expect(parseLogMessage('{stepDuration:3600}')).toEqual([{ type: 'var', value: '1小时' }]);
    expect(parseLogMessage('{expire:65}')).toEqual([{ type: 'var', value: '1分5秒' }]);
  });

  it('文本与占位符混合', () => {
    const result = parseLogMessage('负载{componentKey:load_0}{value:200}已打开。');
    expect(result).toEqual([
      { type: 'text', value: '负载' },
      { type: 'var', value: 'load_0' },
      { type: 'var', value: '200' },
      { type: 'text', value: '已打开。' },
    ]);
  });

  it('完整超时消息示例', () => {
    const result = parseLogMessage(
      '{processName:侵水浇花}流程的{stepName:抽水池壹}{stepId:2}环节持续{timeout:1000}超时。',
    );
    expect(result).toEqual([
      { type: 'var', value: '侵水浇花' },
      { type: 'text', value: '流程的' },
      { type: 'var', value: '抽水池壹' },
      { type: 'var', value: '2' },
      { type: 'text', value: '环节持续' },
      { type: 'var', value: '16分40秒' },
      { type: 'text', value: '超时。' },
    ]);
  });

  it('占位符中的 key 区分大小写严格匹配', () => {
    const result = parseLogMessage('{Timeout:1000}');
    expect(result).toEqual([{ type: 'var', value: '1000' }]);
  });

  it('占位符内无冒号按普通文本处理', () => {
    const result = parseLogMessage('{timeout1000}');
    expect(result).toEqual([{ type: 'text', value: '{timeout1000}' }]);
  });
});

// ================================================================
// formatMessage
// ================================================================

describe('formatMessage', () => {
  /** 将 ReactNode 转为 HTML 字符串用于断言 */
  function renderMsg(item: LogItem): string {
    return renderToString(formatMessage(item) as React.ReactElement);
  }

  it('有 message 含占位符时变量高亮', () => {
    const item = makeLog({
      message: '{processName:浇花}流程的{stepName:浇水}{stepId:0}环节持续{timeout:1000}超时。',
      event: 'change',
    });
    const html = renderMsg(item);
    // 变量值应在带 color 样式的 span 中
    expect(html).toContain('style="color:var(--adm-color-primary)"');
    expect(html).toContain('>浇花<');
    expect(html).toContain('>浇水<');
    expect(html).toContain('>0<');
    expect(html).toContain('>16分40秒<');
    // 普通文本也在 span 中（无 color）
    expect(html).toContain('>超时。<');
  });

  it('有 message 但无占位符时保持纯文本', () => {
    const item = makeLog({ message: '自定义消息内容' });
    const html = renderMsg(item);
    expect(html).toContain('>自定义消息内容<');
    // 无高亮 span（无 color 属性）
    expect(html).not.toContain('color:var(--adm-color-primary)');
  });

  it('bootstrap 事件无 cause', () => {
    const item = makeLog({ event: 'bootstrap' });
    const html = renderMsg(item);
    expect(html).toContain('>设备开机<');
  });

  it('bootstrap 事件带 cause="4" 映射为定时唤醒', () => {
    const item = makeLog({ event: 'bootstrap', cause: '4' });
    const html = renderMsg(item);
    expect(html).toContain('>定时唤醒开机<');
  });

  it('execute 事件带 process.name', () => {
    const item = makeLog({ event: 'execute', process: { name: '浇花流程A' } });
    const html = renderMsg(item);
    expect(html).toContain('>执行流程: 浇花流程A<');
  });

  it('execute 事件无 process', () => {
    const item = makeLog({ event: 'execute' });
    const html = renderMsg(item);
    expect(html).toContain('>执行流程<');
  });

  it('terminate 事件', () => {
    const item = makeLog({ event: 'terminate' });
    const html = renderMsg(item);
    expect(html).toContain('>终止流程<');
  });

  it('finish 事件', () => {
    const item = makeLog({ event: 'finish' });
    const html = renderMsg(item);
    expect(html).toContain('>完成流程<');
  });

  it('change 事件（无 message）', () => {
    const item = makeLog({ event: 'change' });
    const html = renderMsg(item);
    expect(html).toContain('>流程状态变更<');
  });

  it('heartbeat 事件', () => {
    const item = makeLog({ event: 'heartbeat' });
    const html = renderMsg(item);
    expect(html).toContain('>心跳<');
  });

  it('未知事件返回原文', () => {
    const item = makeLog({ event: 'custom_event' });
    const html = renderMsg(item);
    expect(html).toContain('>custom_event<');
  });
});

// ================================================================
// formatCause
// ================================================================

describe('formatCause', () => {
  it('"0" 映射为正常上电', () => {
    expect(formatCause('0')).toBe('正常上电');
  });

  it('"2" 映射为外部唤醒', () => {
    expect(formatCause('2')).toBe('外部唤醒');
  });

  it('"4" 映射为定时唤醒', () => {
    expect(formatCause('4')).toBe('定时唤醒');
  });

  it('未知值返回空字符串', () => {
    expect(formatCause('99')).toBe('');
  });

  it('undefined 返回空字符串', () => {
    expect(formatCause(undefined)).toBe('');
  });
});

// ================================================================
// extractProcessNames
// ================================================================

describe('extractProcessNames', () => {
  it('空数组返回空列表', () => {
    expect(extractProcessNames([])).toEqual([]);
  });

  it('从 change 事件 message 提取流程名', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}{stepId:0}环节开始执行。负载{componentKey:load_0}{value:200}已打开。' }),
    ];
    expect(extractProcessNames(items)).toEqual(['浇花']);
  });

  it('多个同名流程去重', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节开始执行。' }),
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节结束。' }),
    ];
    expect(extractProcessNames(items)).toEqual(['浇花']);
  });

  it('多个不同流程按首次出现顺序排列', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节开始执行。' }),
      makeLog({ event: 'change', message: '{processName:施肥}流程的{stepName:施肥}环节开始执行。' }),
      makeLog({ event: 'change', message: '{processName:浇花}流程的{stepName:浇水}环节结束。' }),
    ];
    expect(extractProcessNames(items)).toEqual(['浇花', '施肥']);
  });

  it('无 message 的 change 事件被跳过', () => {
    const items: LogItem[] = [
      makeLog({ event: 'change', message: undefined }),
    ];
    expect(extractProcessNames(items)).toEqual([]);
  });

  it('非 change 事件被忽略', () => {
    const items: LogItem[] = [
      makeLog({ event: 'bootstrap', message: '{processName:浇花}...' }),
    ];
    expect(extractProcessNames(items)).toEqual([]);
  });
});

// ================================================================
// countSteps
// ================================================================

describe('countSteps', () => {
  it('空数组返回 0', () => {
    expect(countSteps([])).toBe(0);
  });

  it('统计 change 事件数', () => {
    const items: LogItem[] = [
      makeLog({ event: 'bootstrap' }),
      makeLog({ event: 'change' }),
      makeLog({ event: 'change' }),
      makeLog({ event: 'finish' }),
    ];
    expect(countSteps(items)).toBe(2);
  });

  it('无 change 事件返回 0', () => {
    const items: LogItem[] = [
      makeLog({ event: 'bootstrap' }),
      makeLog({ event: 'finish' }),
    ];
    expect(countSteps(items)).toBe(0);
  });
});

// ================================================================
// calcSleepDuration
// ================================================================

describe('calcSleepDuration', () => {
  it('首条日志返回 0', () => {
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    expect(calcSleepDuration(current, [current])).toBe(0);
  });

  it('计算与前一条日志的时间差', () => {
    const prev = makeLog({ createdTime: '2026-06-13T08:00:00.000Z' });
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    const allLogs = [current, prev];
    expect(calcSleepDuration(current, allLogs)).toBe(7200);
  });

  it('多条日志只取时间最近的前一条', () => {
    const oldest = makeLog({ createdTime: '2026-06-13T06:00:00.000Z' });
    const prev = makeLog({ createdTime: '2026-06-13T08:00:00.000Z' });
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    const allLogs = [current, prev, oldest];
    expect(calcSleepDuration(current, allLogs)).toBe(7200);
  });

  it('后于当前时间的日志被忽略', () => {
    const current = makeLog({ createdTime: '2026-06-13T10:00:00.000Z' });
    const future = makeLog({ createdTime: '2026-06-13T12:00:00.000Z' });
    const allLogs = [future, current];
    expect(calcSleepDuration(current, allLogs)).toBe(0);
  });
});
