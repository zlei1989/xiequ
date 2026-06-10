/**
 * @file Motor.cpp
 * @brief 电机/水泵控制对象实现
 *
 * 通过 PWM 信号控制电机转速，支持渐变调速。
 * 特殊值 1024 为直接启动信号（digitalWrite HIGH），不使用 PWM。
 * 关闭电机时将引脚切换为 INPUT 模式以降低功耗。
 *
 * ESP32 Arduino Core 3.x 已移除 analogWrite()，
 * 改用 LEDC 外设实现 PWM 输出。
 */
#include "Motor.h"

/** LEDC PWM 频率（Hz） */
#define MOTOR_PWM_FREQ 5000
/** LEDC PWM 分辨率（位数，0~255 对应 8 位） */
#define MOTOR_PWM_RESOLUTION 8

/**
 * 确保 LEDC 已绑定到引脚
 * 首次调用时通过 ledcAttach 将引脚与 LEDC 外设绑定，
 * 后续调用为空操作。ESP32 Arduino Core 3.x 的 ledcAttach
 * 自动管理通道分配，无需手动跟踪通道号。
 */
void Motor::ensureLedcChannel() {
  if (ledcAttached) {
    return;
  }
  ledcAttach(pin, MOTOR_PWM_FREQ, MOTOR_PWM_RESOLUTION);
  ledcAttached = true;
}

/**
 * 设置控制引脚
 * @param pinId 针脚编号
 */
void Motor::setPin(int pinId) {
  pin = pinId;
  // 引脚变更时需要重新绑定 LEDC
  ledcAttached = false;
}

/**
 * 实现 IStepComponent 接口：通过 JSON 字符串设置转速
 * 将字符串转为整数后委托给 setValue
 * @param value 转速值字符串（"0"~"255" 或 "1024"）
 */
void Motor::setJsonValue(String value) { setValue(atoi(value.c_str())); }

/**
 * 设置转速
 * 运行模式说明：
 * - value == 1024：开关模式，直接输出高电平
 * - value == 0：关闭电机，引脚切换为 INPUT 以省电
 * - value 1~255：PWM 调速模式，从目标值的 1/3 起步渐变
 * @param value 转速值（PWM 占空比 0~255，1024=直接启动）
 */
void Motor::setValue(int value) {
  // 引脚未设置时仅更新内部状态
  if (pin < 0) {
    target = value;
    current = value;
    yield();
    return;
  }
  log("Motor Change {\"value\":\"%d\"}", value);

  // 特殊值 1024：开关模式，直接输出高电平
  if (value == 1024) {
    // 先解除 LEDC 绑定，改为普通 GPIO 输出
    if (ledcAttached) {
      ledcDetach(pin);
      ledcAttached = false;
    }
    pinMode(pin, OUTPUT);
    digitalWrite(pin, HIGH);
    target = value;
    current = value;
    return;
  }

  // 将目标值限制在 0~255 范围内
  target = max(min(value, 255), 0);
  lastTimestamp = millis();

  if (target == 0) {
    // 关闭电机
    if (current == 1024) {
      // 从开关模式关闭
      digitalWrite(pin, LOW);
    } else {
      // 从 PWM 模式关闭
      ensureLedcChannel();
      ledcWrite(pin, 0);
    }
    current = 0;
    // 解除 LEDC 绑定，切换为 INPUT 模式降低功耗
    if (ledcAttached) {
      ledcDetach(pin);
      ledcAttached = false;
    }
    pinMode(pin, INPUT);
  } else {
    // PWM 调速启动：从目标值的 1/3 起步，通过 next() 渐变到目标值
    ensureLedcChannel();
    current = target / 3;
    ledcWrite(pin, current);
  }
}

/**
 * 获得目标转速
 * @return 目标转速值（0~255 或 1024）
 */
long Motor::getValue() { return target; }

/**
 * 进程循环调用
 * 实现 PWM 渐变调速：每次调用将当前值向目标值靠近一个 step，
 * 间隔由 interval 控制（默认 10ms）。
 * 当目标值与当前值相等时不再操作。
 */
void Motor::next() {
  // 已关闭或已达到目标值则跳过
  if (target == 0 || target == current) {
    yield();
    return;
  }
  // 等待渐变间隔
  unsigned long now = millis();
  if (now - lastTimestamp < interval) {
    yield();
    return;
  }
  // 当前值向目标值逼近一个步进
  current = min((current + step), target);
  lastTimestamp = now;
  ensureLedcChannel();
  ledcWrite(pin, current);
  yield();
}
