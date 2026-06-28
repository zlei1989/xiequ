/**
 * @file Button.cpp
 * @brief 按钮传感器检测对象实现
 *
 * 基于数字传感器检测按键电平变化，解析为短按、长按和弹起事件。
 * 短按：按下后在 250ms 内抬起
 * 长按：按住超过 250ms，此后每 500ms 递增触发一次长按事件
 * 弹起：按住超过 250ms 后抬起，或短按抬起后的默认类型
 */
#include "Button.h"

/**
 * 构造函数
 * 初始化内部 Sensor 对象，将其上下文绑定到 Button 自身，
 * 并设置 Sensor 的信号变化回调为内部的 sensorChangeHandler
 */
Button::Button() {
  // 将 Sensor 上下文指向当前 Button 对象
  sensor.setContext(this);
  // 创建 lambda 回调，将 Sensor 信号变化转发到 Button 的处理方法
  Sensor::ChangeHandler handler =
      [](bool state, unsigned long timestamp, bool lastState,
         unsigned long lastTimestamp, unsigned long duration, Sensor *sensor,
         void *context) {
        Button *button = reinterpret_cast<Button *>(context);
        button->sensorChangeHandler(state, timestamp, lastState, lastTimestamp,
                                    duration);
      };
  sensor.setChangeHandler(handler);
}

/**
 * 设置针脚标识（委托给内部 Sensor）
 * @param pinId 针脚编号
 */
void Button::setPin(int pinId) { sensor.setPin(pinId); }

/**
 * 设置上下文
 * @param value 上下文指针
 */
void Button::setContext(void *value) { context = value; }

/**
 * 设置按钮事件回调函数
 * @param handler 回调函数指针
 */
void Button::setChangeHandler(ChangeHandler handler) {
  changeHandler = handler;
}

/**
 * 获得针脚标识（委托给内部 Sensor）
 * @return 针脚编号
 */
int Button::getPin() { return sensor.getPin(); }

/**
 * 实现 IInterruptComponent 接口：获得当前按钮状态
 * @return 按钮状态（1=按下/高电平，0=释放/低电平）
 */
long Button::getState() { return sensor.getState(); }

/**
 * 实现 IInterruptComponent 接口：获得最后一次变化的时间戳
 * @return 时间戳（毫秒）
 */
unsigned long Button::getLastTimestamp() { return sensor.getLastTimestamp(); }

/**
 * 进程循环调用
 * 以静默模式轮询 Sensor 更新电平状态，然后检测长按超时事件。
 * 长按逻辑：按住超过 250ms 后，每 500ms pressValue 递增 1，触发一次长按回调。
 */
void Button::next() {
  // 引脚未设置则跳过
  if (sensor.getPin() < 0) {
    yield();
    return;
  }
  // 非静默模式检测电平变化，触发 Sensor 回调 → sensorChangeHandler →
  // pressDown/pressType 更新
  sensor.next();

  // 检测长按超时
  if (pressDown) {
    unsigned long now = millis();
    // 计算按下后持续时长
    int duration = now - pressTimestamp;
    // 未超过 250ms 不判断长按
    if (duration < 250) {
      return;
    }
    // 计算已持续的半秒周期数（floor 保证每 500ms 只触发一次）
    float seconds = floor(duration / 500);
    // 当周期数超过已触发的数值时，触发长按事件
    if (pressValue < seconds) {
      pressType = TYPE_LONG_PRESS;
      pressValue = seconds;
      int pin = this->getPin();
      log("Button Change {\"pinId\":%d,\"type\":\"%s\",\"value\":%f}", pin,
          typeMessage(pressType).c_str(), pressValue);
      if (changeHandler) {
        changeHandler(pressType, pressValue, this, context);
      }
    }
  }
}

/**
 * Sensor 电平变化时的内部回调处理
 * 解析电平变化为短按或弹起事件：
 * - 从高→低（lastState=true, state=false）：标记为按下，记录时间戳
 * - 从低→高（lastState=false, state=true）：标记为抬起，
 *   如果按下持续 < 250ms 则判为短按，否则判为弹起
 * @param state 当前电平状态（true=HIGH, false=LOW）
 * @param timestamp 变化时间戳（毫秒）
 * @param lastState 上一次电平状态
 * @param lastTimestamp 上一次变化时间戳（毫秒）
 * @param duration 两次变化间隔（毫秒）
 */
void Button::sensorChangeHandler(bool state, unsigned long timestamp,
                                 bool lastState, unsigned long lastTimestamp,
                                 unsigned long duration) {
  // 检测按下：电平从高变低
  if (!state && lastState) {
    // 标记按下状态
    pressDown = true;
    // 重置长按周期数
    pressValue = 0;
    // 记录按下时间戳
    pressTimestamp = timestamp;
    return;
  }
  // 检测抬起：电平从低变高
  if (state && !lastState) {
    // 标记抬起状态
    pressDown = false;
    // 判断按下持续时长决定事件类型
    if (duration < 250) {
      pressType = Button::TYPE_PRESS; // 短按：按下后 250ms 内抬起
    } else {
      pressType = Button::TYPE_NONE;  // 弹起：按住超过 250ms 后抬起
    }
    // 清除按下状态
    pressTimestamp = 0;
    pressValue = 0;
    int pin = this->getPin();
    log("Button Change {\"pinId\":%d,\"type\":\"%s\",\"value\":%f}", pin,
        typeMessage(pressType).c_str(), pressValue);
    if (changeHandler) {
      changeHandler(pressType, pressValue, this, context);
    }
  }
}

/**
 * 按键类型转中文描述
 * @param type 事件类型（TYPE_NONE / TYPE_PRESS / TYPE_LONG_PRESS）
 * @return 类型描述字符串
 */
String Button::typeMessage(int type) {
  String message = "未知";
  switch (type) {
  case Button::TYPE_PRESS:
    message = "短按";
    break;
  case Button::TYPE_LONG_PRESS:
    message = "长按";
    break;
  case Button::TYPE_NONE:
    message = "弹起";
    break;
  }
  return message;
}

/**
 * 设置按钮标识键名
 * @param keyName 键名字符串
 */
void Button::setKey(String keyName) { key = keyName; }

/**
 * 获得按钮标识键名
 * @return 键名字符串
 */
String Button::getKey() { return key; }
