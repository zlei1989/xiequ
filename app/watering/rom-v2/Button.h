/**
 * @file Button.h
 * @brief 按钮传感器检测对象
 *
 * 基于数字传感器（Sensor）封装，支持检测短按、长按和弹起三种按键事件。
 * 长按时每 500ms 递增触发一次事件（pressValue 表示长按周期数）。
 * 实现 IInterruptComponent 接口，可作为 Process 的中断检测组件。
 */
#ifndef BUTTON_H_
#define BUTTON_H_
#include "config.h"
#include "utils.h"
#include "Sensor.h"
#include "Process.h"
#include <Arduino.h>

/**
 * 按钮传感器检测类
 * 内部持有 Sensor 对象监听引脚电平变化，解析为短按/长按/弹起事件。
 * 继承 IInterruptComponent 以支持流程中断检测。
 */
class Button : public IInterruptComponent {

public:
  /**
   * 按钮事件回调函数类型
   * @param type 事件类型（TYPE_NONE / TYPE_PRESS / TYPE_LONG_PRESS）
   * @param value 事件数值（长按时为已持续的半秒周期数）
   * @param button 触发回调的按钮对象指针
   * @param context 用户上下文指针
   */
  typedef void (*ChangeHandler)(int type, float value, Button *button,
                                void *context);

  /** 按键抬起类型（长按释放时也使用此类型） */
  static const int TYPE_NONE = 0;
  /** 按键短按类型（按下后 250ms 内抬起） */
  static const int TYPE_PRESS = 1;
  /** 按键长按类型（按住超过 250ms，每 500ms 触发一次） */
  static const int TYPE_LONG_PRESS = 2;

  /**
   * 构造函数，初始化内部 Sensor 并绑定信号变化回调
   */
  Button();

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
   * 设置按钮事件回调函数
   * @param handler 回调函数指针
   */
  void setChangeHandler(ChangeHandler handler);
  /**
   * 设置按钮标识键名（如 "button_0"），用于 trigger 匹配
   * @param key 键名字符串
   */
  void setKey(String key);
  /**
   * 获得按钮标识键名
   * @return 键名字符串
   */
  String getKey();

  /**
   * 内部使用：Sensor 信号变化时的回调入口
   * @param state 当前电平状态
   * @param timestamp 变化时间戳（毫秒）
   * @param lastState 上一次电平状态
   * @param lastTimestamp 上一次变化时间戳（毫秒）
   * @param duration 两次变化间隔（毫秒）
   */
  void sensorChangeHandler(bool state, unsigned long timestamp, bool lastState,
                           unsigned long lastTimestamp, unsigned long duration);

  /**
   * 按键类型转中文描述
   * @param type 事件类型
   * @return 类型描述字符串
   */
  String typeMessage(int type);

  /**
   * 实现 IInterruptComponent 接口：获得当前按钮状态
   * @return 按钮状态（1=按下/高电平，0=释放/低电平）
   */
  long getState() override;
  /**
   * 实现 IInterruptComponent 接口：获得最后一次变化的时间戳
   * @return 时间戳（毫秒）
   */
  unsigned long getLastTimestamp() override;

  /** 进程循环调用，检测短按/长按事件 */
  void next();

protected:
  /** 用户上下文指针 */
  void *context = nullptr;
  /** 当前是否处于按下状态 */
  bool pressDown = false;
  /** 按下时的时间戳（毫秒） */
  unsigned long pressTimestamp = 0;
  /** 最近一次触发的事件类型（-1 表示无事件） */
  int pressType = -1;
  /** 长按时已持续的半秒周期数（每 500ms 递增 1） */
  float pressValue = 0;
  /** 内部数字传感器对象，用于检测引脚电平变化 */
  Sensor sensor;
  /** 按钮事件回调函数指针 */
  ChangeHandler changeHandler;
  /** 按钮标识键名（如 "button_0"），用于与流程 trigger 属性匹配 */
  String key = "";
};

#endif /* BUTTON_H_ */
