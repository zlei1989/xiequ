/**
 * @file AdcCalib.cpp
 * @brief ADC 校准工具实现
 *
 * 根据 ESP-IDF 版本选择校准 API：
 * - ESP-IDF 4.x（Arduino Core 2.x）：esp_adc_cal API
 * - ESP-IDF 5.x（Arduino Core 3.0+）：adc_cali API（暂未实现，回退到多次采样平均）
 */
#include "AdcCalib.h"
#include "config.h"
#include "utils.h"

/** 多次采样次数 */
#define ADC_SAMPLE_COUNT 16

#if ESP_IDF_VERSION_MAJOR >= 5
// ============================================================
// ESP-IDF 5.x（Arduino Core 3.0+）
// adc_cali API 暂未实现，回退到多次采样平均
// ============================================================

/** 校准是否已初始化 */
static bool adc_calibrated = false;

/**
 * 初始化 ADC 校准 — Core 3.0+ 暂未实现
 * 后续需使用 adc_cali_create_scheme_line_fitting 创建校准句柄
 */
void initAdcCalibration() {
  log("ADC Calibration {\"status\":\"not_supported\",\"idf\":\"5.x\"}");
  adc_calibrated = false;
}

/**
 * 多次采样平均（无校准回退）
 * @param pin 模拟输入引脚
 * @return 平均 raw 值
 */
long readAdcCalibrated(int pin) {
  long sum = 0;
  for (int i = 0; i < ADC_SAMPLE_COUNT; i++) {
    sum += analogRead(pin);
  }
  return sum / ADC_SAMPLE_COUNT;
}

#else
// ============================================================
// ESP-IDF 4.x（Arduino Core 2.x）
// 使用 esp_adc_cal API
// ============================================================
#include <esp_adc_cal.h>

/** ADC1 校准特征描述符 */
static esp_adc_cal_characteristics_t adc1_chars;

/** 校准是否已初始化 */
static bool adc_calibrated = false;

/**
 * 初始化 ADC1 校准
 * 使用 eFuse 中的校准数据创建特征描述符。
 * 校准来源优先级：eFuse 两点校准 > eFuse Vref > 默认 Vref(1100mV)
 */
void initAdcCalibration() {
  // 创建 ADC1 特征描述符（11dB 衰减 / 12-bit 分辨率 / 默认 Vref 1100mV）
  esp_adc_cal_value_t val_type = esp_adc_cal_characterize(
      ADC_UNIT_1, ADC_ATTEN_DB_11, ADC_WIDTH_BIT_12, 1100, &adc1_chars);

  // 记录校准数据来源
  const char *source;
  switch (val_type) {
  case ESP_ADC_CAL_VAL_EFUSE_VREF:
    source = "efuse_vref";
    break;
  case ESP_ADC_CAL_VAL_EFUSE_TP:
    source = "efuse_two_point";
    break;
  default:
    source = "default_vref";
    break;
  }
  log("ADC Calibration {\"source\":\"%s\",\"vref\":%d}", source,
      adc1_chars.vref);
  adc_calibrated = true;
}

/**
 * 带多次采样和校准的 ADC 读取
 *
 * 处理流程：
 * 1. 连续采样 16 次取平均 — 降低 ADC 噪声（±5 LSB → ±1~2 LSB）
 * 2. 将平均 raw 值通过 esp_adc_cal 校准为毫伏
 * 3. 将毫伏转回虚拟 raw（mV / 3300.0 * 4095），
 *    使服务端公式 raw/4095*3.3 自动得到校准后电压
 *
 * @param pin 模拟输入引脚
 * @return 校准后的虚拟 raw 值
 */
long readAdcCalibrated(int pin) {
  // 多次采样取平均
  long sum = 0;
  for (int i = 0; i < ADC_SAMPLE_COUNT; i++) {
    sum += analogRead(pin);
  }
  long averagedRaw = sum / ADC_SAMPLE_COUNT;

  // 校准未初始化时直接返回平均值
  if (!adc_calibrated) {
    return averagedRaw;
  }

  // 将平均 raw 值校准为毫伏
  uint32_t mv = esp_adc_cal_raw_to_voltage((uint32_t)averagedRaw, &adc1_chars);

  // 将毫伏转回虚拟 raw，使服务端公式 raw/4095*3.3 = mv/1000
  long virtualRaw = (long)((double)mv / 3300.0 * 4095.0);

  return virtualRaw;
}

#endif
