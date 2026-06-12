/**
 * 定时任务编辑器 — 编辑触发周期、时间、执行流程
 *
 * 时间存储格式：schedule.value 为距 00:00 的毫秒数（毫秒时间戳偏移量）
 * 与 dayjs 的转换：
 * - 读取：dayjs().startOf("day").add(value, "millisecond") → dayjs 时刻对象
 * - 写入：dayjs.diff(dayjs().startOf("day"), "millisecond") → 毫秒偏移量
 */

'use client';

import { Select, InputNumber, Switch, TimePicker } from 'antd';
import dayjs from 'dayjs';

import type { Schedule } from '../types';
import type { Dayjs } from 'dayjs';

type Process = { name: string };

export function ScheduleEditor({
  schedules,
  processes,
  onChange,
}: {
  schedules: Schedule[];
  processes: Process[];
  onChange: (updated: Schedule[]) => void;
}) {
  const schedule = schedules[0];
  if (!schedule) return null;

  function update(updated: Schedule) {
    onChange([updated]);
  }

  /**
   * 毫秒值 → dayjs 时刻（仅时间部分）
   *
   * schedule.value 存储的是距 00:00 的毫秒偏移量（如 28800000 = 08:00）。
   * 取当天零点再叠加毫秒偏移，构造出 dayjs 时刻对象供 TimePicker 使用，
   * 日期部分会被 TimePicker 忽略（它只取 HH:mm）。
   */
  const timeValue = dayjs()
    .startOf('day')
    .add(schedule.value || 0, 'millisecond');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          类型
        </label>
        <Select
          value={schedule.type}
          onChange={(v) => { update({ ...schedule, type: v }); }}
          options={[
            { value: 'day', label: '每天' },
            { value: 'minute', label: '每分钟' },
            { value: 'week', label: '每周' },
            { value: 'month', label: '每月' },
          ]}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          间隔（天）
        </label>
        <InputNumber
          value={schedule.interval}
          onChange={(v) => { update({ ...schedule, interval: v ?? 1 }); }}
          step={1}
          min={1}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          时间
        </label>
        <TimePicker
          value={timeValue}
          onChange={(d: Dayjs | null) => {
            if (d) {
              // 反向转换：dayjs 时刻对象 → 距 00:00 的毫秒偏移量
              const ms = d.diff(dayjs().startOf('day'), 'millisecond');
              update({ ...schedule, value: ms });
            }
          }}
          format="HH:mm"
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          执行流程
        </label>
        <Select
          value={schedule.process}
          onChange={(v) => { update({ ...schedule, process: v }); }}
          options={processes.map((p, i) => ({
            value: i,
            label: p.name || `流程 ${i}`,
          }))}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          禁用
        </label>
        <Switch
          checked={!schedule.disabled}
          onChange={(checked) => { update({ ...schedule, disabled: !checked }); }}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
