/**
 * @file Light.h
 * @brief LED 指示灯控制对象
 *
 * 提供点亮、熄灭和闪烁三种控制模式。
 * 闪烁模式支持指定次数（0=无限闪烁），通过 next() 循环驱动。
 * 注意：LED 为低电平点亮（LOW=开，HIGH=关）。
 */
#ifndef LIGHT_H_
#define LIGHT_H_
#include "config.h"
#include "utils.h"
#include <Arduino.h>

/**
 * LED 指示灯控制类
 * 通过数字引脚控制 LED 的开关和闪烁。
 * 硬件上 LED 采用低电平驱动（共阳接法），因此 LOW=点亮，HIGH=熄灭。
 */
class Light {

public:
  /** 快速闪烁间隔（200ms） */
  static const int SPEED_FAST = 200;
  /** 慢速闪烁间隔（1000ms） */
  static const int SPEED_SLOW = 1000;

  /**
   * 设置针脚标识
   * @param pinId 针脚编号
   */
  void setPin(int pinId);
  /** 进程循环调用，驱动闪烁逻辑 */
  void next();
  /** 点亮 LED（输出 LOW） */
  void open();
  /** 熄灭 LED（输出 HIGH） */
  void close();
  /**
   * 启动闪烁模式
   * @param loop 闪烁次数（0=无限闪烁）
   * @param interval 闪烁间隔（毫秒），可使用 SPEED_FAST / SPEED_SLOW
   */
  void twinkle(int loop, int interval);

protected:
  /** 控制引脚编号（-1 表示未设置） */
  int pin = -1;
  /** 当前 LED 状态（true=点亮，false=熄灭） */
  bool state = false;
  /** 闪烁间隔（毫秒） */
  int interval = 0;
  /** 闪烁总次数（0=无限） */
  int loop = 0;
  /** 已完成的闪烁周期数 */
  int loopTimes = 0;
  /** 下一周期 LED 是否应点亮 */
  bool nextState = false;
  /** 下一周期切换时间戳（毫秒，0=不闪烁） */
  unsigned long nextTimestamp = 0;
};

#endif /* LIGHT_H_ */
