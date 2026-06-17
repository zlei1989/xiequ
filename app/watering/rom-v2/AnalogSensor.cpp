/**
 * @file AnalogSensor.cpp
 * @brief 模拟传感器监视对象实现
 *
 * 通过 analogRead 轮询引脚模拟值，检测数值变化，
 * 内置 debounce 过滤，数值变化时触发回调通知。
 */
#include "AnalogSensor.h"
#include "AdcCalib.h"

/**
 * 获得针脚标识
 * @return 针脚编号
 */
int AnalogSensor::getPin() { return pin; }

/**
 * 设置针脚标识
 * 设置后立即以静默模式刷新内部状态，避免初始化时误触发回调
 * @param pinId 针脚编号
 */
void AnalogSensor::setPin(int pinId) {
  pin = pinId;
  // 刷新数据（静默模式，不触发回调）
  this->next(true);
}

/**
 * 设置上下文
 * @param value 上下文指针
 */
void AnalogSensor::setContext(void *value) { context = value; }

/**
 * 设置数值变化回调函数
 * @param handler 回调函数指针
 */
void AnalogSensor::setChangeHandler(ChangeHandler handler) {
  changeHandler = handler;
}

/**
 * 设置有效信号变化间隔
 * 两次数值变化间隔小于此值时视为抖动，不更新状态
 * @param value 变化间隔（毫秒）
 */
void AnalogSensor::setIntercept(int value) { intercept = value; }

/**
 * 获得当前模拟值
 * @return 模拟值（0~4095）
 */
long AnalogSensor::getState() { return lastState; }

/**
 * 获得最后一次数值变化的时间戳
 * @return 时间戳（毫秒）
 */
unsigned long AnalogSensor::getLastTimestamp() { return lastTimestamp; }

/**
 * 进程循环调用（默认非静默模式）
 */
void AnalogSensor::next() { this->next(false); }

/**
 * 监视针脚模拟值变化
 * 每次调用读取引脚模拟值，与上次值对比：
 * 1. 数值未变化 → 直接返回
 * 2. 变化间隔 < intercept → 视为抖动，忽略（不更新时间戳）
 * 3. 有效变化 → 更新时间戳和状态，触发回调（非静默时）
 * @param silent 是否静默模式（不触发回调）
 */
void AnalogSensor::next(bool silent) {
  // 引脚未设置则跳过
  if (pin < 0) {
    yield();
    return;
  }
  unsigned long now = millis();
  // 读取模拟值（0~4095）
  long state = readAdcCalibrated(pin);
  // 数值未变化则跳过
  if (lastState == state) {
    yield();
    return;
  }
  // 计算变化间隔
  unsigned long duration = now - lastTimestamp;
  // 防止信号抖动：间隔过短则忽略本次变化（不更新时间戳，保持上一次有效变化的基准）
  if (duration < intercept) {
    return;
  }
  // 确认为有效变化，更新时间戳
  lastTimestamp = now;
  // 触发回调（非静默模式）
  if (!silent) {
    // log("AnalogSensor Change {\"pinId\":%d,\"state\":%ld,\"duration\":%lu}", pin,
    //     state, (unsigned long)duration);
    if (changeHandler) {
      changeHandler(state, now, lastState, lastTimestamp, duration, this,
                    context);
    }
  }
  // 更新内部状态
  lastState = state;
}
