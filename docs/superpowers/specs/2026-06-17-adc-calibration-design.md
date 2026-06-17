# ESP32 固件 ADC 校准设计

## 背景

浇花系统 ESP32 设备的电压和温度传感器读数与实际值存在系统性误差：

| 传感器 | 实际值 | 显示值 | 误差 |
|--------|--------|--------|------|
| 电源电压（12V, 91k/10k 分压器） | ~12V | 10.8V | -1.2V (10%) |
| 温度（NTC MF52-10K B=3435） | ~27°C | 34.7°C | +7.7°C |

**根本原因**：ESP32 ADC 在 11dB 衰减下中段电压（1~2V）系统性偏低，且电压越高偏差越大。`analogRead()` 在 Arduino ESP32 Core 2.x 和 3.0+ 中均不自动应用校准。

实际 ADC 偏差数据：

| 传感器 | 理论 V_adc | ADC 读出 V_adc | 偏差 |
|--------|-----------|---------------|------|
| 电压（sensor_4, raw=1325） | 1.188V | 1.068V | -120mV (10%) |
| 温度（sensor_0, raw=1679） | 1.587V | 1.353V | -234mV (15%) |

电压偏低 → 分压器计算偏低；温度 ADC 偏低 → rNtc 偏低 → 温度偏高。服务端物理公式本身正确。

## 方案

在 ESP32 固件端对 `analogRead()` 原始值进行校准，服务端代码不变。校准后的值转回"虚拟 raw"格式，服务端无感知。

### 数据流

```
analogRead(pin) ×16 → 平均 → esp_adc_cal_raw_to_voltage() → mV → 虚拟 raw → lastState → 上报服务端
```

服务端公式 `raw/4095 × 3.3` 在虚拟 raw 上自动得到校准后的正确电压。

## 设计

### 1. 新增 `AdcCalib.h/cpp` — ADC 校准工具模块

**接口**：

```cpp
// AdcCalib.h
void initAdcCalibration();       // setup() 中调用，初始化 ADC1 校准特性
long readAdcCalibrated(int pin); // 带多次采样+校准的完整读取
```

**初始化** (`initAdcCalibration`)：

- 使用 `esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_11, ADC_WIDTH_BIT_12, 1100, &adc1_chars)` 创建 ADC1 校准特征描述符
- eFuse 中有 Vref 校准数据时自动使用；无数据时回退到默认 1100mV
- 打印日志提示校准是否启用

**校准读取** (`readAdcCalibrated`)：

1. **多次采样**：连续 `analogRead(pin)` 16 次取平均，降低 ADC 噪声（±5 LSB → ±1-2 LSB）
2. **校准转换**：`esp_adc_cal_raw_to_voltage(averagedRaw, &adc1_chars)` 得到校准电压 mV
3. **虚拟 raw 转换**：`mV / 3300.0 * 4095`，使服务端公式 `raw/4095*3.3` 自动得到校准后的正确电压
4. 返回虚拟 raw 值

**兼容性**：

使用预编译宏区分 Arduino Core 版本：

- **Core 2.x**（ESP-IDF 4.4）：使用 `esp_adc_cal` API — 本次实现
- **Core 3.0+**（ESP-IDF 5.x）：使用 `adc_cali` API — 预留条件编译分支，暂不实现

### 2. 修改 `AnalogSensor::next()`

将 `analogRead(pin)` 替换为 `readAdcCalibrated(pin)`：

```cpp
// Before:
long state = analogRead(pin);

// After:
long state = readAdcCalibrated(pin);
```

### 3. 修改 `setup()`

在传感器初始化之前调用 `initAdcCalibration()`：

```cpp
// 初始化 ADC 校准（必须在 analogRead 之前）
initAdcCalibration();

// ---- 初始化传感器 ----
sensor0.setPin(GPIO_SENSOR0);
// ...
```

### 4. 修正过时注释和遗留 bug

| 文件 | 修正内容 |
|------|----------|
| `AnalogSensor.h` | 注释 "0~1024" → "0~4095"（ESP32 12-bit ADC） |
| `AnalogSensor.cpp` | 注释 "0~1024" → "0~4095" |
| `utils.cpp` | `getVoltageByR1R2` 注释：分压器参数 30k/10k → 91k/10k，3.7V → 12V |
| `utils.cpp` | `getVoltageByR1R2` 实现：`/1024` → `/4095`（ESP32 ADC 12-bit，原值用于 ESP8266） |

### 5. 测试

刷入固件后，对比校准前后的读数：

- 电压：10.8V → 应接近 12V
- 温度：34.7°C → 应接近 27°C

如校准后仍有残余误差（ESP32 ADC 即使校准后仍有 ±3~5% 残余），可后续叠加服务端校准系数方案。

## 影响范围

- **固件**：新增 AdcCalib 模块，修改 AnalogSensor 和 setup
- **服务端**：无变更
- **协议**：无变更（上报值格式不变，仍为 raw 整数）
- **向后兼容**：校准后上报的 raw 值会变化，服务端日志/历史数据中会出现跳变，但这是预期行为
