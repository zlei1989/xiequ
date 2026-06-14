/**
 * 流程编辑器 — 编辑单个 Process 的名称、触发按钮、步骤列表
 *
 * 使用 antd-mobile Form 替代 List，vertical 布局适合移动端表单。
 * 数据流保持受控模式，通过 process/onChange props 驱动。
 */

'use client';

import { Input, Picker, ErrorBlock, Form, SwipeAction, Button, Dialog } from 'antd-mobile';
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
    <Form layout="vertical">
      {/* 功能名称 */}
      <Form.Item label="功能名称">
        <Input
          placeholder="输入流程名称"
          value={process.name}
          onChange={(v) => { onChange({ ...process, name: v }); }}
        />
      </Form.Item>

      {/* 触发按钮 — 点击 Form.Item 触发 Picker.prompt 弹窗选择 */}
      <Form.Item
        label="触发按钮"
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
        <Input
          readOnly
          placeholder="未选择"
          value={process.trigger || ''}
        />
      </Form.Item>

      {/* 无可用按钮时的提示 */}
      {buttonOptions.length === 0 && (
        <ErrorBlock
          description="请等待设备上报 GPIO 状态"
          status="empty"
          title="无可用按钮"
        />
      )}

      {/* 步骤列表 — 使用 Form.Header 作为分组标题 */}
      <Form.Header>步骤列表</Form.Header>
      {process.steps.map((s, idx) => (
        <SwipeAction
          key={idx}
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
          <Form.Item
            help={s.component}
            label={s.name}
            onClick={() => { onEditStep(idx); }}
          >
            {/* Form.Item 要求单个子元素，空占位满足结构要求 */}
            <div />
          </Form.Item>
        </SwipeAction>
      ))}

      {/* 添加步骤 */}
      <Form.Item>
        <Button block color="primary"  onClick={onAddStep}>
          <span><AddOutline />添加步骤</span>
        </Button>
      </Form.Item>
    </Form>
  );
}
