/**
 * 传感器读数计算工具
 *
 * 根据传感器配置和原始 ADC 读数，计算每个传感器的显示值。
 * 纯函数，无副作用，可独立测试。
 */

import type { SensorConfig } from '../types';

/**
 * 根据传感器配置和原始读数计算所有传感器的显示值
 *
 * @param configs - 传感器配置数组
 * @param sensorValues - 原始传感器读数（引脚名 → ADC 值）
 * @returns 传感名称和计算值数组，数据缺失时 value 为 0
 */
export function calcSensorReadings(
  configs: SensorConfig[],
  sensorValues: Record<string, number> | undefined,
): { label: string; value: number }[] {
  if (!configs.length || !sensorValues) return [];

  return configs.map((config) => {
    const raw = sensorValues[config.sensor];
    if (typeof raw !== 'number') return { label: config.name, value: 0 };

    // 数字信号 — 高/低电平
    if (config.type === 'digital') {
      return { label: config.name, value: raw > 0 ? 1 : 0 };
    }

    // 模拟信号 — 先应用 ADC 校准系数，再进行物理换算
    const corrected = raw * (config.adcMultiplier ?? 1);

    if (config.conversion === 'resistor_divider') {
      const vSensor = (corrected / 4095) * 3.3;
      const r1 = config.r1 ?? 30000;
      const r2 = config.r2 ?? 10000;
      const value = r1 > 0 && r2 > 0 ? vSensor * ((r1 + r2) / r2) : vSensor;
      return { label: config.name, value: Math.round(value * 100) / 100 };
    }

    if (config.conversion === 'ntc_10k') {
      const vAdc = (corrected / 4095) * 3.3;
      const rNtc = 10000 * vAdc / (3.3 - vAdc);
      const B = config.bValue ?? 3435;
      const tempK = 1 / (1 / 298.15 + Math.log(rNtc / 10000) / B);
      const tempC = tempK - 273.15;
      return { label: config.name, value: Math.round(tempC * 10) / 10 };
    }

    // 无转换 — 返回校准后的值
    return { label: config.name, value: corrected };
  });
}
