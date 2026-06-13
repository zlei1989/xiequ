/**
 * 流程步骤编辑器 — 编辑单个 Step 的名称、负载、参数、超时、中断列表
 *
 * 迁移至 antd-mobile：Table→List+SwipeAction，Select→Picker，InputNumber→Stepper。
 */

'use client';

import { Input, Stepper, Switch, Picker, ErrorBlock, List, SwipeAction, Button, Dialog } from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Step } from '../types';

export function ProcessStepEditor({
  step,
  gpio,
  onChange,
  onRemove: _onRemove,
  onEditInterrupt,
  onAddInterrupt,
}: {
  step: Step;
  gpio: GpioInfo;
  onChange: (updated: Step) => void;
  onRemove: () => void;
  onEditInterrupt: (index: number) => void;
  onAddInterrupt: () => void;
}) {
  const loadOptions = gpio.loads.map((k) => ({ label: k, value: k }));
  const hasLoad = !!step.component;

  return (
    <List>
      {/* 步骤名称 */}
      <List.Item title="步骤名称">
        <Input
          placeholder="输入步骤名称"
          value={step.name}
          onChange={(v) => { onChange({ ...step, name: v }); }}
        />
      </List.Item>

      {/* 负载 */}
      <List.Item
        clickable={loadOptions.length > 0}
        extra={step.component || '未选择'}
        title="负载"
        onClick={() => {
          if (loadOptions.length === 0) return;
          void Picker.prompt({
            columns: [loadOptions],
            defaultValue: step.component ? [step.component] : [],
            onConfirm: (val) => {
              if (typeof val[0] === 'string') {
                onChange({ ...step, component: val[0] });
              }
            },
          });
        }}
      >
        {loadOptions.length === 0 && (
          <ErrorBlock
            description="请等待设备上报 GPIO 状态"
            status="empty"
            title="无可用负载"
          />
        )}
      </List.Item>

      {/* 启动参数 */}
      <List.Item title="启动参数">
        <Stepper
          disabled={!hasLoad}
          value={step.value.begin as number}
          onChange={(v) => { onChange({ ...step, value: { ...step.value, begin: v } }); }}
        />
      </List.Item>

      {/* 停止参数 */}
      <List.Item title="停止参数">
        <Stepper
          disabled={!hasLoad}
          value={step.value.end as number}
          onChange={(v) => { onChange({ ...step, value: { ...step.value, end: v } }); }}
        />
      </List.Item>

      {/* 超时 */}
      <List.Item title="超时限制 (ms)">
        <Stepper
          min={0}
          step={1000}
          value={step.timeout}
          onChange={(v) => { onChange({ ...step, timeout: v }); }}
        />
      </List.Item>

      {/* 禁用 */}
      <List.Item description={step.disabled ? '已禁用' : '已启用'} title="禁用">
        <Switch
          checked={!step.disabled}
          onChange={(checked) => { onChange({ ...step, disabled: !checked }); }}
        />
      </List.Item>

      {/* 中断列表 */}
      <List.Item title="中断列表" />
      {(step.interrupts || []).map((intr, idx) => (
        <SwipeAction
          key={intr.key || idx}
          rightActions={[
            {
              key: 'delete',
              text: '删除',
              color: 'danger',
              onClick: () => {
                void Dialog.confirm({ title: '确认删除此中断？' }).then((confirmed) => {
                  if (confirmed) {
                    const newInterrupts = (step.interrupts || []).filter((_, i) => i !== idx);
                    onChange({ ...step, interrupts: newInterrupts });
                  }
                });
              },
            },
          ]}
        >
          <List.Item
            clickable
            description={intr.component}
            title={intr.name}
            onClick={() => { onEditInterrupt(idx); }}
          >
            {'>'}
          </List.Item>
        </SwipeAction>
      ))}

      {/* 添加中断 */}
      <List.Item>
        <Button block color="primary" onClick={onAddInterrupt}>
          <AddOutline /> 添加中断
        </Button>
      </List.Item>
    </List>
  );
}
