/**
 * 中断条件编辑器 — 编辑单个 Interrupt 的传感器、信号类型、阈值等参数
 *
 * 数字信号 vs 模拟信号：
 * - 数字信号（digital）：只有 0/1 两种状态，通过 Switch 开关配置触发状态
 * - 模拟信号（analog）：连续值，通过逻辑比较（>/<）和阈值判断是否触发
 *   两种类型共享同一 Interrupt 数据结构，通过 signalType 字段区分
 */

'use client';

import { Input, InputNumber, Switch, Select, Empty, Radio } from 'antd';

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
    value: k,
    label: k,
  }));

  const signalType = interrupt.signalType ?? 'digital';
  const logic = interrupt.logic ?? '>';
  const threshold = interrupt.threshold ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          中断名称
        </label>
        <Input
          value={interrupt.name}
          onChange={(e) => { onChange({ ...interrupt, name: e.target.value }); }}
          placeholder="输入中断名称"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          传感器
        </label>
        {sensorOptions.length > 0 ? (
          <Select
            value={interrupt.component}
            onChange={(v) => { onChange({ ...interrupt, component: v }); }}
            options={sensorOptions}
            className="w-full"
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用传感器（sensors），请等待设备上报 GPIO 状态"
            className="my-2"
          />
        )}
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          信号类型
        </label>
        <Radio.Group
          value={signalType}
          onChange={(e) =>
          { onChange({
            ...interrupt,
            signalType: e.target.value as Interrupt['signalType'],
          }); }
          }
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="digital">数字信号</Radio.Button>
          <Radio.Button value="analog">模拟信号</Radio.Button>
        </Radio.Group>
      </div>

      {/* 数字信号：显示触发状态开关 */}
      {signalType === 'digital' && (
        <div>
          <label className="mb-1 block text-[13px] text-gray-500">
            触发状态
          </label>
          <Switch
            checked={interrupt.state === 1 || interrupt.state === true}
            onChange={(checked) =>
            { onChange({ ...interrupt, state: checked ? 1 : 0 }); }
            }
            checkedChildren="触发 (1)"
            unCheckedChildren="未触发 (0)"
          />
        </div>
      )}

      {/* 模拟信号：显示逻辑选择 + 触发阈值 */}
      {signalType === 'analog' && (
        <>
          <div>
            <label className="mb-1 block text-[13px] text-gray-500">
              逻辑
            </label>
            <Radio.Group
              value={logic}
              onChange={(e) =>
              { onChange({
                ...interrupt,
                logic: e.target.value as Interrupt['logic'],
              }); }
              }
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value=">">大于</Radio.Button>
              <Radio.Button value="<">小于</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <label className="mb-1 block text-[13px] text-gray-500">
              触发阈值
            </label>
            <InputNumber
              value={threshold}
              onChange={(v) =>
              { onChange({ ...interrupt, threshold: v ?? 0 }); }
              }
              min={0}
              step={1}
              className="w-full"
              placeholder="输入模拟信号触发阈值"
            />
            <div className="mt-1 text-[11px] text-gray-400">
              当传感器值{logic === '>' ? '大于' : '小于'}阈值时触发中断
            </div>
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          屏蔽抖动间隔（毫秒）
        </label>
        <InputNumber
          value={interrupt.intercept}
          onChange={(v) => { onChange({ ...interrupt, intercept: v ?? 0 }); }}
          step={100}
          min={0}
          className="w-full"
        />
        {/*
         * intercept 用于防抖：在首次触发中断后，该时间段内忽略同一传感器的重复触发。
         * 避免因信号抖动导致中断逻辑被多次执行。
         */}
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          延迟检测（毫秒）
        </label>
        <InputNumber
          value={interrupt.delay}
          onChange={(v) => { onChange({ ...interrupt, delay: v ?? 0 }); }}
          step={1000}
          min={0}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          持续时间（毫秒）
        </label>
        <InputNumber
          value={interrupt.duration}
          onChange={(v) => { onChange({ ...interrupt, duration: v ?? 0 }); }}
          step={1000}
          min={0}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          禁用
        </label>
        <Switch
          checked={!interrupt.disabled}
          onChange={(checked) => { onChange({ ...interrupt, disabled: !checked }); }}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
