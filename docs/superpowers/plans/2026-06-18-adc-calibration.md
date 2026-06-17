# ESP32 ADC 校准实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ESP32 固件端对 analogRead() 原始值进行 ADC 硬件校准，修正电压/温度读数的系统性偏差。

**Architecture:** 新增 AdcCalib 模块封装校准逻辑（eFuse 特征描述符 + 多次采样平均 + 虚拟 raw 转换），AnalogSensor 调用校准读取替代裸 analogRead()，服务端代码不变。

**Tech Stack:** ESP32 Arduino Core 2.x（ESP-IDF 4.4）+ esp_adc_cal API

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新增 | `app/watering/rom-v2/AdcCalib.h` | ADC 校准接口声明 |
| 新增 | `app/watering/rom-v2/AdcCalib.cpp` | ADC 校准实现（eFuse 初始化 + 多次采样 + 校准转换） |
| 修改 | `app/watering/rom-v2/AnalogSensor.h` | 修正注释 0~1024 → 0~4095 |
| 修改 | `app/watering/rom-v2/AnalogSensor.cpp` | 修正注释 + 引入 AdcCalib 替换 analogRead |
| 修改 | `app/watering/rom-v2/utils.h` | 修正分压器注释（3.7V→12V） |
| 修改 | `app/watering/rom-v2/utils.cpp` | 修正注释 + 修复 /1024→/4095 bug |
| 修改 | `app/watering/rom-v2/rom-v2.ino` | setup() 中初始化 ADC 校准 |

---

### Task 1: 创建 AdcCalib 模块

**Files:**
- Create: `app/watering/rom-v2/AdcCalib.h`
- Create: `app/watering/rom-v2/AdcCalib.cpp`

- [ ] **Step 1: 创建 AdcCalib.h**

```cpp
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
```

- [ ] **Step 2: 创建 AdcCalib.cpp**

```cpp
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
```

- [ ] **Step 3: 提交**

```bash
git add app/watering/rom-v2/AdcCalib.h app/watering/rom-v2/AdcCalib.cpp
git commit -m "feat: add ADC calibration module with eFuse support and multi-sample averaging"
```

---

### Task 2: 修正过时注释和遗留 bug

**Files:**
- Modify: `app/watering/rom-v2/AnalogSensor.h`
- Modify: `app/watering/rom-v2/AnalogSensor.cpp`
- Modify: `app/watering/rom-v2/utils.h`
- Modify: `app/watering/rom-v2/utils.cpp`

- [ ] **Step 1: 修正 AnalogSensor.h 注释**

将第 18 行的 "0~1024" 改为 "0~4095"：

```cpp
// Before (line 18):
 * 通过 analogRead 轮询引脚模拟值（0~1024），检测数值变化并过滤抖动。

// After:
 * 通过 analogRead 轮询引脚模拟值（0~4095），检测数值变化并过滤抖动。
```

将第 63 行的 "0~1024" 改为 "0~4095"：

```cpp
// Before (line 63):
 * @return 模拟值（0~1024）

// After:
 * @return 模拟值（0~4095）
```

- [ ] **Step 2: 修正 AnalogSensor.cpp 注释**

将第 80 行的 "0~1024" 改为 "0~4095"：

```cpp
// Before (line 80):
  // 读取模拟值（0~1024）

// After:
  // 读取模拟值（0~4095）
```

- [ ] **Step 3: 修正 utils.h 注释**

将第 32 行的过时电池示例改为 12V 电源示例：

```cpp
// Before (line 32):
 * 例如：3V7 电池 - 满电(4v2) ADC=326 ~ 缺电(3v7) ADC=287

// After:
 * 例如：12V 电源(91k/10k 分压器) - 满压(12v) ADC≈1475 ~ 低压(11v) ADC≈1352
```

- [ ] **Step 4: 修正 utils.cpp 注释和 /1024 bug**

修正第 29 行注释（1024→4095）和第 31 行电池示例：

```cpp
// Before (line 29):
 *   V_adc = ADC_VALUE / 1024 * 3.3
// After:
 *   V_adc = ADC_VALUE / 4095 * 3.3
```

```cpp
// Before (line 31):
 * 例如：3V7 电池 - 满电(4v2) ADC=326 ~ 缺电(3v7) ADC=287
// After:
 * 例如：12V 电源(91k/10k 分压器) - 满压(12v) ADC≈1475 ~ 低压(11v) ADC≈1352
```

修正第 38 行注释（1024→4095）：

```cpp
// Before (line 38):
  // 读取 ADC 原始值（0~1024，对应 0~3.3V）
// After:
  // 读取 ADC 原始值（0~4095，对应 0~3.3V）
```

修正第 41 行的 `/1024` bug（ESP32 为 12-bit ADC，除数应为 4095）：

```cpp
// Before (line 41):
  float v_adc = (float)(value) / 1024 * 3.3;
// After:
  float v_adc = (float)(value) / 4095 * 3.3;
```

- [ ] **Step 5: 提交**

```bash
git add app/watering/rom-v2/AnalogSensor.h app/watering/rom-v2/AnalogSensor.cpp app/watering/rom-v2/utils.h app/watering/rom-v2/utils.cpp
git commit -m "fix: correct ADC range comments (1024→4095) and divider example (3.7V→12V), fix /1024 bug in getVoltageByR1R2"
```

---

### Task 3: 集成 ADC 校准到 AnalogSensor 和 setup

**Files:**
- Modify: `app/watering/rom-v2/AnalogSensor.cpp`
- Modify: `app/watering/rom-v2/rom-v2.ino`

- [ ] **Step 1: 修改 AnalogSensor.cpp — 引入 AdcCalib 替换 analogRead**

在文件头部添加 include（第 8 行 `#include "AnalogSensor.h"` 之后）：

```cpp
#include "AdcCalib.h"
```

将第 81 行的 `analogRead(pin)` 替换为 `readAdcCalibrated(pin)`：

```cpp
// Before (line 81):
  long state = analogRead(pin);

// After:
  long state = readAdcCalibrated(pin);
```

- [ ] **Step 2: 修改 rom-v2.ino — setup() 中初始化 ADC 校准**

在 include 区域（第 25 行 `#include "AnalogSensor.h"` 之后）添加：

```cpp
#include "AdcCalib.h"
```

在 setup() 函数中，传感器初始化之前（第 211 行 `// ---- 初始化传感器 ----` 之前）插入：

```cpp
  // ---- 初始化 ADC 校准 ----
  initAdcCalibration();
```

- [ ] **Step 3: 提交**

```bash
git add app/watering/rom-v2/AnalogSensor.cpp app/watering/rom-v2/rom-v2.ino
git commit -m "feat: integrate ADC calibration into AnalogSensor and setup"
```

---

### Task 4: 编译验证和手动测试

**Files:** 无代码变更

- [ ] **Step 1: 在 Arduino IDE 中编译固件**

打开 `app/watering/rom-v2/rom-v2.ino`，选择 ESP32 开发板，点击验证/编译。
预期：编译通过，无错误。串口监视器启动后应看到 `ADC Calibration {"source":"...","vref":...}` 日志。

- [ ] **Step 2: 刷入固件并对比读数**

刷入固件后，观察服务端显示的传感器读数变化：

| 传感器 | 校准前 | 校准后预期 |
|--------|--------|-----------|
| 电源电压 | 10.8V | ≈12V（±3~5% 残余误差为正常） |
| 温度 | 34.7°C | ≈27°C（±1~2°C 残余误差为正常） |

- [ ] **Step 3: 如校准后残余误差仍不可接受，记录偏差值**

ESP32 ADC 即使校准后仍有 ±3~5% 残余误差。如需进一步修正，后续可叠加服务端校准系数方案（在 SensorConfig 中增加 adcMultiplier 字段）。
