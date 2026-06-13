/**
 * 定时任务编辑器 — 编辑触发周期、时间、执行流程
 *
 * 使用 antd-mobile List + Picker + DatePicker 构建移动端界面。
 * 时间选择用 DatePicker(precision='minute')，显示和保存时转为距 00:00 毫秒偏移。
 */

'use client';

import { Stepper, Switch, Picker, DatePicker, List } from 'antd-mobile';
import dayjs from 'dayjs';

import type { Schedule } from '../types';

const TYPE_OPTIONS = [
  { label: '每天', value: 'day' },
  { label: '每分钟', value: 'minute' },
  { label: '每周', value: 'week' },
  { label: '每月', value: 'month' },
];

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

  /** 毫秒偏移 → dayjs 时刻（仅时间部分，日期取当天） */
  const timeDate = dayjs()
    .startOf('day')
    .add(schedule.value || 0, 'millisecond')
    .toDate();

  const processOptions = processes.map((p, i) => ({
    label: p.name || `流程 ${String(i)}`,
    value: String(i),
  }));

  return (
    <List>
      {/* 类型 */}
      <List.Item
        title="类型"
        extra={TYPE_OPTIONS.find((o) => o.value === schedule.type)?.label ?? ''}
        clickable
        onClick={() => {
          Picker.prompt({
            columns: [TYPE_OPTIONS],
            defaultValue: [schedule.type],
            onConfirm: (val) => {
              if (val && val.length > 0 && typeof val[0] === 'string') {
                update({ ...schedule, type: val[0] as Schedule['type'] });
              }
            },
          });
        }}
      />

      {/* 间隔 */}
      <List.Item title="间隔（天）">
        <Stepper
          min={1}
          step={1}
          value={schedule.interval}
          onChange={(v) => { update({ ...schedule, interval: v }); }}
        />
      </List.Item>

      {/* 时间 — DatePicker(minute) */}
      <List.Item
        title="时间"
        extra={dayjs(timeDate).format('HH:mm')}
        clickable
        onClick={() => {
          DatePicker.prompt({
            precision: 'minute',
            defaultValue: timeDate,
            onConfirm: (val) => {
              if (val) {
                // Date → 距 00:00 的毫秒偏移量
                const ms = dayjs(val).diff(dayjs(val).startOf('day'), 'millisecond');
                update({ ...schedule, value: ms });
              }
            },
          });
        }}
      />

      {/* 执行流程 */}
      <List.Item
        title="执行流程"
        extra={processOptions.find((o) => o.value === String(schedule.process))?.label ?? ''}
        clickable
        onClick={() => {
          Picker.prompt({
            columns: [processOptions],
            defaultValue: [String(schedule.process)],
            onConfirm: (val) => {
              if (val && val.length > 0 && typeof val[0] === 'string') {
                update({ ...schedule, process: Number(val[0]) });
              }
            },
          });
        }}
      />

      {/* 禁用 */}
      <List.Item
        title="禁用"
        description={schedule.disabled ? '已禁用' : '已启用'}
      >
        <Switch
          checked={!schedule.disabled}
          onChange={(checked) => { update({ ...schedule, disabled: !checked }); }}
        />
      </List.Item>
    </List>
  );
}
