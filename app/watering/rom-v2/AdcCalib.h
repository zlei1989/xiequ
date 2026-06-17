/**
 * @file AdcCalib.h
 * @brief ADC 校准工具
 *
 * 利用 ESP32 eFuse 校准数据对 analogRead() 原始值进行校准，
 * 补偿 ADC 非线性偏差。校准后的值以"虚拟 raw"格式返回，
 * 与服务端 raw/4095*3.3 公式兼容，服务端无需变更。
 */
#ifndef ADCCALIB_H_
#define ADCCALIB_H_
#include <Arduino.h>

/**
 * 初始化 ADC1 校准
 * 使用 eFuse 校准数据创建特征描述符（ADC1 + 11dB 衰减 + 12-bit）。
 * 必须在首次 analogRead 之前调用。
 */
void initAdcCalibration();

/**
 * 带多次采样和校准的 ADC 读取
 * 1. 连续采样 16 次取平均，降低 ADC 噪声
 * 2. 将平均 raw 值通过校准转换为毫伏
 * 3. 将毫伏转回虚拟 raw（mV / 3300 * 4095），使服务端公式自动得到校准后电压
 * @param pin 模拟输入引脚
 * @return 校准后的虚拟 raw 值（与 analogRead 返回值格式一致，0~4095）
 */
long readAdcCalibrated(int pin);

#endif /* ADCCALIB_H_ */
