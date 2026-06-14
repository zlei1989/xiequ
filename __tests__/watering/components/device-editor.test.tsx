// @vitest-environment jsdom

import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { DeviceEditor } from '@/app/watering/components/device-editor';
import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import type { DeviceConfig } from '@/app/watering/types';

afterEach(cleanup);

/** 创建与组件签名匹配的 saveRef */
function makeSaveRef(): React.MutableRefObject<() => Promise<void>> {
   
  const ref: React.MutableRefObject<() => Promise<void>> = { current: async () => {} };
  return ref;
}

const mockGpio: GpioInfo = {
  buttons: ['button_0'],
  loads: ['load_0'],
  sensors: ['sensor_0'],
};

const defaultConfig: DeviceConfig = {
  chipId: 'test_chip',
  macAddress: '00:00:00:00:00:00',
  name: '测试设备',
  idleSleep: false,
  idleTimeout: 30000,
  bootExec: -1,
  execDelay: 0,
  processes: [
    {
      name: '浇水',
      steps: [
        { name: '步骤1', component: 'load_0', value: { begin: 255, end: 0 }, timeout: 60000, interrupts: [] },
      ],
    },
  ],
  schedules: [],
  voltage: undefined,
  createdTime: '',
  lastWriteTime: '',
};

describe('DeviceEditor', () => {
  it('渲染设备名称输入', () => {
    const saveRef = makeSaveRef();
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByDisplayValue('测试设备')).toBeDefined();
  });

  it('渲染功能列表项', () => {
    const saveRef = makeSaveRef();
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText('浇水')).toBeDefined();
  });

  it('渲染空闲睡眠开关', () => {
    const saveRef = makeSaveRef();
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
  });

  it('saveRef 注册保存回调', async () => {
    const saveRef = makeSaveRef();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <DeviceEditor
        config={defaultConfig}
        gpio={mockGpio}
        saveRef={saveRef}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onSave={onSave}
      />,
    );
    expect(saveRef.current).toBeDefined();
    await act(async () => {
      await saveRef.current();
    });
    expect(onSave).toHaveBeenCalled();
  });
});
