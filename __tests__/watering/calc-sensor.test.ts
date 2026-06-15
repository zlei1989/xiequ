import { describe, it, expect } from 'vitest';

import type { SensorConfig } from '@/app/watering/types';
import { calcSensorReadings } from '@/app/watering/utils/calc-sensor';

describe('calcSensorReadings', () => {
  const sensorValues = { sensor_0: 2048, sensor_1: 0, sensor_2: 4095 };

  it('空配置数组返回空 readings', () => {
    expect(calcSensorReadings([], sensorValues)).toEqual([]);
  });

  it('sensorValues 为 undefined 返回空 readings', () => {
    const configs: SensorConfig[] = [
      { name: '测试', sensor: 'sensor_0', type: 'digital' },
    ];
    expect(calcSensorReadings(configs, undefined)).toEqual([]);
  });

  it('数字信号 — 高电平', () => {
    const configs: SensorConfig[] = [
      { name: '按钮', sensor: 'sensor_0', type: 'digital' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '按钮', value: 1 }]);
  });

  it('数字信号 — 低电平', () => {
    const configs: SensorConfig[] = [
      { name: '按钮', sensor: 'sensor_1', type: 'digital' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '按钮', value: 0 }]);
  });

  it('模拟信号无转换 — 显示 ADC 原始值', () => {
    const configs: SensorConfig[] = [
      { name: '湿度', sensor: 'sensor_0', type: 'analog' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '湿度', value: 2048 }]);
  });

  it('电阻分压器 — 计算实际电压', () => {
    const configs: SensorConfig[] = [
      { name: '电池', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 30000, r2: 10000 },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result[0]?.label).toBe('电池');
    expect(result[0]?.value).toBeCloseTo(6.60, 1);
  });

  it('电阻分压器 — R1/R2 为 0 时不应用分压比', () => {
    const configs: SensorConfig[] = [
      { name: '电池', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 0, r2: 10000 },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result[0]?.value).toBeCloseTo(1.65, 1);
  });

  it('温感电阻 NTC 10K — 计算温度', () => {
    const configs: SensorConfig[] = [
      { name: '温度', sensor: 'sensor_0', type: 'analog', conversion: 'ntc_10k', bValue: 3435 },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result[0]?.label).toBe('温度');
    expect(typeof result[0]?.value).toBe('number');
    expect(result[0]?.value).toBeGreaterThan(20);
    expect(result[0]?.value).toBeLessThan(30);
  });

  it('传感器引脚数据缺失时 value 为 0', () => {
    const configs: SensorConfig[] = [
      { name: '缺失', sensor: 'sensor_missing', type: 'analog' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toEqual([{ label: '缺失', value: 0 }]);
  });

  it('多个传感器同时计算', () => {
    const configs: SensorConfig[] = [
      { name: '电压', sensor: 'sensor_0', type: 'analog', conversion: 'resistor_divider', r1: 30000, r2: 10000 },
      { name: '按钮', sensor: 'sensor_1', type: 'digital' },
    ];
    const result = calcSensorReadings(configs, sensorValues);
    expect(result).toHaveLength(2);
    expect(result[0]?.label).toBe('电压');
    expect(result[1]?.label).toBe('按钮');
  });
});
