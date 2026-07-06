/**
 * 计划任务配置 Picker — 按循环类型编辑触发条件、时间、执行流程
 *
 * 根据循环类型（once/day/minute/week）条件渲染不同表单字段。
 * 循环时间用 Picker 实现小时+分钟两列选择，值存储为距 00:00 毫秒偏移。
 * 切换类型时保留 process 和 disabled，重置其余字段为默认值。
 */

'use client';

import { Button, DatePicker, Dialog, Form, NavBar, Picker, Popup, Selector, Stepper, Switch } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { DeleteOutline } from 'antd-mobile-icons';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';

import { useBackButton } from '@/lib/back-button';

import type { ScheduleConfig } from '../types';

/** 循环类型选项 */
const TYPE_OPTIONS = [
  { label: '单次', value: 'once' },
  { label: '天', value: 'day' },
  { label: '分钟', value: 'minute' },
  { label: '星期', value: 'week' },
];

/** 星期选项（值 1=周一...7=周日） */
const WEEK_OPTIONS = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '7' },
];

/** 小时列 0~23 */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: String(i) }));

/** 分钟列 0~59 */
const MINUTE_OPTIONS = Array.from(
  { length: 60 },
  (_, i) => ({ label: String(i), value: String(i) }),
);

/** 循环时间 Picker 列定义 */
const LOOP_TIME_COLUMNS = [HOUR_OPTIONS, MINUTE_OPTIONS];

/** 生成新类型的默认值（保留 process 和 disabled） */
function defaultScheduleForType(type: ScheduleConfig['type'], base: Partial<ScheduleConfig>): ScheduleConfig {
  const now = Date.now();
  const todayStart = dayjs().startOf('day').valueOf();

  switch (type) {
    case 'once':
      return { type, startTime: now, process: base.process ?? 0, disabled: base.disabled };
    case 'day':
      return {
        type,
        startTime: todayStart,
        value: 8 * 3600000,
        interval: 0,
        process: base.process ?? 0,
        disabled: base.disabled,
      };
    case 'minute':
      return {
        type, startTime: now, interval: 30, process: base.process ?? 0, disabled: base.disabled,
      };
    case 'week':
      return {
        type,
        startTime: todayStart,
        value: 8 * 3600000,
        week: 1,
        process: base.process ?? 0,
        disabled: base.disabled,
      };
  }
}

interface ScheduleConfigPickerProps {
  open: boolean;
  schedule: ScheduleConfig;
  processes: { name: string }[];
  onConfirm: (result: ScheduleConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  afterClose?: () => void;
}

interface ScheduleConfigPromptProps {
  schedule: ScheduleConfig;
  processes: { name: string }[];
  onConfirm?: (result: ScheduleConfig) => void;
  onDelete?: () => void;
}

export function ScheduleConfigPicker({
  open,
  schedule,
  processes,
  onConfirm,
  onClose,
  onDelete,
  afterClose,
}: ScheduleConfigPickerProps) {
  const [draft, setDraft] = useState(schedule);

  /* eslint-disable react-hooks/set-state-in-effect -- ID-based stale closure prevention */
  useEffect(() => {
    setDraft(schedule);
  }, [open, schedule]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useBackButton(open, onClose);

  function update(updated: ScheduleConfig) {
    setDraft(updated);
    onConfirm(updated);
  }

  /** 循环时间（距 00:00 毫秒偏移）转为 Picker 默认值 */
  const loopTimeDefault = [
    String(Math.floor((draft.value ?? 0) / 3600000)),
    String(Math.floor(((draft.value ?? 0) % 3600000) / 60000)),
  ];

  /** 星期 Picker 默认值 */
  const weekDefault = [String(draft.week ?? 1)];

  /** 开始时间（DatePicker 用） */
  const startTimeDate = new Date(draft.startTime);

  /** 流程选项 */
  const processOptions = processes.map((p, i) => ({
    label: p.name || `流程 ${String(i)}`,
    value: String(i),
  }));

  function confirmDelete() {
    void Dialog.confirm({
      title: '确认删除此计划任务？',
      onConfirm: () => { onDelete?.(); },
    });
  }

  return (
    <Popup
      afterClose={afterClose}
      bodyStyle={{ height: '70vh' }}
      closeOnMaskClick={true}
      position="bottom"
      visible={open}
      onClose={onClose}
      onMaskClick={onClose}
    >
      <NavBar
        right={onDelete ? (
          <Button size="small" onClick={confirmDelete}>
            <DeleteOutline />
          </Button>
        ) : null}
        onBack={onClose}
      >
        编辑计划任务
      </NavBar>

      <div style={{ overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
        <Form layout="vertical">
          {/* 循环类型 */}
          <Form.Item label="循环类型">
            <Selector
              options={TYPE_OPTIONS}
              value={[draft.type]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  const newType = vals[0] as ScheduleConfig['type'];
                  update(defaultScheduleForType(newType, draft));
                }
              }}
            />
          </Form.Item>

          {/* 间隔（天）— 仅 day 类型 */}
          {draft.type === 'day' && (
            <Form.Item help="0 表示每天执行" label="间隔（天）">
              <Stepper
                min={0}
                step={1}
                value={draft.interval ?? 0}
                onChange={(v) => { update({ ...draft, interval: v }); }}
              />
            </Form.Item>
          )}

          {/* 星期 — 仅 week 类型 */}
          {draft.type === 'week' && (
            <Form.Item
              label="星期"
              onClick={() => {
                void Picker.prompt({
                  columns: [WEEK_OPTIONS],
                  defaultValue: weekDefault,
                  onConfirm: (val) => {
                    if (val.length > 0 && typeof val[0] === 'string') {
                      update({ ...draft, week: Number(val[0]) });
                    }
                  },
                });
              }}
            >
              <span>{WEEK_OPTIONS.find((o) => o.value === String(draft.week ?? 1))?.label ?? ''}</span>
            </Form.Item>
          )}

          {/* 间隔（分钟）— 仅 minute 类型 */}
          {draft.type === 'minute' && (
            <Form.Item help="最小 30 分钟" label="间隔（分钟）">
              <Stepper
                className="!w-2/5"
                min={30}
                step={1}
                value={draft.interval ?? 30}
                onChange={(v) => { update({ ...draft, interval: v }); }}
              />
            </Form.Item>
          )}

          {/* 开始时间 — 所有类型 */}
          <Form.Item
            label="开始时间"
            onClick={() => {
              void DatePicker.prompt({
                precision: 'minute',
                defaultValue: startTimeDate,
                onConfirm: (val) => {
                  update({ ...draft, startTime: val.getTime() });
                },
              });
            }}
          >
            <span>{dayjs(draft.startTime).format('YYYY-MM-DD HH:mm')}</span>
          </Form.Item>

          {/* 循环时间 — 仅 day/week 类型 */}
          {(draft.type === 'day' || draft.type === 'week') && (
            <Form.Item
              label="循环时间"
              onClick={() => {
                void Picker.prompt({
                  columns: LOOP_TIME_COLUMNS,
                  defaultValue: loopTimeDefault,
                  onConfirm: (val) => {
                    const hours = typeof val[0] === 'string' ? Number(val[0]) : 0;
                    const minutes = typeof val[1] === 'string' ? Number(val[1]) : 0;
                    const ms = hours * 3600000 + minutes * 60000;
                    update({ ...draft, value: ms });
                  },
                });
              }}
            >
              <span>{dayjs().startOf('day').add(draft.value ?? 0, 'millisecond').format('HH:mm')}</span>
            </Form.Item>
          )}

          {/* 执行流程 */}
          <Form.Item
            label="执行流程"
            onClick={() => {
              void Picker.prompt({
                columns: [processOptions],
                defaultValue: [String(draft.process)],
                onConfirm: (val) => {
                  if (val.length > 0 && typeof val[0] === 'string') {
                    update({ ...draft, process: Number(val[0]) });
                  }
                },
              });
            }}
          >
            <span>
              {processOptions.find((o) => o.value === String(draft.process))?.label ?? ''}
            </span>
          </Form.Item>

          {/* 禁用任务（改名） */}
          <Form.Item label="禁用任务">
            <Switch
              checked={draft.disabled}
              onChange={(checked) => { update({ ...draft, disabled: checked }); }}
            />
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

ScheduleConfigPicker.prompt = (
  props: ScheduleConfigPromptProps,
): Promise<ScheduleConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderToBody 初始化模式
      useEffect(() => { setVisible(true); }, []);
      return React.createElement(ScheduleConfigPicker, {
        open: visible,
        schedule: props.schedule,
        processes: props.processes,
        onConfirm: (result: ScheduleConfig) => {
          props.onConfirm?.(result);
          resolve(result);
        },
        onClose: () => { setVisible(false); resolve(null); },
        onDelete: props.onDelete,
        afterClose: () => { unmount(); },
      });
    };
    const unmount = renderToBody(React.createElement(Wrapper));
  });
};
