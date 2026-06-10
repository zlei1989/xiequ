/**
 * @file utils.h
 * @brief 通用工具函数声明
 *
 * 提供电压采集（分压器计算）、设备标识获取及日志输出等基础工具函数。
 */
#ifndef utils_H
#define utils_H
#include <Arduino.h>
#include <stdarg.h>
#include <stdio.h>

/**
 * 获得当前电压 (30k/10k 分压器)
 * @param pin 模拟输入引脚
 * @return 电压值（伏特）
 */
float getVoltageBy30k10k(int pin);

/**
 * 获得当前电压 (91k/10k 分压器)
 * @param pin 模拟输入引脚
 * @return 电压值（伏特）
 */
float getVoltageBy91k10k(int pin);

/**
 * 获得当前电压 (R1/R2 分压器)
 * 分压器电路: V_actual --[R1]-- V_adc --[R2]-- GND
 * 计算公式: V_adc = V_actual * R2 / (R1 + R2)
 *          V_actual = V_adc * (R1 + R2) / R2
 * 例如：3V7 电池 - 满电(4v2) ADC=326 ~ 缺电(3v7) ADC=287
 * @param pin 模拟输入引脚
 * @param r1 上拉电阻值（kΩ）
 * @param r2 下拉电阻值（kΩ）
 * @return 电压值（伏特）
 */
float getVoltageByR1R2(int pin, int r1, int r2);

/**
 * 获得设备名称
 * 格式: {平台}-{芯片ID}，如 ESP32-a1b2c3d4
 * @return 设备名称字符串
 */
String getDeviceName();

/**
 * 获得芯片ID
 * 基于 MAC 地址生成 32 位整数标识
 * @return 芯片ID（32位无符号整数）
 */
unsigned long getChipId();

/**
 * 打印日志（支持 printf 风格格式化）
 * 仅在 DEBUG_MODE 宏启用时输出，否则为空操作
 * @param format 格式化字符串
 * @param ... 可变参数
 */
void log(const char *format, ...);

#endif // utils_H
