/**
 * 传感器配置编辑 Popup — 单个传感器的编辑表单
 *
 * 仅包含编辑层 Popup（60vh），列表层已移至 DeviceConfigForm。
 * 导出 defaultSensor 供 DeviceConfigForm 添加传感器时使用。
 * 注意：通过条件挂载来保证每次打开时 editConfig 同步外部 sensor，
 * 而非使用 useEffect + setState（触发 react-hooks/set-state-in-effect）。
 */

'use client';

import {
  Popup,
  NavBar,
  Selector,
  Stepper,
  Form,
  Card,
  ErrorBlock,
  Button,
  Input,
} from 'antd-mobile';
import { useState } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import type { SensorConfig } from '../types';

interface SensorConfigPickerProps {
  /** 编辑层显隐 */
  open: boolean;
  /** 当前编辑的传感器 */
  sensor: SensorConfig;
  /** GPIO 信息（提供传感器引脚选项） */
  gpio: GpioInfo;
  /** 确认回调，传回修改后的传感器配置 */
  onConfirm: (s: SensorConfig) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 编辑标识符，用于 SensorFormBody 的 key，切换编辑目标时强制重挂载 */
  editKey?: string | number;
}

/** 默认传感器配置 */
export function defaultSensor(gpio: GpioInfo): SensorConfig {
  return {
    name: '',
    sensor: gpio.sensors[0] ?? 'sensor_0',
    type: 'analog',
  };
}

/**
 * 内部表单主体 — 条件挂载，每次 mount 时 useState 初始化即为最新的 sensor
 */
function SensorFormBody({
  sensor,
  gpio,
  onConfirm,
}: {
  sensor: SensorConfig;
  gpio: GpioInfo;
  onConfirm: (s: SensorConfig) => void;
}) {
  const [editConfig, setEditConfig] = useState<SensorConfig>({ ...sensor });

  /** 局部更新编辑中的传感器 */
  function updateEdit(partial: Partial<SensorConfig>) {
    setEditConfig((prev) => ({ ...prev, ...partial }));
  }

  const sensorOptions = gpio.sensors.map((k) => ({ label: k, value: k }));

  return (
    <>
      <Form layout="vertical">
        {/* 感应名称 */}
        <Form.Item label="感应名称">
          <Input
            placeholder="如：电池电压"
            value={editConfig.name}
            onChange={(v) => { updateEdit({ name: v }); }}
          />
        </Form.Item>

        {/* 传感器引脚 */}
        <Form.Item label="传感器引脚">
          {sensorOptions.length > 0 ? (
            <Selector
              options={sensorOptions}
              value={[editConfig.sensor]}
              onChange={(vals) => {
                const val = vals[0];
                if (val) updateEdit({ sensor: val });
              }}
            />
          ) : (
            <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用传感器" />
          )}
        </Form.Item>

        {/* 信号类型 */}
        <Form.Item label="信号类型">
          <Selector
            options={[
              { label: '数字信号', value: 'digital' },
              { label: '模拟信号', value: 'analog' },
            ]}
            value={[editConfig.type]}
            onChange={(vals) => {
              if (vals.length > 0) {
                const type = vals[0] as SensorConfig['type'];
                const partial: Partial<SensorConfig> = { type };
                if (type === 'digital') {
                  partial.conversion = undefined;
                  partial.r1 = undefined;
                  partial.r2 = undefined;
                  partial.bValue = undefined;
                }
                updateEdit(partial);
              }
            }}
          />
        </Form.Item>

        {/* 转换类型（仅模拟信号） */}
        {editConfig.type === 'analog' && (
          <>
            <Form.Item label="转换">
              <Selector
                options={[
                  { label: '无', value: '' },
                  { label: '电阻分压器', value: 'resistor_divider' },
                  { label: '温感电阻10K', value: 'ntc_10k' },
                ]}
                value={[editConfig.conversion ?? '']}
                onChange={(vals) => {
                  if (vals.length > 0) {
                    const conversion = (vals[0] || undefined);
                    updateEdit({ conversion });
                  }
                }}
              />
            </Form.Item>

            {/* 公式 help — 电阻分压器 */}
            {editConfig.conversion === 'resistor_divider' && (
              <Card title="计算公式">
                <div className="text-xs text-gray-500">
                  <div>
                    V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
                  </div>
                  <div className="mt-1">
                    V<sub>传感器</sub> = ADC / 4095 × 3.3V
                  </div>
                  <div className="mt-1">
                    分压比:{' '}
                    {(editConfig.r1 ?? 30000) > 0 && (editConfig.r2 ?? 10000) > 0
                      ? (
                        ((editConfig.r1 ?? 30000) + (editConfig.r2 ?? 10000))
                        / (editConfig.r2 ?? 10000)
                      ).toFixed(2)
                      : '—'}
                  </div>
                </div>
              </Card>
            )}

            {/* 公式 help — NTC */}
            {editConfig.conversion === 'ntc_10k' && (
              <Card title="计算公式">
                <div className="text-xs text-gray-500">
                  <div>
                    R<sub>NTC</sub> = 10KΩ × V<sub>ADC</sub> / (3.3V - V<sub>ADC</sub>)
                  </div>
                  <div className="mt-1">
                    T(K) = 1 / (1/298.15 + ln(R<sub>NTC</sub>/10000)/B)
                  </div>
                  <div className="mt-1">
                    T(°C) = T(K) - 273.15
                  </div>
                </div>
              </Card>
            )}

            {/* R1 / R2（仅电阻分压器） */}
            {editConfig.conversion === 'resistor_divider' && (
              <>
                <Form.Item help="上拉电阻 R1，上拉至被测电压。默认 30kΩ" label="R1 电阻值 (Ω)">
                  <Stepper
                    min={0}
                    step={1000}
                    value={editConfig.r1 ?? 30000}
                    onChange={(v) => { updateEdit({ r1: v }); }}
                  />
                </Form.Item>

                <Form.Item help="下拉电阻 R2，下拉至 GND。默认 10kΩ" label="R2 电阻值 (Ω)">
                  <Stepper
                    min={0}
                    step={1000}
                    value={editConfig.r2 ?? 10000}
                    onChange={(v) => { updateEdit({ r2: v }); }}
                  />
                </Form.Item>
              </>
            )}

            {/* B 值（仅温感电阻） */}
            {editConfig.conversion === 'ntc_10k' && (
              <Form.Item
                help="NTC 热敏电阻 B 值常数。常用值 3435/3950"
                label="B 值"
              >
                <Selector
                  options={[
                    { label: '3435', value: 3435 },
                    { label: '3950', value: 3950 },
                  ]}
                  value={[editConfig.bValue ?? 3435]}
                  onChange={(vals) => {
                    if (vals.length > 0) updateEdit({ bValue: vals[0] });
                  }}
                />
              </Form.Item>
            )}
          </>
        )}
      </Form>

      {/* 确认按钮 */}
      <div className="p-4">
        <Button block color="primary" onClick={() => { onConfirm(editConfig); }}>
          确认
        </Button>
      </div>
    </>
  );
}

export function SensorConfigPicker({
  open,
  sensor,
  gpio,
  onConfirm,
  onClose,
  editKey,
}: SensorConfigPickerProps) {
  useBackButton(open, onClose);

  return (
    <Popup
      bodyStyle={{ height: '60vh' }}
      closeOnMaskClick={false}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar onBack={onClose}>
        {sensor.name ? '编辑传感器' : '添加传感器'}
      </NavBar>
      <div style={{ overflowY: 'auto', height: 'calc(60vh - 45px)' }}>
        {open && (
          <SensorFormBody
            gpio={gpio}
            key={editKey}
            sensor={sensor}
            onConfirm={onConfirm}
          />
        )}
      </div>
    </Popup>
  );
}
