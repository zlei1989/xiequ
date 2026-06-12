/**
 * 电压检测配置抽屉 — 设置分压电阻 R1/R2 和传感器引脚
 */

'use client';

import { CloseOutlined } from '@ant-design/icons';
import { Drawer, Select, InputNumber, Button, Space } from 'antd';

import type { VoltageConfig } from '../types';

interface VoltageConfigDrawerProps {
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

export function VoltageConfigDrawer({
  open,
  voltage,
  sensors,
  onChange,
  onClose,
}: VoltageConfigDrawerProps) {
  const config = voltage || { sensor: sensors[0] || 'sensor_0', r1: DEFAULT_R1, r2: DEFAULT_R2 };

  function update(partial: Partial<VoltageConfig>) {
    onChange({ ...config, ...partial });
  }

  /**
   * 关闭抽屉
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

  return (
    <Drawer
      title="电压检测配置"
      placement="bottom"
      size="60%"
      open={open}
      onClose={handleClose}
      destroyOnHidden
      extra={
        <Button
          icon={<CloseOutlined />}
          onClick={handleClose}
          size="small"
        >
          关闭
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 传感器选择 */}
        <div>
          <label
            className="mb-1 block text-[13px] text-gray-500"
          >
            电压检测传感器
          </label>
          <Select
            value={config.sensor}
            onChange={(v) => { update({ sensor: v }); }}
            options={sensors.map((s) => ({ value: s, label: s }))}
            placeholder="选择传感器引脚"
            className="w-full"
          />
          <div className="mt-1 text-[11px] text-gray-400">
            选择用于电压检测的 ADC 传感器引脚
          </div>
        </div>

        {/* R1 电阻值 */}
        <div>
          <label
            className="mb-1 block text-[13px] text-gray-500"
          >
            R1 电阻值（Ω）
          </label>
          <Space.Compact className="w-full">
            <InputNumber
              value={config.r1}
              onChange={(v) => { update({ r1: v ?? DEFAULT_R1 }); }}
              min={0}
              step={1000}
              className="flex-1"
              placeholder="默认 30000"
            />
            <Button disabled>Ω</Button>
          </Space.Compact>
          <div className="mt-1 text-[11px] text-gray-400">
            分压电阻 R1，上拉至被测电压。默认 30kΩ
          </div>
        </div>

        {/* R2 电阻值 */}
        <div>
          <label
            className="mb-1 block text-[13px] text-gray-500"
          >
            R2 电阻值（Ω）
          </label>
          <Space.Compact className="w-full">
            <InputNumber
              value={config.r2}
              onChange={(v) => { update({ r2: v ?? DEFAULT_R2 }); }}
              min={0}
              step={1000}
              className="flex-1"
              placeholder="默认 10000"
            />
            <Button disabled>Ω</Button>
          </Space.Compact>
          <div className="mt-1 text-[11px] text-gray-400">
            分压电阻 R2，下拉至 GND。默认 10kΩ
          </div>
        </div>

        {/* 电压计算公式说明 */}
        <div
          className="rounded-md border border-solid border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500"
        >
          <div className="mb-1 font-semibold">计算公式</div>
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
      </div>
    </Drawer>
  );
}
