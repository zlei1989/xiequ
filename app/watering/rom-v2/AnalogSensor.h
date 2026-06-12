/**
 * @file AnalogSensor.h
 * @brief 模拟传感器监视对象
 *
 * 用于监视模拟信号引脚（如温度传感器、电压传感器）的数值变化，
 * 内置信号抖动过滤（debounce）机制，数值变化时触发回调。
 * 实现 IInterruptComponent 接口，可作为 Process 的中断检测组件。
 */
#ifndef ANALOGSENSOR_H_
#define ANALOGSENSOR_H_
#include <Arduino.h>
#include "config.h"
#include "utils.h"
#include "Process.h"

/**
 * 模拟传感器监视类
 * 通过 analogRead 轮询引脚模拟值（0~1024），检测数值变化并过滤抖动。
 * 继承 IInterruptComponent 以支持流程中断检测。
 */
class AnalogSensor : public IInterruptComponent {

public:
  /**
   * 数值变化回调函数类型
   * @param state 当前模拟值
   * @param timestamp 变化时间戳（毫秒）
   * @param lastState 上一次模拟值
   * @param lastTimestamp 上一次变化时间戳（毫秒）
   * @param duration 两次变化间隔（毫秒）
   * @param sensor 触发回调的传感器对象指针
   * @param context 用户上下文指针
   */
  typedef void (*ChangeHandler)(long state, unsigned long timestamp,
                                long lastState, unsigned long lastTimestamp,
                                unsigned long duration, AnalogSensor *sensor,
                                void *context);

  /** 获得针脚标识 */
  int getPin();
  /**
   * 设置针脚标识
   * @param pinId 针脚编号
   */
  void setPin(int pinId);
  /**
   * 设置上下文
   * @param value 上下文指针
   */
  void setContext(void *value);
  /**
   * 设置数值变化回调函数
   * @param handler 回调函数指针
   */
  void setChangeHandler(ChangeHandler handler);
  /**
   * 设置有效信号变化间隔（过滤信号抖动）
   * @param value 变化间隔（毫秒）
   */
  void setIntercept(int value);
  /**
   * 获得当前模拟值
   * @return 模拟值（0~1024）
   */
  long getState() override;
  /**
   * 获得最后一次数值变化的时间戳
   * @return 时间戳（毫秒）
   */
  unsigned long getLastTimestamp() override;
  /** 进程循环调用（触发回调） */
  void next();

protected:
  /** 用户上下文指针 */
  void *context = nullptr;
  /** 数值变化回调函数指针 */
  ChangeHandler changeHandler;
  /** 监视引脚编号（-1 表示未设置） */
  int pin = -1;
  /** 有效信号变化间隔（毫秒），小于此间隔的抖动将被忽略 */
  int intercept = 10;
  /** 最后一次数值变化的时间戳 */
  unsigned long lastTimestamp = 0;
  /** 最后一次读取的模拟值 */
  long lastState = 0;
  /**
   * 进程循环调用（内部）
   * @param silent 是否静默模式（不触发回调，仅更新内部状态）
   */
  void next(bool silent);
};

#endif /* ANALOGSENSOR_H_ */
