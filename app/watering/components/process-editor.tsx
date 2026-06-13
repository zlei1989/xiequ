/**
 * 流程编辑器 — 编辑单个 Process 的名称、触发按钮、步骤列表
 *
 * 迁移至 antd-mobile：Table→List+SwipeAction，Select→Picker，Empty→ErrorBlock。
 */

'use client';

import { Input, Picker, ErrorBlock, List, SwipeAction, Button, Dialog } from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Process } from '../types';

export function ProcessEditor({
  process,
  gpio,
  onChange,
  onRemove: _onRemove,
  onEditStep,
  onAddStep,
}: {
  process: Process;
  gpio: GpioInfo;
  onChange: (updated: Process) => void;
  onRemove: () => void;
  onEditStep: (index: number) => void;
  onAddStep: () => void;
}) {
  const buttonOptions = gpio.buttons.map((k) => ({
    label: k,
    value: k,
  }));

  return (
    <List>
      {/* 功能名称 */}
      <List.Item title="功能名称">
        <Input
          placeholder="输入流程名称"
          value={process.name}
          onChange={(v) => { onChange({ ...process, name: v }); }}
        />
      </List.Item>

      {/* 触发按钮 */}
      <List.Item
        clickable={buttonOptions.length > 0}
        extra={process.trigger || '未选择'}
        title="触发按钮"
        onClick={() => {
          if (buttonOptions.length === 0) return;
          void Picker.prompt({
            columns: [buttonOptions],
            defaultValue: process.trigger ? [process.trigger] : [],
            onConfirm: (val) => {
              if (val.length > 0 && typeof val[0] === 'string') {
                onChange({ ...process, trigger: val[0] });
              }
            },
          });
        }}
      >
        {buttonOptions.length === 0 && (
          <ErrorBlock
            description="请等待设备上报 GPIO 状态"
            status="empty"
            title="无可用按钮"
          />
        )}
      </List.Item>

      {/* 步骤列表 */}
      <List.Item title="步骤列表" />
      {process.steps.map((s, idx) => (
        <SwipeAction
          key={s.key || idx}
          rightActions={[
            {
              key: 'delete',
              text: '删除',
              color: 'danger',
              onClick: () => {
                void Dialog.confirm({ title: '确认删除此步骤？' }).then(
                  (confirmed) => {
                    if (confirmed) {
                      const newSteps = process.steps.filter((_, i) => i !== idx);
                      onChange({ ...process, steps: newSteps });
                    }
                  },
                );
              },
            },
          ]}
        >
          <List.Item
            clickable
            description={s.component}
            title={s.name}
            onClick={() => { onEditStep(idx); }}
          />
        </SwipeAction>
      ))}

      {/* 添加步骤 */}
      <List.Item>
        <Button block color="primary" onClick={onAddStep}>
          <span><AddOutline /> 添加步骤</span>
        </Button>
      </List.Item>
    </List>
  );
}
