/**
 * 中断条件编辑器 — 编辑单个 Interrupt 的传感器、信号类型、阈值等参数
 *
 * 使用 antd-mobile List + 表单控件构建移动端友好界面。
 * 数字信号 vs 模拟信号通过 signalType 字段区分，动态显示不同表单行。
 */

'use client';

import { Input, Stepper, Switch, Selector, ErrorBlock, List } from 'antd-mobile';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Interrupt } from '../types';

export function ProcessInterruptEditor({
  interrupt,
  gpio,
  onChange,
  onRemove: _onRemove,
}: {
  interrupt: Interrupt;
  gpio: GpioInfo;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
  const sensorOptions = gpio.sensors.map((k) => ({
    label: k,
    value: k,
  }));

  const signalType = interrupt.signalType ?? 'digital';
  const logic = interrupt.logic ?? '>';
  const threshold = interrupt.threshold ?? 0;

  return (
    <List>
      {/* 中断名称 */}
      <List.Item title="中断名称">
        <Input
          placeholder="输入中断名称"
          value={interrupt.name}
          onChange={(v) => { onChange({ ...interrupt, name: v }); }}
        />
      </List.Item>

      {/* 传感器 */}
      <List.Item title="传感器">
        {sensorOptions.length > 0 ? (
          <Selector
            options={sensorOptions}
            value={[interrupt.component]}
            onChange={(vals) => {
              if (vals.length > 0) {
                onChange({ ...interrupt, component: vals[0]! });
              }
            }}
          />
        ) : (
          <ErrorBlock
            status="empty"
            title="无可用传感器"
            description="请等待设备上报 GPIO 状态"
          />
        )}
      </List.Item>

      {/* 信号类型 */}
      <List.Item title="信号类型">
        <Selector
          options={[
            { label: '数字信号', value: 'digital' },
            { label: '模拟信号', value: 'analog' },
          ]}
          value={[signalType]}
          onChange={(vals) => {
            if (vals.length > 0) {
              onChange({
                ...interrupt,
                signalType: vals[0] as Interrupt['signalType'],
              });
            }
          }}
        />
      </List.Item>

      {/* 数字信号：触发状态 */}
      {signalType === 'digital' && (
        <List.Item
          title="触发状态"
          description={interrupt.state === 1 || interrupt.state === true ? '触发 (1)' : '未触发 (0)'}
        >
          <Switch
            checked={interrupt.state === 1 || interrupt.state === true}
            onChange={(checked) => {
              onChange({ ...interrupt, state: checked ? 1 : 0 });
            }}
          />
        </List.Item>
      )}

      {/* 模拟信号：逻辑 + 触发阈值 */}
      {signalType === 'analog' && (
        <>
          <List.Item title="逻辑">
            <Selector
              options={[
                { label: '大于', value: '>' },
                { label: '小于', value: '<' },
              ]}
              value={[logic]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  onChange({
                    ...interrupt,
                    logic: vals[0] as Interrupt['logic'],
                  });
                }
              }}
            />
          </List.Item>

          <List.Item
            title="触发阈值"
            description={`当传感器值${logic === '>' ? '大于' : '小于'}阈值时触发中断`}
          >
            <Stepper
              min={0}
              step={1}
              value={threshold}
              onChange={(v) => {
                onChange({ ...interrupt, threshold: v });
              }}
            />
          </List.Item>
        </>
      )}

      {/* 屏蔽抖动间隔 */}
      <List.Item title="屏蔽抖动间隔 (ms)">
        <Stepper
          min={0}
          step={100}
          value={interrupt.intercept}
          onChange={(v) => { onChange({ ...interrupt, intercept: v }); }}
        />
      </List.Item>

      {/* 延迟检测 */}
      <List.Item title="延迟检测 (ms)">
        <Stepper
          min={0}
          step={1000}
          value={interrupt.delay}
          onChange={(v) => { onChange({ ...interrupt, delay: v }); }}
        />
      </List.Item>

      {/* 持续时间 */}
      <List.Item title="持续时间 (ms)">
        <Stepper
          min={0}
          step={1000}
          value={interrupt.duration}
          onChange={(v) => { onChange({ ...interrupt, duration: v }); }}
        />
      </List.Item>

      {/* 禁用 */}
      <List.Item
        title="禁用"
        description={interrupt.disabled ? '已禁用' : '已启用'}
      >
        <Switch
          checked={!interrupt.disabled}
          onChange={(checked) => {
            onChange({ ...interrupt, disabled: !checked });
          }}
        />
      </List.Item>
    </List>
  );
}
