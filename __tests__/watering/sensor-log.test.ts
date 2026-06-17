/**
 * 传感器采样逻辑单元测试
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 测试中断言元素存在后使用 ! 是标准做法 */
import { describe, it, expect } from 'vitest';

/**
 * 单元测试 — calcLatestSlot 15分钟自然时间对齐
 *
 * 分钟数向下取整到 0/15/30/45，秒/毫秒归零。
 */
function calcLatestSlot(now: Date): string {
  const slot = new Date(now);
  const minutes = slot.getMinutes();
  const floored = Math.floor(minutes / 15) * 15;
  slot.setMinutes(floored, 0, 0);
  return slot.toISOString();
}

describe('calcLatestSlot', () => {
  it('14:32 向下取整到 14:30', () => {
    const d = new Date('2026-06-17T14:32:45.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:30:00.000Z');
  });

  it('14:00 保持 14:00（已在整点上）', () => {
    const d = new Date('2026-06-17T14:00:00.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:00:00.000Z');
  });

  it('14:14 向下取整到 14:00', () => {
    const d = new Date('2026-06-17T14:14:59.999Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:00:00.000Z');
  });

  it('14:15 保持 14:15', () => {
    const d = new Date('2026-06-17T14:15:00.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:15:00.000Z');
  });

  it('14:45 中间值向下取整到 14:45', () => {
    const d = new Date('2026-06-17T14:45:30.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:45:00.000Z');
  });

  it('23:59 向下取整到 23:45', () => {
    const d = new Date('2026-06-17T23:59:59.999Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T23:45:00.000Z');
  });

  it('跨小时：00:02 向下取整到 00:00', () => {
    const d = new Date('2026-06-17T00:02:00.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T00:00:00.000Z');
  });
});

/**
 * 单元测试 — recordsToSeries 数据转换
 */
function recordsToSeries(
  records: { recordTime: string; readings: { label: string; value: number }[] }[],
) {
  if (records.length === 0) return [];

  const labelOrder: string[] = [];
  const labelSet = new Set<string>();
  for (const r of records) {
    for (const rd of r.readings) {
      if (!labelSet.has(rd.label)) {
        labelSet.add(rd.label);
        labelOrder.push(rd.label);
      }
    }
  }

  return labelOrder.map((label, idx) => ({
    label,
    color: ['#f87171', '#4ade80', '#60a5fa'][idx % 3] ?? '#4ade80',
    data: records.map((r) => ({
      time: r.recordTime,
      value: r.readings.find((rd) => rd.label === label)?.value ?? 0,
    })),
  }));
}

describe('recordsToSeries', () => {
  it('空数组返回空', () => {
    expect(recordsToSeries([])).toEqual([]);
  });

  it('单个传感器数据转换正确', () => {
    const records = [
      { recordTime: '2026-06-17T14:00:00.000Z', readings: [{ label: '温度', value: 32.5 }] },
      { recordTime: '2026-06-17T14:15:00.000Z', readings: [{ label: '温度', value: 33.0 }] },
    ];
    const result = recordsToSeries(records);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('温度');
    expect(result[0]!.data).toEqual([
      { time: '2026-06-17T14:00:00.000Z', value: 32.5 },
      { time: '2026-06-17T14:15:00.000Z', value: 33.0 },
    ]);
  });

  it('多传感器数据正确分组', () => {
    const records = [
      {
        recordTime: '2026-06-17T14:00:00.000Z',
        readings: [
          { label: '温度', value: 32.5 },
          { label: '电压', value: 12.3 },
        ],
      },
      {
        recordTime: '2026-06-17T14:15:00.000Z',
        readings: [
          { label: '温度', value: 33.0 },
          { label: '电压', value: 12.1 },
        ],
      },
    ];
    const result = recordsToSeries(records);
    expect(result).toHaveLength(2);
    expect(result[0]!.label).toBe('温度');
    expect(result[1]!.label).toBe('电压');
    expect(result[0]!.data).toHaveLength(2);
    expect(result[1]!.data).toHaveLength(2);
  });

  it('部分记录缺少某传感器时补 0', () => {
    const records = [
      { recordTime: '2026-06-17T14:00:00.000Z', readings: [{ label: '温度', value: 32.5 }] },
      { recordTime: '2026-06-17T14:15:00.000Z', readings: [] },
    ];
    const result = recordsToSeries(records);
    expect(result[0]?.data[1]?.value).toBe(0);
  });

  it('保持传感器首次出现顺序', () => {
    const records = [
      {
        recordTime: '2026-06-17T14:00:00.000Z',
        readings: [
          { label: '电压', value: 12.3 },
          { label: '温度', value: 32.5 },
        ],
      },
    ];
    const result = recordsToSeries(records);
    expect(result[0]!.label).toBe('电压');
    expect(result[1]!.label).toBe('温度');
  });
});
