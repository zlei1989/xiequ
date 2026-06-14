/**
 * 电压检测配置 Picker — 设置分压电阻 R1/R2 和传感器引脚
 *
 * 使用 antd-mobile Form 替代 List 构建表单。
 * 计算公式说明区使用 Card 卡片组件。
 * 支持声明式组件和命令式 VoltageConfigPicker.prompt() 两种调用方式。
 */

'use client';

import { Popup, NavBar, Picker, Stepper, Form, Card, Input } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import React, { useState, useEffect } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import type { VoltageConfig } from '../types';

interface VoltageConfigPickerProps {
  open: boolean;
  voltage: VoltageConfig | undefined;
  gpio: GpioInfo;
  onChange?: (config: VoltageConfig | undefined) => void;
  onClose: () => void;
  /** 命令式调用时触发 — resolve 时传入最终配置 */
  onConfirm?: (result: VoltageConfig) => void;
  /** Popup 关闭动画完成后的清理回调 */
  afterClose?: () => void;
}

/** VoltageConfigPicker.prompt() 静态方法的参数 */
interface VoltageConfigPromptProps {
  voltage: VoltageConfig;
  gpio: GpioInfo;
  onConfirm?: (result: VoltageConfig) => void;
}

/**
 * 默认分压电阻值
 * R1=30kΩ 上拉至被测电压，R2=10kΩ 下拉至 GND
 * 分压比 = (R1+R2)/R2 = 4，适用于测量 0~13.2V 的电池电压（ESP32 ADC 最大 3.3V）
 */
const DEFAULT_R1 = 30000;
const DEFAULT_R2 = 10000;

export function VoltageConfigPicker({
  open,
  voltage,
  gpio,
  onChange,
  onClose,
  onConfirm,
  afterClose,
}: VoltageConfigPickerProps) {
  const config = voltage || {
    sensor: gpio.sensors[0] || 'sensor_0',
    r1: DEFAULT_R1,
    r2: DEFAULT_R2,
  };

  useBackButton(open, onClose);

  /** 局部更新配置 — 通过 onChange 回调通知父组件，同时通知 onConfirm（如存在） */
  function update(partial: Partial<VoltageConfig>) {
    const merged = { ...config, ...partial };
    onChange?.(merged);
    onConfirm?.(merged);
  }

  /** 关闭 Picker — 父组件负责处理关闭逻辑 */
  function handleClose() {
    onClose();
  }

  const sensorColumns = gpio.sensors.map((s) => ({ label: s, value: s }));

  return (
    <Popup
      afterClose={afterClose}
      bodyStyle={{ height: '60vh' }}
      position="bottom"
      visible={open}
      onClose={handleClose}
    >
      <NavBar onBack={handleClose}>电压检测配置</NavBar>
      <Form footer={
        (
          <Card
            title="计算公式"
          >
            {/* 计算公式说明 — 使用 Card 卡片组件 */}
            <div className="text-xs text-gray-500">
              <div>
                V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
              </div>
              <div className="mt-1">
                当前分压比:{' '}
                {config.r1 > 0 && config.r2 > 0
                  ? ((config.r1 + config.r2) / config.r2).toFixed(2)
                  : '—'}
              </div>
            </div>
          </Card>)
      }
        layout="vertical"
      >
        {/* 传感器选择 — 点击 Form.Item 触发 Picker.prompt 弹窗 */}
        <Form.Item
          help="选择用于电压检测的 ADC 传感器引脚"
          label="电压检测传感器"
          onClick={() => {
            void Picker.prompt({
              columns: [sensorColumns],
              defaultValue: [config.sensor],
              onConfirm: (val) => {
                if (val.length > 0 && typeof val[0] === 'string') {
                  update({ sensor: val[0] });
                }
              },
            });
          }}
        >
          <Input
            readOnly
            placeholder="未选择传感器"
            value={config.sensor}
          />
        </Form.Item>

        {/* R1 电阻值 */}
        <Form.Item
          help="分压电阻 R1，上拉至被测电压。默认 30kΩ"
          label="R1 电阻值 (Ω)"
        >
          <Stepper
            min={0}
            step={1000}
            value={config.r1}
            onChange={(v) => { update({ r1: v }); }}
          />
        </Form.Item>

        {/* R2 电阻值 */}
        <Form.Item
          help="分压电阻 R2，下拉至 GND。默认 10kΩ"
          label="R2 电阻值 (Ω)"
        >
          <Stepper
            min={0}
            step={1000}
            value={config.r2}
            onChange={(v) => { update({ r2: v }); }}
          />
        </Form.Item>
      </Form>
    </Popup>
  );
}

/**
 * 命令式调用 — 弹出电压配置 Popup
 *
 * 使用 antd-mobile 的 renderToBody 工具将组件挂载到 body，
 * 遵循 Picker.prompt() 相同的实现模式。
 * 返回 Promise，确认时 resolve VoltageConfig，取消时 resolve null。
 */
VoltageConfigPicker.prompt = (props: VoltageConfigPromptProps): Promise<VoltageConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderToBody 初始化模式
      useEffect(() => { setVisible(true); }, []);
      return (
        React.createElement(VoltageConfigPicker, {
          open: visible,
          voltage: props.voltage,
          gpio: props.gpio,
          onConfirm: (result: VoltageConfig) => {
            props.onConfirm?.(result);
            resolve(result);
          },
          onClose: () => {
            setVisible(false);
            resolve(null);
          },
          afterClose: () => { unmount(); },
        })
      );
    };
    const unmount = renderToBody(React.createElement(Wrapper));
  });
};
