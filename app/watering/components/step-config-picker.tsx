/**
 * 流程步骤配置 Picker — 编辑单个 StepConfig 的名称、负载、参数、超时、中断列表
 *
 * 使用 antd-mobile Form 替代 List 构建移动端界面。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Input, Stepper, Switch, Picker, Button, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { AddOutline, DeleteOutline } from 'antd-mobile-icons';
import React, { useState, useEffect } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import type { StepConfig } from '../types';

interface StepConfigPickerProps {
  open: boolean;
  step: StepConfig;
  gpio: GpioInfo;
  onConfirm: (result: StepConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  onAddInterrupt?: () => void;
  onEditInterrupt?: (index: number) => void;
  afterClose?: () => void;
}

interface StepConfigPromptProps {
  step: StepConfig;
  gpio: GpioInfo;
  onConfirm?: (result: StepConfig) => void;
  onDelete?: () => void;
}

export function StepConfigPicker({
  open,
  step,
  gpio,
  onConfirm,
  onClose,
  onDelete,
  onAddInterrupt,
  onEditInterrupt,
  afterClose,
}: StepConfigPickerProps) {
  useBackButton(open, onClose);

  function update(partial: Partial<StepConfig>) {
    onConfirm({ ...step, ...partial });
  }

  const loadOptions = gpio.loads.map((k) => ({ label: k, value: k }));
  const hasLoad = !!step.component;

  function confirmDelete() {
    void Dialog.confirm({
      title: '确认删除此步骤？',
      onConfirm: () => { onDelete?.(); },
    });
  }

  return (
    <Popup
      afterClose={afterClose}
      bodyStyle={{ height: '75vh' }}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar
        right={onDelete ? (
          <Button size="small" onClick={confirmDelete}>
            <DeleteOutline />
          </Button>
        ) : null}
        onBack={onClose}
      >
        编辑步骤
      </NavBar>

      <div style={{ overflowY: 'auto', height: 'calc(75vh - 45px)' }}>
        <Form layout="vertical">
          {/* 步骤名称 */}
          <Form.Item label="步骤名称">
            <Input
              placeholder="输入步骤名称"
              value={step.name}
              onChange={(v) => { update({ name: v }); }}
            />
          </Form.Item>

          {/* 负载选择 */}
          <Form.Item
            help={hasLoad ? undefined : '请等待设备上报 GPIO 状态'}
            label="负载"
            onClick={() => {
              if (loadOptions.length === 0) return;
              void Picker.prompt({
                columns: [loadOptions],
                defaultValue: step.component ? [step.component] : [],
                onConfirm: (val) => {
                  if (typeof val[0] === 'string') {
                    update({ component: val[0] });
                  }
                },
              });
            }}
          >
            <Input
              readOnly
              placeholder={loadOptions.length === 0 ? '无可用负载' : '未选择'}
              value={step.component || ''}
            />
          </Form.Item>

          {/* 启动参数 */}
          <Form.Item label="启动参数">
            <Stepper
              disabled={!hasLoad}
              value={step.value.begin as number}
              onChange={(v) => { update({ value: { ...step.value, begin: v } }); }}
            />
          </Form.Item>

          {/* 停止参数 */}
          <Form.Item label="停止参数">
            <Stepper
              disabled={!hasLoad}
              value={step.value.end as number}
              onChange={(v) => { update({ value: { ...step.value, end: v } }); }}
            />
          </Form.Item>

          {/* 超时 */}
          <Form.Item label="超时限制 (ms)">
            <Stepper
              min={0}
              step={1000}
              value={step.timeout}
              onChange={(v) => { update({ timeout: v }); }}
            />
          </Form.Item>

          {/* 禁用 */}
          <Form.Item label="禁用">
            <Switch
              checked={!step.disabled}
              onChange={(checked) => { update({ disabled: !checked }); }}
            />
          </Form.Item>

          {/* 中断列表 */}
          <Form.Header>中断列表</Form.Header>
          {(step.interrupts || []).map((intr, idx) => (
            <SwipeAction
              key={idx}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    void Dialog.confirm({
                      title: '确认删除此中断？', onConfirm: () => {
                        const newInterrupts = (step.interrupts || []).filter((_, i) => i !== idx);
                        update({ interrupts: newInterrupts });
                      },
                    });
                  },
                },
              ]}
            >
              <Form.Item
                description={intr.component}
                label={intr.name}
                onClick={() => { onEditInterrupt?.(idx); }}
              >
                <div />
              </Form.Item>
            </SwipeAction>
          ))}

          {/* 添加中断 */}
          <Form.Item>
            <Button block color="primary" onClick={onAddInterrupt}>
              <AddOutline /> 添加中断
            </Button>
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

/** 命令式调用 */
StepConfigPicker.prompt = (props: StepConfigPromptProps): Promise<StepConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderToBody 初始化模式
      useEffect(() => { setVisible(true); }, []);
      return React.createElement(StepConfigPicker, {
        open: visible,
        step: props.step,
        gpio: props.gpio,
        onConfirm: (result: StepConfig) => {
          props.onConfirm?.(result);
          resolve(result);
        },
        onClose: () => {
          setVisible(false);
          resolve(null);
        },
        onDelete: props.onDelete,
        afterClose: () => { unmount(); },
      });
    };
    const unmount = renderToBody(React.createElement(Wrapper));
  });
};
