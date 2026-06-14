/**
 * 电压检测配置 Popup — 设置分压电阻 R1/R2 和传感器引脚
 *
 * 使用 antd-mobile Form 替代 List 构建表单。
 * 计算公式说明区使用 Card 卡片组件。
 */

'use client';

import { Popup, NavBar, Picker, Stepper, Form, Card, Input } from 'antd-mobile';

import { useBackButton } from '@/lib/back-button';

import type { VoltageConfig } from '../types';

interface VoltageConfigPopupProps {
  open: boolean;
  voltage: VoltageConfig | undefined;
  sensors: string[];
  onChange: (config: VoltageConfig | undefined) => void;
  onClose: () => void;
}

/**
 * 默认分压电阻值
 * R1=30kΩ 上拉至被测电压，R2=10kΩ 下拉至 GND
 * 分压比 = (R1+R2)/R2 = 4，适用于测量 0~13.2V 的电池电压（ESP32 ADC 最大 3.3V）
 */
const DEFAULT_R1 = 30000;
const DEFAULT_R2 = 10000;

export function VoltageConfigPopup({
  open,
  voltage,
  sensors,
  onChange,
  onClose,
}: VoltageConfigPopupProps) {
  const config = voltage || {
    sensor: sensors[0] || 'sensor_0',
    r1: DEFAULT_R1,
    r2: DEFAULT_R2,
  };

  useBackButton(open, onClose);

  function update(partial: Partial<VoltageConfig>) {
    onChange({ ...config, ...partial });
  }

  /**
   * 关闭 Popup
   *
   * 若原本无电压配置且设备无可用传感器，则放弃本次配置（设为 undefined），
   * 避免保存一个无意义的默认配置到设备。
   */
  function handleClose() {
    if (!voltage && !sensors.length) {
      onChange(undefined);
    }
    onClose();
  }

  const sensorColumns = sensors.map((s) => ({ label: s, value: s }));

  return (
    <Popup
      bodyStyle={{ height: '60vh' }}
      position="bottom"
      visible={open}
      onClose={handleClose}
    >
      <NavBar onBack={handleClose}>电压检测配置</NavBar>

      <Form layout="vertical"
            footer={
      (<Card
        title="计算公式"
      >
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

      {/* 计算公式说明 — 使用 Card 卡片组件 */}
      <Card
        title="计算公式"
      >
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
      </Card>
    </Popup>
  );
}
