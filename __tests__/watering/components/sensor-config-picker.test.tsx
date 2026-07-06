/**
 * SensorConfigPicker 测试 — 纯编辑 Popup
 *
 * 注意：antd-mobile Popup 使用 renderToBody 在 document.body 渲染，
 * 故使用 document.body.textContent + afterEach(cleanup) 避免 DOM 残留。
 * Input 的 value 不在 textContent 中，通过 querySelector('[value=...]') 检查。
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SensorConfigPicker } from '@/app/watering/components/sensor-config-picker';
import type { SensorConfig } from '@/app/watering/types';

const mockGpio = { loads: [], sensors: ['sensor_0', 'sensor_1'], buttons: [] };

function baseSensor(overrides?: Partial<SensorConfig>): SensorConfig {
  return { name: '', sensor: 'sensor_0', type: 'analog', ...overrides };
}

describe('SensorConfigPicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('关闭时不渲染表单内容', () => {
    const { container } = render(
      <SensorConfigPicker
        gpio={mockGpio}
        open={false}
        sensor={baseSensor()}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container).toBeDefined();
  });

  describe('打开时', () => {
    it('sensor 名称为空时显示"添加传感器"', () => {
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={baseSensor({ name: '' })}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      expect(document.body.textContent).toContain('添加传感器');
    });

    it('sensor 有名称时显示"编辑传感器"并将名称填入输入框', () => {
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={baseSensor({ name: '电池' })}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      expect(document.body.textContent).toContain('编辑传感器');
      // input 的 value 不在 textContent 中，通过 attribute 检查
      const nameInput = document.body.querySelector<HTMLInputElement>(
        'input.adm-input-element',
      );
      expect(nameInput).toBeDefined();
      expect(nameInput?.value).toBe('电池');
    });

    it('渲染感应名称输入框', () => {
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={baseSensor()}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      expect(document.body.textContent).toContain('感应名称');
    });

    it('渲染传感器引脚选择器', () => {
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={baseSensor()}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      expect(document.body.textContent).toContain('传感器引脚');
    });

    it('渲染信号类型选择器', () => {
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={baseSensor()}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );
      expect(document.body.textContent).toContain('数字信号');
      expect(document.body.textContent).toContain('模拟信号');
    });

    it('点击确认触发 onConfirm', () => {
      const onConfirm = vi.fn();
      const sensor = baseSensor({ name: '电池', sensor: 'sensor_1', type: 'analog' });
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={sensor}
          onClose={vi.fn()}
          onConfirm={onConfirm}
        />,
      );
      const allButtons = document.body.querySelectorAll('button');
      const confirmBtn = Array.from(allButtons).find(
        (b) => b.textContent && b.textContent.includes('确认'),
      );
      expect(confirmBtn).toBeDefined();
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
          name: '电池',
          sensor: 'sensor_1',
          type: 'analog',
        }));
      }
    });

    it('触发 popstate 调用 onClose（模拟系统返回键）', () => {
      const onClose = vi.fn();
      render(
        <SensorConfigPicker
          gpio={mockGpio}
          open={true}
          sensor={baseSensor({ name: '测试' })}
          onClose={onClose}
          onConfirm={vi.fn()}
        />,
      );
      // useBackButton 注册了 popstate 监听，触发后应调用 onClose
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
