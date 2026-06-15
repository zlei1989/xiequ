/**
 * 传感器配置 Picker — 管理多个传感器配置项的列表（拖拽排序）和单项编辑
 *
 * 两层 Popup 结构：
 * - 列表层（70vh）：SortableList + SwipeAction 删除 + 拖拽排序 + 添加按钮
 * - 编辑层（60vh）：Form 表单，根据 signalType 和 conversion 动态显示字段
 * 使用 antd-mobile Form/Popup/NavBar/Selector/Stepper/Input/SwipeAction + @dnd-kit
 */

'use client';

import { arrayMove } from '@dnd-kit/sortable';
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
  List,
  SwipeAction,
  Dialog,
} from 'antd-mobile';
import { AddOutline } from 'antd-mobile-icons';
import { useState } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import { SortableList } from './sortable-list';

import type { SensorConfig } from '../types';

interface SensorConfigPickerProps {
  open: boolean;
  sensors: SensorConfig[];
  gpio: GpioInfo;
  onChange: (configs: SensorConfig[]) => void;
  onClose: () => void;
  /** Popup 关闭动画完成后的清理回调 */
  afterClose?: () => void;
}

/** 默认传感器配置 */
function defaultSensor(gpio: GpioInfo): SensorConfig {
  return {
    name: '',
    sensor: gpio.sensors[0] ?? 'sensor_0',
    type: 'analog',
  };
}

/** 类型中文标签映射 */
const typeLabels: Record<string, string> = {
  digital: '数字',
  analog: '模拟',
};

/** 转换类型中文标签映射 */
const conversionLabels: Record<string, string> = {
  resistor_divider: '分压',
  ntc_10k: '温感',
};

/** 生成列表项摘要 */
function sensorSummary(s: SensorConfig): string {
  const parts = [s.sensor, typeLabels[s.type] ?? s.type];
  if (s.conversion) {
    const convLabel = conversionLabels[s.conversion];
    if (convLabel) parts.push(convLabel);
  }
  return parts.join(' · ');
}

export function SensorConfigPicker({
  open,
  sensors,
  gpio,
  onChange,
  onClose,
  afterClose,
}: SensorConfigPickerProps) {
  const [editVisible, setEditVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [editConfig, setEditConfig] = useState<SensorConfig>(defaultSensor(gpio));

  useBackButton(open && !editVisible, onClose);

  /** 打开编辑层 — 新增（-1）或编辑已有项 */
  function openEdit(index: number) {
    setEditIndex(index);
    setEditConfig(index >= 0 ? { ...sensors[index]! } : defaultSensor(gpio));
    setEditVisible(true);
  }

  /** 确认编辑 — 保存到列表并关闭编辑层 */
  function confirmEdit() {
    const updated = [...sensors];
    if (editIndex >= 0) {
      updated[editIndex] = editConfig;
    } else {
      updated.push(editConfig);
    }
    onChange(updated);
    setEditVisible(false);
    setEditIndex(-1);
  }

  /** 删除传感器 */
  function deleteSensor(index: number) {
    const updated = sensors.filter((_, i) => i !== index);
    onChange(updated);
  }

  /** 编辑层局部更新 */
  function updateEdit(partial: Partial<SensorConfig>) {
    setEditConfig({ ...editConfig, ...partial });
  }

  const sensorOptions = gpio.sensors.map((k) => ({ label: k, value: k }));

  return (
    <>
      {/* ========== 列表层 Popup ========== */}
      <Popup
        afterClose={afterClose}
        bodyStyle={{ height: '70vh' }}
        closeOnMaskClick={true}
        position="bottom"
        visible={open}
        onClose={onClose}
        onMaskClick={onClose}
      >
        <NavBar onBack={onClose}>传感器配置</NavBar>
        <div style={{ overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
          <SortableList
            emptyText="暂无传感器"
            getKey={(s, i) => (s as SensorConfig).sensor + String(i)}
            header="已配置传感器"
            items={sensors}
            renderItem={(sensor, index) => (
              <SwipeAction
                rightActions={[
                  {
                    key: 'delete',
                    text: '删除',
                    color: 'danger',
                    onClick: () => {
                      void Dialog.confirm({ title: '确认删除此传感器？' }).then((confirmed) => {
                        if (confirmed) deleteSensor(index);
                      });
                    },
                  },
                ]}
              >
                <List.Item
                  clickable
                  description={sensorSummary(sensor)}
                  onClick={() => { openEdit(index); }}
                >
                  {sensor.name || '未命名'}
                </List.Item>
              </SwipeAction>
            )}
            onReorder={(from, to) => {
              onChange(arrayMove(sensors, from, to));
            }}
          />
          <div className="p-2">
            <Button block size="small" onClick={() => { openEdit(-1); }}>
              <AddOutline /> 添加传感器
            </Button>
          </div>
        </div>
      </Popup>

      {/* ========== 编辑层 Popup ========== */}
      <Popup
        bodyStyle={{ height: '60vh' }}
        closeOnMaskClick={false}
        position="bottom"
        visible={editVisible}
        onClose={() => { setEditVisible(false); }}
      >
        <NavBar onBack={() => { setEditVisible(false); }}>
          {editIndex >= 0 ? '编辑传感器' : '添加传感器'}
        </NavBar>
        <div style={{ overflowY: 'auto', height: 'calc(60vh - 45px)' }}>
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
                    if (vals.length > 0) updateEdit({ sensor: vals[0]! });
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
                        const conversion = (vals[0] || undefined) as SensorConfig['conversion'];
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
                        分压比: {(editConfig.r1 ?? 30000) > 0 && (editConfig.r2 ?? 10000) > 0
                          ? (((editConfig.r1 ?? 30000) + (editConfig.r2 ?? 10000)) / (editConfig.r2 ?? 10000)).toFixed(2)
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
                        if (vals.length > 0) updateEdit({ bValue: vals[0] as 3435 | 3950 });
                      }}
                    />
                  </Form.Item>
                )}
              </>
            )}
          </Form>

          {/* 确认按钮 */}
          <div className="p-4">
            <Button block color="primary" onClick={confirmEdit}>
              确认
            </Button>
          </div>
        </div>
      </Popup>
    </>
  );
}
