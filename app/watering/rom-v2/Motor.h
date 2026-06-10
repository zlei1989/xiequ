/**
 * @file Motor.h
 * @brief 电机/水泵控制对象
 *
 * 通过 PWM 信号控制电机转速，支持渐变调速（目标速度→当前速度逐步逼近）。
 * 实现 IStepComponent 接口，可作为 Process 的步骤执行组件。
 * 特殊值 1024 表示直接启动（非 PWM，输出高电平），用于简单开关控制。
 */
#ifndef MOTOR_H_
#define MOTOR_H_
#include "config.h"
#include "utils.h"
#include "Process.h"
#include <Arduino.h>

/**
 * 电机/水泵控制类
 * 支持两种运行模式：
 * - PWM 调速模式：占空比 0~255，启动时从目标值的 1/3 开始渐变
 * - 开关模式：目标值 1024 时直接输出高电平，不使用 PWM
 * 关闭时将引脚切换为 INPUT 模式以降低功耗。
 * 继承 IStepComponent 以支持流程步骤控制。
 */
class Motor : public IStepComponent {

public:
  /**
   * 设置控制引脚
   * @param pinId 针脚编号
   */
  void setPin(int pinId);
  /**
   * 实现 IStepComponent 接口：通过 JSON 字符串设置转速
   * 将字符串解析为整数后调用 setValue
   * @param value 转速值字符串（"0"~"255" 或 "1024"）
   */
  void setJsonValue(String value) override;
  /**
   * 设置转速
   * @param value 转速值（PWM 占空比 0~255，1024=直接启动）
   */
  void setValue(int value);
  /**
   * 获得目标转速
   * @return 目标转速值（0~255 或 1024）
   */
  long getValue() override;
  /**
   * 进程循环调用，实现 PWM 渐变调速
   */
  void next();

protected:
  /**
   * 确保 LEDC 通道已分配并绑定到引脚
   * 首次调用时自动分配通道，后续调用为空操作
   */
  void ensureLedcChannel();
  /** 控制引脚编号（-1 表示未设置） */
  int pin = -1;
  /** 当前实际 PWM 占空比 */
  int current = 0;
  /** 目标 PWM 占空比 */
  int target = 0;
  /** 每次渐变的步进值（默认 1） */
  int step = 1;
  /** 渐变间隔（毫秒，默认 10ms） */
  int interval = 10;
  /** 起步速度（当前未使用，保留） */
  int initial = 0;
  /** 上一次渐变的时间戳（毫秒） */
  unsigned long lastTimestamp = 0;
  /** LEDC 通道编号（3.x 由框架内部管理，不再手动跟踪） */
  // int ledcChannel = -1;
  /** 是否已初始化 LEDC 通道 */
  bool ledcAttached = false;
};

#endif /* MOTOR_H_ */
