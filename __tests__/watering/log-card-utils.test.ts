/**
 * log-card 工具函数单元测试
 *
 * 测试 groupByStateId / formatDuration / formatMessage 三个纯函数。
 */

import { describe, it, expect } from 'vitest';

import {
  groupByStateId,
  formatDuration,
  formatMessage,
} from '@/app/watering/components/log-card';
import type { LogItem } from '@/app/watering/components/log-card';

/** 构造测试用 LogItem，只需传覆写字段 */
function makeLog(overrides: Partial<LogItem> = {}): LogItem {
  return {
    event: 'execute',
    createdTime: '2026-06-13T10:00:00.000Z',
    stateId: 'state_001',
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
    // 组内正序
    expect(result[0]?.items.map((i) => i.createdTime)).toEqual([
      '2026-06-13T10:00:01.000Z',
      '2026-06-13T10:00:02.000Z',
      '2026-06-13T10:00:03.000Z',
    ]);
  });

  it('不同 stateId 分组，组间按最新事件倒序', () => {
    const logs = [
      // group_A 最新 10:00:05
      makeLog({ createdTime: '2026-06-13T10:00:01.000Z', stateId: 'group_A' }),
      makeLog({ createdTime: '2026-06-13T10:00:05.000Z', stateId: 'group_A' }),
      // group_B 最新 10:00:10
      makeLog({ createdTime: '2026-06-13T10:00:10.000Z', stateId: 'group_B' }),
      makeLog({ createdTime: '2026-06-13T10:00:08.000Z', stateId: 'group_B' }),
    ];
    const result = groupByStateId(logs);
    expect(result).toHaveLength(2);
    // group_B 最新时间更晚，应排在前面
    expect(result[0]?.stateId).toBe('group_B');
    expect(result[1]?.stateId).toBe('group_A');
  });

  it('缺失 stateId 归入 _unknown 组', () => {
    // 构造两条明确没有 stateId 的日志
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
// formatDuration
// ================================================================

describe('formatDuration', () => {
  it('少于 2 条返回空字符串', () => {
    expect(formatDuration([])).toBe('');
    expect(formatDuration([makeLog()])).toBe('');
  });

  it('小于 60 秒仅显示秒数', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:00:45.000Z' }),
    ];
    expect(formatDuration(items)).toBe('45秒');
  });

  it('60~3600 秒以分秒格式显示', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:03:25.000Z' }),
    ];
    // 3分25秒 = 205秒
    expect(formatDuration(items)).toBe('3分25秒');
  });

  it('超过 3600 秒以时分秒格式显示', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T12:05:30.000Z' }),
    ];
    // 2小时5分30秒 = 7530秒
    expect(formatDuration(items)).toBe('2时5分30秒');
  });

  it('刚好 60 秒边界仍显示秒数（严格 >60 才进分秒分支）', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T10:01:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('60秒');
  });

  it('刚好 3600 秒边界走分秒格式（严格 >3600 才进时分秒分支）', () => {
    const items = [
      makeLog({ createdTime: '2026-06-13T10:00:00.000Z' }),
      makeLog({ createdTime: '2026-06-13T11:00:00.000Z' }),
    ];
    expect(formatDuration(items)).toBe('60分0秒');
  });
});

// ================================================================
// formatMessage
// ================================================================

describe('formatMessage', () => {
  it('有 message 字段时优先返回 message', () => {
    const item = makeLog({ message: '自定义消息内容' });
    expect(formatMessage(item)).toBe('自定义消息内容');
  });

  it('bootstrap 事件无 cause', () => {
    const item = makeLog({ event: 'bootstrap' });
    expect(formatMessage(item)).toBe('设备开机');
  });

  it('bootstrap 事件带 cause', () => {
    const item = makeLog({ event: 'bootstrap', cause: '定时重启' });
    expect(formatMessage(item)).toBe('设备(原因:定时重启)开机');
  });

  it('execute 事件带 process.name', () => {
    const item = makeLog({ event: 'execute', process: { name: '浇花流程A' } });
    expect(formatMessage(item)).toBe('执行流程: 浇花流程A');
  });

  it('execute 事件无 process 对象', () => {
    const item = makeLog({ event: 'execute' });
    // 无 process 字段，显示 "执行流程"
    expect(formatMessage(item)).toBe('执行流程');
  });

  it('terminate 事件格式化', () => {
    const item = makeLog({ event: 'terminate' });
    expect(formatMessage(item)).toBe('终止流程');
  });

  it('finish 事件格式化', () => {
    const item = makeLog({ event: 'finish' });
    expect(formatMessage(item)).toBe('完成流程');
  });

  it('offline 事件格式化', () => {
    const item = makeLog({ event: 'offline' });
    expect(formatMessage(item)).toBe('设备离线');
  });

  it('未知事件类型返回事件名原文', () => {
    const item = makeLog({ event: 'custom_event' });
    expect(formatMessage(item)).toBe('custom_event');
  });

  it('change 事件（无预定义标签）返回原文', () => {
    const item = makeLog({ event: 'change' });
    expect(formatMessage(item)).toBe('change');
  });
});
