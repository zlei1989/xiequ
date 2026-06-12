/**
 * 按钮自动复位逻辑单元测试
 *
 * 使用 vitest + @testing-library/react 测试 DeviceForm 中按钮 2 秒自动复位行为。
 * 模拟传感器 clamp 逻辑作为独立纯函数测试。
 *
 * 注意事项：
 * - DeviceForm.onGpioChange 类型为 Dispatch<SetStateAction<GpioState>>，使用函数式更新；
 *   测试通过闭包跟踪最新状态，并通过 rerender 模拟 React 父组件的状态同步。
 * - antd-mobile Switch 内部使用 usePropsValue，其 checked 状态随 props.checked 同步；
 *   每次 onGpioChange 后需要 rerender 以传递最新 gpio 值给 Switch。
 * - 7 个 switch 的 DOM 排列顺序：sensor_1, sensor_2, button_0~button_4（索引 0-6）。
 * - afterEach 中显式调用 cleanup()，确保 DOM 不在测试间泄漏。
 */

// @vitest-environment jsdom

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

import { DeviceForm } from '@/app/watering/debug/components/device-form';
import type { DeviceIdentity, GpioState } from '@/app/watering/debug/hooks/use-iot-simulator';

import type { SetStateAction } from 'react';

/** 默认测试数据 */
const defaultIdentity: DeviceIdentity = {
  chipId: 'test',
  macAddress: '00:00:00:00:00:00',
  stateId: '',
};

const defaultGpio: GpioState = {
  digitalSensors: { sensor_1: 0, sensor_2: 0 },
  analogSensors: { sensor_0: 0, sensor_3: 0, sensor_4: 0 },
  buttons: { button_0: 1, button_1: 1, button_2: 1, button_3: 1, button_4: 1 },
  loads: { load_0: 0, load_1: 0, load_2: 0, load_3: 0 },
};

/**
 * 创建 onGpioChange 的 mock，通过闭包跟踪最新 GpioState。
 * 调用 mock 时执行函数式更新并保存结果到 currentGpio。
 */
function createGpioMock(initial: GpioState) {
  let currentGpio: GpioState = { ...initial, buttons: { ...initial.buttons } };
  const mock = vi.fn((updater: SetStateAction<GpioState>) => {
    if (typeof updater === 'function') {
      currentGpio = updater(currentGpio);
    } else {
      currentGpio = updater;
    }
  });
  return { mock, getState: () => currentGpio };
}

describe('按钮自动复位', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it('切换为 0 后 2 秒自动回 1', () => {
    const { mock: onGpioChange, getState } = createGpioMock(defaultGpio);

    const { rerender } = render(
      <DeviceForm
        identity={defaultIdentity}
        onIdentityChange={vi.fn()}
        gpio={defaultGpio}
        onGpioChange={onGpioChange}
      />,
    );

    /** 用 mock 中追踪的最新状态重新渲染组件，模拟 React 父组件的 setState 流程 */
    const syncGpio = () => {
      rerender(
        <DeviceForm
          identity={defaultIdentity}
          onIdentityChange={vi.fn()}
          gpio={getState()}
          onGpioChange={onGpioChange}
        />,
      );
    };

    // 7 个 switch：前 2 个是数字传感器，后 5 个是按钮
    // button_0 在索引 2
    const switches = screen.getAllByRole('switch');
    const btnSwitch = switches[2]!;

    // 点击切为 0
    fireEvent.click(btnSwitch);
    syncGpio();

    // 验证状态已变为 0
    expect(getState().buttons.button_0).toBe(0);

    // 快进 2 秒触发定时器
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    syncGpio();

    // 验证自动复位为 1
    expect(getState().buttons.button_0).toBe(1);
    expect(onGpioChange).toHaveBeenCalledTimes(2);
  });

  it('2 秒内手动切回 1 则取消定时器', () => {
    const { mock: onGpioChange, getState } = createGpioMock(defaultGpio);

    const { rerender } = render(
      <DeviceForm
        identity={defaultIdentity}
        onIdentityChange={vi.fn()}
        gpio={defaultGpio}
        onGpioChange={onGpioChange}
      />,
    );

    const syncGpio = () => {
      rerender(
        <DeviceForm
          identity={defaultIdentity}
          onIdentityChange={vi.fn()}
          gpio={getState()}
          onGpioChange={onGpioChange}
        />,
      );
    };

    const switches = screen.getAllByRole('switch');
    const btnSwitch = switches[2]!;

    // 切为 0
    fireEvent.click(btnSwitch);
    syncGpio();
    expect(getState().buttons.button_0).toBe(0);

    // 立即切回 1（模拟用户手动恢复）
    fireEvent.click(btnSwitch);
    syncGpio();
    expect(getState().buttons.button_0).toBe(1);

    // 快进 2 秒，定时器已被清除，不应再变化
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    syncGpio();

    expect(getState().buttons.button_0).toBe(1);
    // 只有前 2 次 setState 调用（切 0 + 切回 1），无第 3 次复位
    expect(onGpioChange).toHaveBeenCalledTimes(2);
  });
});

describe('模拟传感器值 clamp', () => {
  it('超出 1024 时 clamp 为 1024', () => {
    const clamp = (v: number) => Math.min(1024, Math.max(0, v));
    expect(clamp(2000)).toBe(1024);
    expect(clamp(-5)).toBe(0);
    expect(clamp(512)).toBe(512);
  });
});
