/**
 * @file utils.cpp
 * @brief 通用工具函数实现
 *
 * 包含电压采集（分压器计算）、设备标识获取及日志输出等基础工具函数的实现。
 */
#include "utils.h"
#include "config.h"
#include "AdcCalib.h"
#include <string.h>

/**
 * 获得当前电压 (30k/10k 分压器)
 * @param pin 模拟输入引脚
 * @return 电压值（伏特）
 */
float getVoltageBy30k10k(int pin) { return getVoltageByR1R2(pin, 30, 10); }

/**
 * 获得当前电压 (91k/10k 分压器)
 * @param pin 模拟输入引脚
 * @return 电压值（伏特）
 */
float getVoltageBy91k10k(int pin) { return getVoltageByR1R2(pin, 91, 10); }

/**
 * 获得当前电压 (R1/R2 分压器)
 * 分压器电路: V_actual --[R1]-- V_adc --[R2]-- GND
 * 采集 ADC 值后换算为实际电压：
 *   V_adc = ADC_VALUE / 4095 * 3.3
 *   V_actual = V_adc * (R1 + R2) / R2
 * 例如：12V 电源(91k/10k 分压器) - 满压(12v) ADC≈1475 ~ 低压(11v) ADC≈1352
 * @param pin 模拟输入引脚
 * @param r1 上拉电阻值（kΩ）
 * @param r2 下拉电阻值（kΩ）
 * @return 电压值（伏特）
 */
float getVoltageByR1R2(int pin, int r1, int r2) {
  // 读取 ADC 原始值（0~4095，对应 0~3.3V）
  long value = readAdcCalibrated(pin);
  // 将 ADC 值换算为引脚电压
  float v_adc = (float)(value) / 4095 * 3.3;
  // 通过分压比反推实际电压：V_actual = V_adc * (R1 + R2) / R2
  float volts = v_adc * (r1 + r2) / r2;
  log("Voltage {\"pin\":%d,\"value\":%ld,\"volts\":%1.1f}", pin, value, volts);
  return volts;
}

/**
 * 获得设备名称
 * 根据编译目标平台生成不同前缀，拼接芯片ID
 * @return 设备名称字符串，格式如 "ESP32-a1b2c3d4"
 */
String getDeviceName() {
  char buffer[64];
#if defined(ESP8266)
  const char *devTyp = "ESP8266";
#elif defined(ESP32)
  const char *devTyp = "ESP32";
#else
  const char *devTyp = "IOT";
#endif
  sprintf(buffer, "%s-%lx", devTyp, getChipId());
  return String(buffer);
}

#if defined(ESP8266)
/**
 * 获得 ESP8266 芯片ID
 * @return 芯片ID（32位整数）
 */
unsigned long getChipId() { return system_get_chip_id(); }

#elif defined(ESP32)
/**
 * 获得 ESP32 芯片ID
 * 基于 MAC 地址的低 3 字节组合为 32 位整数，与 ESP8266 的 getChipId() 行为一致
 * @return 芯片ID（32位整数）
 */
unsigned long getChipId() {
  unsigned long chipId = 0;
  // 从 eFuse MAC 地址中提取 3 个字节，每 8 位合并
  for (int i = 0; i < 17; i = i + 8) {
    chipId |= ((ESP.getEfuseMac() >> (40 - i)) & 0xff) << i;
  }
  return chipId;
}
#endif

/**
 * 打印日志（支持 printf 风格格式化）
 * 仅在 DEBUG_MODE 宏启用时输出到串口
 * 内含按关键词过滤日志的开关（当前已注释），可用于减少高频日志干扰
 * @param format 格式化字符串
 * @param ... 可变参数
 */
void log(const char *format, ...) {
#ifdef DEBUG_MODE
  // ---- 以下为日志过滤开关，取消注释可屏蔽对应模块的日志 ----
  // if (strstr(format, "AnalogSensor") != NULL) { return; }
  // if (strstr(format, "Sensor") != NULL) { return; }
  // if (strstr(format, "Light") != NULL) { return; }
  // if (strstr(format, "Button") != NULL) { return; }

  // 格式化日志内容并输出到串口
  char buffer[4096];
  va_list args;
  va_start(args, format);
  vsnprintf(buffer, sizeof(buffer), format, args);
  va_end(args);
  Serial.printf("%s\n", buffer);
#endif
}
