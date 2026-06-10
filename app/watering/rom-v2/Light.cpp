/**
 * @file Light.cpp
 * @brief LED 指示灯控制对象实现
 *
 * 提供点亮、熄灭和闪烁三种模式。
 * 硬件上 LED 为低电平驱动（LOW=点亮，HIGH=熄灭）。
 * 闪烁逻辑通过 next() 循环驱动，每次调用检查是否到达切换时间。
 */
#include "Light.h"

/**
 * 设置针脚标识
 * @param pinId 针脚编号
 */
void Light::setPin(int pinId) { pin = pinId; }

/**
 * 进程循环调用，驱动闪烁逻辑
 * 每次调用检查当前时间是否到达下一个切换点：
 * - 未在闪烁状态（nextTimestamp==0）→ 跳过
 * - 到达切换时间 → 交替切换亮灭
 * - 完成指定次数后 → 停止闪烁
 */
void Light::next() {
  // 引脚未设置则跳过
  if (pin < 0) {
    yield();
    return;
  }
  unsigned long now = millis();
  // 不在闪烁状态或未到切换时间则跳过
  if (nextTimestamp < 1 || now < nextTimestamp) {
    yield();
    return;
  }
  // 交替切换亮灭
  if (nextState) {
    // 点亮 LED（低电平驱动）
    digitalWrite(pin, LOW);
    nextState = false;
  } else {
    // 熄灭 LED（高电平关断）
    digitalWrite(pin, HIGH);
    nextState = true;
    // 完成一个亮灭周期，计数递增
    loopTimes++;
  }
  // 判断是否完成指定闪烁次数
  if (loop > 0 && loopTimes >= loop) {
    nextTimestamp = 0;
    state = false;
    yield();
    return;
  }
  // 设置下一次切换时间
  nextTimestamp = now + interval;
  yield();
}

/**
 * 点亮 LED
 * 输出低电平（LED 共阳接法，LOW=点亮）
 */
void Light::open() {
  log("Light Open {\"pinId\":%d}", pin);
  digitalWrite(pin, LOW);
  state = true;
}

/**
 * 熄灭 LED
 * 输出高电平（LED 共阳接法，HIGH=熄灭），同时停止闪烁
 */
void Light::close() {
  log("Light Close {\"pinId\":%d}", pin);
  digitalWrite(pin, HIGH);
  state = false;
  // 清除闪烁状态
  nextTimestamp = 0;
}

/**
 * 启动闪烁模式
 * 初始状态为点亮，然后按 interval 间隔交替亮灭。
 * @param loop 闪烁次数（0=无限闪烁）
 * @param interval 闪烁间隔（毫秒），可使用 SPEED_FAST / SPEED_SLOW
 */
void Light::twinkle(int loop, int interval) {
  log("Light Twinkle {\"pinId\":%d,\"loop\":%d,\"interval\":%d}",
      pin, loop, interval);
  // 先点亮 LED
  digitalWrite(pin, LOW);
  state = true;
  // 保存闪烁参数
  this->loop = loop;
  this->interval = interval;
  loopTimes = 0;
  // 下一个周期切换为熄灭
  nextState = false;
  nextTimestamp = millis() + interval;
}
