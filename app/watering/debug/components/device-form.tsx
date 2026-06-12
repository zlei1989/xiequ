/**
 * 模拟器设备表单 — 设备标识、数字/模拟传感器、按钮、负载的 GPIO 状态
 *
 * 使用 antd-mobile 组件替换 antd (desktop)，传感器按固件语义分为数字/模拟，
 * 按钮含 2 秒自动复位逻辑，负载为纯展示 ProgressCircle。
 */

'use client';

import { Card, Input, Switch } from 'antd-mobile';
import { useCallback, useEffect, useRef } from 'react';

import type { DeviceIdentity, GpioState } from '../hooks/use-iot-simulator';
import type { Dispatch, SetStateAction } from 'react';


/** 数字传感器 → 中文标签 */
const DIGITAL_LABELS: Record<string, string> = {
  sensor_1: '水浸1',
  sensor_2: '水浸2',
};

/** 模拟传感器 → 中文标签（Task 3 使用） */
export const ANALOG_LABELS: Record<string, string> = {
  sensor_0: '温度',
  sensor_3: '负载电压',
  sensor_4: '电源电压',
};

/** 按钮自动复位延迟（毫秒），模拟物理按键回弹 */
const BUTTON_AUTO_RESET_MS = 2000;

export function DeviceForm({
  identity,
  onIdentityChange,
  gpio,
  onGpioChange,
}: {
  identity: DeviceIdentity;
  onIdentityChange: (identity: DeviceIdentity) => void;
  gpio: GpioState;
  /** 支持函数式更新（setTimeout 中避免 stale closure） */
  onGpioChange: Dispatch<SetStateAction<GpioState>>;
}) {
  // ---- 按钮自动复位定时器 ----
  const buttonTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  /** 清除指定按钮的定时器 */
  const clearButtonTimer = useCallback((key: string) => {
    const timer = buttonTimers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      buttonTimers.current.delete(key);
    }
  }, []);

  /** 组件卸载时清除所有定时器 */
  useEffect(() => {
    const timers = buttonTimers.current;
    return () => {
      timers.forEach((t) => { clearTimeout(t); });
      timers.clear();
    };
  }, []);

  /** 按钮值变更：若切为 0 则 2 秒后自动回 1 */
  const handleButtonChange = useCallback(
    (key: string, checked: boolean) => {
      const val = checked ? 1 : 0;
      const newButtons = { ...gpio.buttons, [key]: val };
      onGpioChange({ ...gpio, buttons: newButtons });

      // 如果切为 0，启动 2 秒定时器自动回 1
      if (val === 0) {
        clearButtonTimer(key);
        const timer = setTimeout(() => {
          onGpioChange((prev: GpioState) => {
            // 二次确认：定时器触发时值仍为 0 才复位
            if (prev.buttons[key] !== 0) return prev;
            return {
              ...prev,
              buttons: { ...prev.buttons, [key]: 1 },
            };
          });
          buttonTimers.current.delete(key);
        }, BUTTON_AUTO_RESET_MS);
        buttonTimers.current.set(key, timer);
      } else {
        // 切回 1 时取消定时器
        clearButtonTimer(key);
      }
    },
    [gpio, onGpioChange, clearButtonTimer],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ---- 设备标识 ---- */}
      <Card title="设备标识">
        <div className="flex flex-col gap-2 px-2 pb-1">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-sm text-gray-500">
              chipId
            </span>
            <Input
              value={identity.chipId}
              onChange={(v) => {
                onIdentityChange({ ...identity, chipId: v });
              }}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-sm text-gray-500">MAC</span>
            <Input
              value={identity.macAddress}
              onChange={(v) => {
                onIdentityChange({ ...identity, macAddress: v });
              }}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-sm text-gray-500">
              stateId
            </span>
            <Input
              value={identity.stateId}
              onChange={(v) => {
                onIdentityChange({ ...identity, stateId: v });
              }}
              className="flex-1"
            />
          </div>
        </div>
      </Card>

      {/* ---- 数字传感器 ---- */}
      <Card title="数字传感器 (0/1)">
        <div className="flex flex-col gap-2 px-2 pb-1">
          {Object.entries(gpio.digitalSensors).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">
                {key}{' '}
                <span className="text-gray-400">
                  ({DIGITAL_LABELS[key] ?? key})
                </span>
              </span>
              <Switch
                checked={val === 1}
                onChange={(checked) => {
                  onGpioChange({
                    ...gpio,
                    digitalSensors: {
                      ...gpio.digitalSensors,
                      [key]: checked ? 1 : 0,
                    },
                  });
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* ---- 按钮 ---- */}
      <Card title="按钮 (0/1，切为 0 后 2 秒自动回 1)">
        <div className="flex flex-col gap-2 px-2 pb-1">
          {Object.entries(gpio.buttons).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{key}</span>
              <Switch
                checked={val === 1}
                onChange={(checked) => {
                  handleButtonChange(key, checked);
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* 模拟传感器 和 负载 在 Task 3 中添加 */}
    </div>
  );
}
