/**
 * 模拟器设备表单 — 设备标识、数字/模拟传感器、按钮、负载的 GPIO 状态
 *
 * 使用 antd-mobile 组件，Form mode="card" + Form.Header 分组标题。
 * 按钮含 2 秒自动复位逻辑，负载为纯展示 ProgressCircle。
 */

'use client';

import {
  AutoCenter,
  Form,
  Grid,
  Input,
  ProgressCircle,
  Slider,
  Space,
  Switch,
  Stepper,
} from 'antd-mobile';
import { useCallback, useEffect, useRef } from 'react';

import type { DeviceIdentity, GpioState } from '../hooks/use-iot-simulator';
import type { Dispatch, SetStateAction } from 'react';

/** 数字传感器 → 中文标签 */
const DIGITAL_LABELS: Record<string, string> = {
  sensor_1: '水浸1',
  sensor_2: '水浸2',
};

/** 模拟传感器 → 中文标签 */
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
    // ref 引用稳定，仅在挂载/卸载时执行
  }, []);

  /** 按钮值变更：若切为 0 则 2 秒后自动回 1 */
  const handleButtonChange = useCallback(
    (key: string, checked: boolean) => {
      const val = checked ? 1 : 0;
      // 函数式更新避免 stale closure：React 18 自动批处理下多次 toggle 不会丢失
      onGpioChange((prev) => ({
        ...prev,
        buttons: { ...prev.buttons, [key]: val },
      }));

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
    // onGpioChange 是 React state setter，引用稳定，无需加入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearButtonTimer],
  );

  return (
    <>
      {/* ---- 设备标识 ---- */}
      <Form>
        <Form.Header>设备标识</Form.Header>
        <Form.Item label="chipId">
          <Input
            value={identity.chipId}
            onChange={(v) => {
              onIdentityChange({ ...identity, chipId: v });
            }}
          />
        </Form.Item>
        <Form.Item label="MAC">
          <Input
            value={identity.macAddress}
            onChange={(v) => {
              onIdentityChange({ ...identity, macAddress: v });
            }}
          />
        </Form.Item>
        <Form.Item label="stateId">
          <Input
            readOnly
            value={identity.stateId}
          />
        </Form.Item>
      </Form>

      {/* ---- 数字传感器 ---- */}
      <Form>
        <Form.Header>数字传感器 (0/1)</Form.Header>
        {Object.entries(gpio.digitalSensors).map(([key, val]) => (
          <Form.Item
            childElementPosition="right"
            key={key}
            label={`${key} (${DIGITAL_LABELS[key] ?? key})`}
          >
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
          </Form.Item>
        ))}
      </Form>

      {/* ---- 按钮 ---- */}
      <Form>
        <Form.Header>按钮 (0/1，切为 0 后 2 秒自动回 1)</Form.Header>
        {Object.entries(gpio.buttons).map(([key, val]) => (
          <Form.Item
            childElementPosition="right"
            key={key}
            label={key}
          >
            <Switch
              checked={val === 1}
              onChange={(checked) => {
                handleButtonChange(key, checked);
              }}
            />
          </Form.Item>
        ))}
      </Form>

      {/* ---- 模拟传感器 ---- */}
      <Form>
        <Form.Header>模拟传感器 (0-1024)</Form.Header>
        {Object.entries(gpio.analogSensors).map(([key, val]) => (
          // <Space direction="vertical" block>
          <Form.Item
            key={key}
            label={`${key} (${ANALOG_LABELS[key] ?? key})`}
          >
            <Grid columns={4} gap={12}>
              <Grid.Item span={3}>
                <Slider
                  max={1024}
                  min={0}
                  step={1}
                  value={val}
                  onChange={(v) => {
                    const num = v as number;
                    onGpioChange({
                      ...gpio,
                      analogSensors: {
                        ...gpio.analogSensors,
                        [key]: num,
                      },
                    });
                  }}
                />
              </Grid.Item>
              <Grid.Item span={1}>
                <Stepper defaultValue={val} step={1} />
              </Grid.Item>

            </Grid>
          </Form.Item>
        ))}
      </Form>

      {/* ---- 负载（纯展示） ---- */}
      <Form>
        <Form.Header>负载</Form.Header>
        <Grid columns={2} gap={12}>
          {Object.entries(gpio.loads).map(([key, val]) => {
            // 百分比计算：PWM 模式 val/255*100，1024=100%，0=0%
            const pwmPercent =
              val === 0
                ? 0
                : val === 1024
                  ? 100
                  : Math.round((val / 255) * 100);
            // 颜色：0=灰，1-255=绿，1024=红
            const color =
              val === 0
                ? 'var(--adm-color-weak)'
                : val === 1024
                  ? 'var(--adm-color-danger)'
                  : 'var(--adm-color-success)';
            // 状态文字
            const label =
              val === 0
                ? '停止'
                : val === 1024
                  ? '全速'
                  : `PWM ${pwmPercent}%`;

            return (
              <Grid.Item key={key}>
                <AutoCenter>
                  <Space className="gap-0" direction="vertical">
                    <ProgressCircle
                      percent={pwmPercent}
                      style={{
                        '--fill-color': color,
                        '--size': '64px',
                        '--track-width': '4px',
                      }}
                    >
                      <span className="text-sm font-medium">{val}</span>
                    </ProgressCircle>
                    <Space>
                      <span className="text-xs text-gray-500">{key}</span>
                      <span className="text-xs text-gray-400">{label}</span>
                    </Space>
                  </Space>
                </AutoCenter>
              </Grid.Item>
            );
          })}
        </Grid>
      </Form>
    </>
  );
}
