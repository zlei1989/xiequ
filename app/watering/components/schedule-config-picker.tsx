/**
 * 定时任务配置 Picker — 编辑触发周期、时间、执行流程
 *
 * 使用 antd-mobile Form 替代 List 构建移动端界面。
 * 时间选择用 DatePicker(precision='minute')，显示和保存时转为距 00:00 毫秒偏移。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Stepper, Switch, Picker, Selector, DatePicker, Popup, NavBar, Form, Dialog, Button } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { DeleteOutline } from 'antd-mobile-icons';
import dayjs from 'dayjs';
import React, { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';

import type { ScheduleConfig } from '../types';

const TYPE_OPTIONS = [
  { label: '每天', value: 'day' },
  { label: '每分钟', value: 'minute' },
  { label: '每周', value: 'week' },
  { label: '每月', value: 'month' },
];

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

  const timeDate = dayjs().startOf('day').add(draft.value || 0, 'millisecond').toDate();

  const processOptions = processes.map((p, i) => ({
    label: p.name || `流程 ${String(i)}`,
    value: String(i),
  }));

  function confirmDelete() {
    void Dialog.confirm({
      title: '确认删除此定时任务？',
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
        编辑定时任务
      </NavBar>

      <div style={{ overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
        <Form layout="vertical">
          <Form.Item label="类型">
            <Selector
              options={TYPE_OPTIONS}
              value={[draft.type]}
              onChange={(vals) => {
                if (vals.length > 0) update({ ...draft, type: vals[0] as ScheduleConfig['type'] });
              }}
            />
          </Form.Item>

          <Form.Item label="间隔（天）">
            <Stepper
              min={1}
              step={1}
              value={draft.interval}
              onChange={(v) => { update({ ...draft, interval: v }); }}
            />
          </Form.Item>

          <Form.Item
            label="时间"
            onClick={() => {
              void DatePicker.prompt({
                precision: 'minute',
                defaultValue: timeDate,
                onConfirm: (val) => {
                  const ms = dayjs(val).diff(dayjs(val).startOf('day'), 'millisecond');
                  update({ ...draft, value: ms });
                },
              });
            }}
          >
            <span>{dayjs(timeDate).format('HH:mm')}</span>
          </Form.Item>

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

          <Form.Item label="禁用计划">
            <Switch
              checked={draft.disabled}
              onChange={(checked) => { update({ ...draft, disabled: !checked }); }}
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
