/**
 * @file Sensor.cpp
 * @brief 数字传感器监视对象实现
 *
 * 通过 digitalRead 轮询引脚电平，检测状态变化，
 * 内置 debounce 过滤，状态变化时触发回调通知。
 */
#include "Sensor.h"

/**
 * 获得针脚标识
 * @return 针脚编号
 */
int Sensor::getPin() { return pin; }

/**
 * 设置针脚标识
 * 设置后立即以静默模式刷新内部状态，避免初始化时误触发回调
 * @param pinId 针脚编号
 */
void Sensor::setPin(int pinId) {
  pin = pinId;
  // 刷新数据（静默模式，不触发回调）
  this->next(true);
}

/**
 * 设置上下文
 * @param value 上下文指针
 */
void Sensor::setContext(void *value) { context = value; }

/**
 * 设置状态变化回调函数
 * @param handler 回调函数指针
 */
void Sensor::setChangeHandler(ChangeHandler handler) {
  changeHandler = handler;
}

/**
 * 设置有效信号变化间隔
 * 两次状态变化间隔小于此值时视为抖动，不更新状态
 * @param value 变化间隔（毫秒）
 */
void Sensor::setIntercept(int value) { intercept = value; }

/**
 * 获得当前状态
 * @return 传感器状态（1=高电平，0=低电平）
 */
long Sensor::getState() { return lastState ? 1 : 0; }

/**
 * 获得最后一次状态变化的时间戳
 * @return 时间戳（毫秒）
 */
unsigned long Sensor::getLastTimestamp() { return lastTimestamp; }

/**
 * 进程循环调用（默认非静默模式）
 */
void Sensor::next() { this->next(false); }

/**
 * 监视针脚信号变化
 * 每次调用读取引脚电平，与上次状态对比：
 * 1. 状态未变化 → 直接返回
 * 2. 变化间隔 < intercept → 视为抖动，忽略（不更新时间戳）
 * 3. 有效变化 → 更新时间戳和状态，触发回调（非静默时）
 * @param silent 是否静默模式（不触发回调）
 */
void Sensor::next(bool silent) {
  // 引脚未设置则跳过
  if (pin < 0) {
    yield();
    return;
  }
  unsigned long now = millis();
  // 读取当前引脚电平
  bool state = digitalRead(pin) == HIGH;
  // 状态未变化则跳过
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
    log("Sensor Change {\"pinId\":%d,\"state\":%s,\"duration\":%lu}", pin,
        (state ? "true" : "false"), (unsigned long)duration);
    if (changeHandler) {
      changeHandler(state, now, lastState, lastTimestamp, duration, this,
                    context);
    }
  }
  // 更新内部状态
  lastState = state;
}
