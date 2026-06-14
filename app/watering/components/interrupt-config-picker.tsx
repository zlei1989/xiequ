/**
 * 中断条件配置 Picker — 编辑单个 InterruptConfig 的传感器、信号类型、阈值等参数
 *
 * 使用 antd-mobile Form 替代 List 构建移动端友好界面。
 * 数字信号 vs 模拟信号通过 signalType 字段区分，动态显示不同表单项。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Button, Popup, NavBar, Input, Stepper, Switch, Selector, Form, Dialog } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { DeleteOutline } from 'antd-mobile-icons';
import React, { useState, useEffect } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import type { InterruptConfig } from '../types';

interface InterruptConfigPickerProps {
  open: boolean;
  interrupt: InterruptConfig;
  gpio: GpioInfo;
  onConfirm: (result: InterruptConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  /** Popup 关闭动画完成后的清理回调（.prompt() 使用） */
  afterClose?: () => void;
}

interface InterruptConfigPromptProps {
  interrupt: InterruptConfig;
  gpio: GpioInfo;
  onConfirm?: (result: InterruptConfig) => void;
  onDelete?: () => void;
}

/** 中断配置默认值 — 当 interrupt 数据不完整时提供兜底 */
const DEFAULT_INTERRUPT: InterruptConfig = {
  name: '',
  component: 'sensor_0',
  state: 0,
  signalType: 'digital',
  logic: '>',
  threshold: 0,
  intercept: 100,
  delay: 0,
  duration: 0,
};

export function InterruptConfigPicker({
  open,
  interrupt,
  gpio,
  onConfirm,
  onClose,
  onDelete,
  afterClose,
}: InterruptConfigPickerProps) {
  // 合并默认值，防止 interrupt 数据不完整
  // 从 props 派生配置，父组件通过 onConfirm 实时同步变更后重新渲染
  const config = { ...DEFAULT_INTERRUPT, ...interrupt };

  useBackButton(open, onClose);

  /** 局部更新 — 合并当前配置后通知父组件（即时编辑模式） */
  function update(partial: Partial<InterruptConfig>) {
    onConfirm({ ...config, ...partial });
  }

  const signalType = config.signalType ?? 'digital';
  const sensorOptions = gpio.sensors.map((k) => ({ label: k, value: k }));

  /** 确认删除 — 通过 Dialog.confirm 弹出确认框 */
  function confirmDelete() {
    void Dialog.confirm({ title: '确认删除此中断？' }).then((confirmed) => {
      if (confirmed) onDelete?.();
    });
  }

  return (
    <Popup
      afterClose={afterClose}
      bodyStyle={{ height: '70vh' }}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar
        right={onDelete ? (
          <Button size="small"  onClick={confirmDelete}>
            <DeleteOutline />
          </Button>
        ) : null}
        onBack={onClose}
      >
        编辑中断
      </NavBar>

      <div style={{ overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
        <Form layout="vertical">
          {/* 中断名称 */}
          <Form.Item label="中断名称">
            <Input
              placeholder="输入中断名称"
              value={config.name}
              onChange={(v) => { update({ name: v }); }}
            />
          </Form.Item>

          {/* 传感器选择 */}
          <Form.Item label="传感器">
            {sensorOptions.length > 0 ? (
              <Selector
                options={sensorOptions}
                value={[config.component]}
                onChange={(vals) => {
                  if (vals.length > 0) {
                    update({ component: vals[0] });
                  }
                }}
              />
            ) : (
              <div style={{ color: '#999', fontSize: 14, padding: '8px 0' }}>
                请等待设备上报 GPIO 状态
              </div>
            )}
          </Form.Item>

          {/* 信号类型 */}
          <Form.Item label="信号类型">
            <Selector
              options={[
                { label: '数字信号', value: 'digital' },
                { label: '模拟信号', value: 'analog' },
              ]}
              value={[signalType]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  update({ signalType: vals[0] });
                }
              }}
            />
          </Form.Item>

          {/* 数字信号：触发状态 */}
          {signalType === 'digital' && (
            <Form.Item
              help={config.state === 1 || config.state === true ? '触发 (1)' : '未触发 (0)'}
              label="触发状态"
            >
              <Switch
                checked={config.state === 1 || config.state === true}
                onChange={(checked) => {
                  update({ state: checked ? 1 : 0 });
                }}
              />
            </Form.Item>
          )}

          {/* 模拟信号：逻辑 + 触发阈值 */}
          {signalType === 'analog' && (
            <>
              <Form.Item label="比较逻辑">
                <Selector
                  options={[
                    { label: '大于', value: '>' },
                    { label: '小于', value: '<' },
                  ]}
                  value={[config.logic ?? '>']}
                  onChange={(vals) => {
                    if (vals.length > 0) {
                      update({ logic: vals[0] });
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                help={`当传感器值${config.logic === '>' ? '大于' : '小于'}阈值时触发中断`}
                label="触发阈值"
              >
                <Stepper
                  min={0}
                  step={1}
                  value={config.threshold ?? 0}
                  onChange={(v) => { update({ threshold: v }); }}
                />
              </Form.Item>
            </>
          )}

          {/* 屏蔽抖动间隔 */}
          <Form.Item label="屏蔽抖动间隔 (ms)">
            <Stepper
              min={0}
              step={100}
              value={config.intercept}
              onChange={(v) => { update({ intercept: v }); }}
            />
          </Form.Item>

          {/* 延迟检测 */}
          <Form.Item label="延迟检测 (ms)">
            <Stepper
              min={0}
              step={1000}
              value={config.delay}
              onChange={(v) => { update({ delay: v }); }}
            />
          </Form.Item>

          {/* 持续时间 */}
          <Form.Item label="持续时间 (ms)">
            <Stepper
              min={0}
              step={1000}
              value={config.duration}
              onChange={(v) => { update({ duration: v }); }}
            />
          </Form.Item>

          {/* 禁用 */}
          <Form.Item
            label="禁用"
          >
            <Switch
              checked={!config.disabled}
              onChange={(checked) => { update({ disabled: !checked }); }}
            />
          </Form.Item>
        </Form>
      </div>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出中断配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 返回 Promise，确认时 resolve InterruptConfig，取消时 resolve null。
 */
InterruptConfigPicker.prompt = (
  props: InterruptConfigPromptProps,
): Promise<InterruptConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderToBody 初始化模式
      useEffect(() => { setVisible(true); }, []);
      return React.createElement(InterruptConfigPicker, {
        open: visible,
        interrupt: props.interrupt,
        gpio: props.gpio,
        onConfirm: (result) => {
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
