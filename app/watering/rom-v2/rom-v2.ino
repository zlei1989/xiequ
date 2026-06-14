/**
 * @file v2.0.ino
 * @brief 自动浇花系统 - 主程序入口
 *
 * 基于 ESP32 的自动浇花系统控制器，核心功能：
 * - 通过 WiFi 连接服务端，定时获取和推送设备状态
 * - 支持服务端下发的自动化浇花流程（多步骤、中断检测）
 * - 4 路水泵控制（PWM 调速/开关模式）
 * - 温度传感器 + 2 路水浸传感器检测
 * - 2 路电压采集（电源/负载电压监测）
 * - 5 个物理按钮输入（短按/长按检测）
 * - LED 指示灯状态反馈
 * - 深度睡眠省电模式（由服务端控制休眠时长）
 *
 * 系统架构：
 * - setup() 中初始化所有硬件组件、注册到 Process、配置网络
 * - loop() 中轮询各组件的 next() 方法驱动状态更新
 * - 网络状态变化时由回调触发流程执行或终止
 * - 流程执行中通过回调向服务端推送状态变更
 */
#include "config.h"
#include "utils.h"
#include <Arduino.h>
#include <cmath>
#include "AnalogSensor.h"
#include "Button.h"
#include "Light.h"
#include "Motor.h"
#include "NetworkExt.h"
#include "Process.h"
#include "Sensor.h"
#if defined(ESP8266)
#include <ESP8266WiFi.h>
#elif defined(ESP32)
#include <WiFi.h>
#endif
#include <AsyncHTTPRequest_Generic.h>

// ==================== 引脚定义 ====================

/** LED 指示灯引脚 */
#define GPIO_LED 13

/** 水泵0 控制引脚（PWM） */
#define GPIO_LOAD0 26
/** 水泵1 控制引脚（PWM） */
#define GPIO_LOAD1 33
/** 水泵2 控制引脚（PWM） */
#define GPIO_LOAD2 25
/** 水泵3 控制引脚（PWM） */
#define GPIO_LOAD3 32

/** 温度传感器引脚（模拟输入） */
#define GPIO_SENSOR0 35
/** 水浸传感器1 引脚（数字输入） */
#define GPIO_SENSOR1 0
/** 水浸传感器2 引脚（数字输入） */
#define GPIO_SENSOR2 4
/** 负载电压采集引脚（模拟输入） */
#define GPIO_SENSOR3 39
/** 电源电压采集引脚（模拟输入） */
#define GPIO_SENSOR4 36

/** 按钮0 引脚 */
#define GPIO_BUTTON0 18
/** 按钮1 引脚 */
#define GPIO_BUTTON1 19
/** 按钮2 引脚 */
#define GPIO_BUTTON2 21
/** 按钮3 引脚 */
#define GPIO_BUTTON3 22
/** 按钮4 引脚 */
#define GPIO_BUTTON4 23

// ==================== 组件实例 ====================

// 按钮（5 路，用于手动控制）
Button button0;
Button button1;
Button button2;
Button button3;
Button button4;

// 温度传感器（模拟量，1 路）
AnalogSensor sensor0;

// 水浸传感器（数字量，2 路）
Sensor sensor1;
Sensor sensor2;

// 电压采集传感器（模拟量，2 路）
AnalogSensor sensor3;
AnalogSensor sensor4;

// LED 指示灯
Light light;

// 水泵/电机（4 路，PWM 控制）
Motor load0;
Motor load1;
Motor load2;
Motor load3;

// 网络控制器
NetworkExt network;

// 业务流程处理器
Process process;

// 异步 HTTP 请求实例（用于轮询服务端状态）
AsyncHTTPRequest request;

// ==================== 全局状态 ====================

/** 是否处于空闲状态（true=空闲，false=流程执行中） */
bool _idled = true;
/** 是否已完成开机上报（true=已上报，防止重复上报） */
bool _bootstrap = false;
/** 异步请求响应是否已处理（防止 readyStateDone 状态下重复处理空响应） */
bool _asyncResponseProcessed = false;
/** 深度睡眠时长（毫秒），0 表示不启用 */
unsigned long _sleepDuration = 0;

// ==================== 回调函数前向声明 ====================

/** 网络连接成功回调 */
void networkConnectedHandler(NetworkExt *network, void *context);
/** 异步监视状态变化回调（在 ino 文件中实现，因为 AsyncHTTPRequest 依赖全局变量） */
void networkAsyncWatchStateHandler(NetworkExt *network, void *context);
/** 服务端状态变化回调 */
void networkStateChangeHandler(JsonDocument *state, NetworkExt *network,
                               void *context);
/** 流程执行变化回调 */
void processChangeHandler(Process::Change *change, Process *process,
                          void *context);
/** 流程执行结束回调 */
void processFinishHandler(Process *process, void *context);
/** 按钮信号变化回调 */
void buttonChangeHandler(int type, float value, Button *button, void *context);

/**
 * 初始设置
 * 配置引脚模式、初始化组件、注册到流程处理器、配置网络
 */
void setup()
{
  // ---- 配置数字输入引脚 ----
  pinMode(GPIO_BUTTON0, INPUT);
  pinMode(GPIO_BUTTON1, INPUT);
  pinMode(GPIO_BUTTON2, INPUT);
  pinMode(GPIO_BUTTON3, INPUT);
  pinMode(GPIO_BUTTON4, INPUT);

  // ---- 配置传感器输入引脚 ----
  pinMode(GPIO_SENSOR0, INPUT); // 温度传感器
  pinMode(GPIO_SENSOR1, INPUT); // 水浸传感器1
  pinMode(GPIO_SENSOR2, INPUT); // 水浸传感器2
  pinMode(GPIO_SENSOR3, INPUT); // 负载电压采集
  pinMode(GPIO_SENSOR4, INPUT); // 电源电压采集

  // ---- 配置 LED 输出引脚 ----
  pinMode(GPIO_LED, OUTPUT);

  // ---- 配置水泵 PWM 输出引脚 ----
  pinMode(GPIO_LOAD0, OUTPUT);
  pinMode(GPIO_LOAD1, OUTPUT);
  pinMode(GPIO_LOAD2, OUTPUT);
  pinMode(GPIO_LOAD3, OUTPUT);

  // ---- 水泵默认关闭 ----
  digitalWrite(GPIO_LOAD0, LOW);
  digitalWrite(GPIO_LOAD1, LOW);
  digitalWrite(GPIO_LOAD2, LOW);
  digitalWrite(GPIO_LOAD3, LOW);

  // ---- 初始化串口调试输出 ----
#ifdef DEBUG_MODE
  Serial.begin(115200);
  Serial.printf("\n\n");
  Serial.flush();
#endif

  // 打印启动原因（0=正常上电, 2=外部唤醒, 4=定时器唤醒）
  log("Boot {\"cause\":%d}", esp_sleep_get_wakeup_cause());

  // ---- 初始化按钮 ----
  button0.setPin(GPIO_BUTTON0);
  button0.setContext(&process);
  button0.setChangeHandler(buttonChangeHandler);
  button0.setKey("button_0");

  button1.setPin(GPIO_BUTTON1);
  button1.setContext(&process);
  button1.setChangeHandler(buttonChangeHandler);
  button1.setKey("button_1");

  button2.setPin(GPIO_BUTTON2);
  button2.setContext(&process);
  button2.setChangeHandler(buttonChangeHandler);
  button2.setKey("button_2");

  button3.setPin(GPIO_BUTTON3);
  button3.setContext(&process);
  button3.setChangeHandler(buttonChangeHandler);
  button3.setKey("button_3");

  button4.setPin(GPIO_BUTTON4);
  button4.setContext(&process);
  button4.setChangeHandler(buttonChangeHandler);
  button4.setKey("button_4");

  // ---- 初始化传感器 ----
  sensor0.setPin(GPIO_SENSOR0); // 温度传感器电压采集
  sensor1.setPin(GPIO_SENSOR1); // 水浸传感器1
  sensor2.setPin(GPIO_SENSOR2); // 水浸传感器2
  sensor3.setPin(GPIO_SENSOR3); // 负载电压采集
  sensor4.setPin(GPIO_SENSOR4); // 电源电压采集

  // ---- 初始化水泵 ----
  load0.setPin(GPIO_LOAD0);
  load1.setPin(GPIO_LOAD1);
  load2.setPin(GPIO_LOAD2);
  load3.setPin(GPIO_LOAD3);

  // ---- 初始化指示灯 ----
  light.setPin(GPIO_LED);

  // ---- 注册组件到流程处理器 ----
  // 负载组件（TYPE_LOAD）：可被流程步骤控制
  process.registerComponent(Process::TYPE_LOAD, "load_0", &load0);
  process.registerComponent(Process::TYPE_LOAD, "load_1", &load1);
  process.registerComponent(Process::TYPE_LOAD, "load_2", &load2);
  process.registerComponent(Process::TYPE_LOAD, "load_3", &load3);
  // 传感器组件（TYPE_SENSOR）：可作为中断检测源
  process.registerComponent(Process::TYPE_SENSOR, "sensor_0", &sensor0);
  process.registerComponent(Process::TYPE_SENSOR, "sensor_1", &sensor1);
  process.registerComponent(Process::TYPE_SENSOR, "sensor_2", &sensor2);
  process.registerComponent(Process::TYPE_SENSOR, "sensor_3", &sensor3);
  process.registerComponent(Process::TYPE_SENSOR, "sensor_4", &sensor4);
  // 按钮组件（TYPE_SENSOR）：可作为中断检测源
  process.registerComponent(Process::TYPE_SENSOR, "button_0", &button0);
  process.registerComponent(Process::TYPE_SENSOR, "button_1", &button1);
  process.registerComponent(Process::TYPE_SENSOR, "button_2", &button2);
  process.registerComponent(Process::TYPE_SENSOR, "button_3", &button3);
  process.registerComponent(Process::TYPE_SENSOR, "button_4", &button4);

  // 设置流程回调
  process.setChangeHandler(processChangeHandler);
  process.setFinishHandler(processFinishHandler);

  // ---- 配置网络控制器 ----
  network.setSSID(WIFI_SSID);
  network.setPassword(WIFI_PASSWORD);
  network.setProcess(&process);
  network.setConnectedHandler(networkConnectedHandler);
  network.setWatchStateHandler(networkAsyncWatchStateHandler);
  network.setStateChangeHandler(networkStateChangeHandler);

}

/**
 * 主循环
 * 轮询所有组件的 next() 方法驱动状态更新。
 * 空闲状态下不驱动水泵和流程，节省 CPU 资源。
 * 调试模式下始终驱动所有组件。
 */
void loop()
{
  // 收到睡眠指令后立即进入深睡眠（带定时唤醒）
  if (_sleepDuration > 0 && _idled) {
    log("Sleep {\"duration\":%lu}", _sleepDuration);
    Serial.flush();
    // 配置定时唤醒（参数单位：微秒）
    esp_sleep_enable_timer_wakeup(_sleepDuration * 1000ULL);
    esp_deep_sleep_start();
  }

  // 网络连接与状态轮询
  network.next();

  // 传感器轮询（始终运行）
  button0.next();
  button1.next();
  button2.next();
  button3.next();
  button4.next();
  sensor0.next(); // 温度传感器
  sensor1.next(); // 水浸传感器1
  sensor2.next(); // 水浸传感器2
  sensor3.next(); // 负载电压采集
  sensor4.next(); // 电源电压采集

  // 空闲状态下不驱动水泵和流程（调试模式除外）
#ifndef DEBUG_MODE
  if (_idled)
  {
    return;
  }
#endif
  // 水泵 PWM 渐变驱动
  load0.next();
  load1.next();
  load2.next();
  load3.next();
  // 流程执行驱动
  process.next();
}

// ==================== 回调函数实现 ====================

/**
 * 网络连接成功回调
 * 首次连接成功时上报开机信息（bootstrap），仅执行一次
 * @param network 网络对象指针
 * @param context 用户上下文指针
 */
void networkConnectedHandler(NetworkExt *network, void *context)
{
  // 已上报过则跳过
  if (_bootstrap)
  {
    return;
  }
  JsonDocument fields;
  JsonObject object = fields.to<JsonObject>();
  // 上报重启原因
  object["cause"] = esp_sleep_get_wakeup_cause();
  // 推送开机事件
  network->pushState("bootstrap", &fields);
  // 标记已上报
  _bootstrap = true;
}

/**
 * 异步监视状态变化回调
 * 使用全局 AsyncHTTPRequest 对象循环拉取服务端状态。
 * 因为 AsyncHTTPRequest 库的限制，请求对象必须定义在 ino 文件中，
 * 所以通过此回调将异步请求逻辑注入 NetworkExt。
 *
 * 通过 _busy 标志实现同步/异步 HTTP 互斥保护：
 * - 异步请求发送后设置 _busy=true，防止同步 pushState 并发
 * - 异步响应处理完成后设置 _busy=false，允许同步请求继续
 *
 * 流程：
 * 1. 检查 WiFi 连接状态
 * 2. 检查网络是否忙碌（_busy 互斥）
 * 3. 如果上次请求已完成（readyStateDone）→ 解析响应，更新状态，释放 _busy
 * 4. 如果请求可用（readyStateUnsent 或 readyStateDone）→ 发起新请求，设置 _busy
 *
 * @param network 网络对象指针
 * @param context 用户上下文指针
 */
void networkAsyncWatchStateHandler(NetworkExt *network, void *context)
{
  // 检查 WiFi 连接状态
  if (WiFi.status() != WL_CONNECTED)
  {
    log("Network Error {\"message\":\"WiFi not connected\"}");
    yield();
    return;
  }
  // 注意：不检查 isBusy()
  // 当 _busy=true 时，本回调仍需运行以检查异步请求是否已完成并处理响应。
  // _busy 标志用于防止同步 pushState 与异步请求并发，不应用于阻止异步响应处理。
  // 同步 pushState 的互斥保护由 NetworkExt::next() 中的逻辑保证：
  //   - _busy=true 时，next() 跳过 invoke 队列处理，不会调用 pushState
  //   - _busy=false 时，next() 先处理 invoke 队列，再调用本回调发起新请求

  // 处理已完成的请求响应（仅当响应尚未处理时）
  // 使用 _asyncResponseProcessed 标志防止 readyStateDone 状态下的重复处理：
  // - AsyncHTTPRequest 库的 abort() 不会重置 _readyState 为 readyStateUnsent
  // - open() 失败时 _connect() 会将 _readyState 设为 readyStateDone
  // - 若不加以标志控制，会导致无限循环：空响应→解析失败→空响应→解析失败
  if (request.readyState() == readyStateDone && !_asyncResponseProcessed)
  {
    int httpCode = request.responseHTTPcode();
    if (httpCode > 0)
    {
      // HTTP 响应成功，解析响应内容
      String payload = request.responseText();
      log("Network State {\"state\":\"%d\",\"payload\":\"%s\"}", readyStateDone,
          payload.c_str());
      // 解析响应并触发状态变化回调
      network->setStateJSONString(payload);
    }
    else
    {
      // HTTP 连接失败（如 DNS 解析失败、连接被拒绝等）
      // httpCode < 0 表示底层错误，此时 responseText() 为空，无需解析
      log("Network Error {\"httpCode\":%d,\"message\":\"%s\"}", httpCode,
          request.responseHTTPString().c_str());
    }
    // 异步请求已完成，释放忙碌标志，允许同步 pushState 继续执行
    network->_busy = false;
    // 标记响应已处理，防止下次调用时重复处理同一响应（特别是空响应）
    _asyncResponseProcessed = true;
    yield();
    // 返回让 next() 有机会处理 invoke 队列，下次定时器到期后再发新请求
    return;
  }

  // 检查是否可以发送新请求
  // readyStateUnsent: 未发送状态，可以发送
  // readyStateDone: 完成状态，可以重新发送（open() 会重置 _readyState）
  if (request.readyState() != readyStateUnsent &&
      request.readyState() != readyStateDone)
  {
    yield();
    return;
  }

  // 发起新的 GET 请求
  String url = network->getStateUrl();
  log("Network Request {\"url\":\"%s\"}", url.c_str());
  request.setTimeout(30 * 1000);
  if (request.open("GET", url.c_str()))
  {
    // 请求成功打开，重置响应处理标志
    _asyncResponseProcessed = false;
    // 设置忙碌标志，防止同步 pushState 在异步请求期间并发
    network->_busy = true;
    request.send();
    yield();
    return;
  }
  // open 失败（_connect 中 _client->connect 返回 false）
  // 此时 _readyState 已被 _connect() 设为 readyStateDone
  // 不调用 abort()，因为 _client 可能尚未完成初始化
  // 下次调用时，_asyncResponseProcessed=false 会触发错误响应处理流程
  log("Network Error {\"message\":\"Failed to open request\"}");
  network->_busy = false;
}

/**
 * 服务端状态变化回调
 * 当服务端下发新状态时，根据内容决定：
 * - switch != "on" 且有 sleepDuration → 进入深度睡眠
 * - switch != "on" → 仅终止当前流程
 * - switch == "on" 且有 process.steps → 启动新流程
 * - switch == "on" 但无 process.steps → 仅更新状态
 *
 * @param state 完整状态 JSON 文档指针
 * @param network 网络对象指针
 * @param context 用户上下文指针
 */
void networkStateChangeHandler(JsonDocument *state, NetworkExt *network,
                               void *context)
{
  // 指示灯闪烁提示收到状态更新
  light.twinkle(2, Light::SPEED_FAST);

  // 如果设备开关关闭或需要执行新流程，先终止当前流程
  if ((*state)["switch"] != "on" ||
      (*state)["process"].is<JsonObject>())
  {
    process.terminate();
    _idled = true;
    yield();
  }

  // 设备开关关闭：记录 sleepDuration（loop 中检测到后立即深度睡眠）
  if ((*state)["switch"] != "on")
  {
    if ((*state)["sleepDuration"].is<unsigned long>())
    {
      _sleepDuration = (*state)["sleepDuration"].as<unsigned long>();
      log("Sleep Duration Set {\"duration\":%lu}", _sleepDuration);
    }
    yield();
    return;
  }

  // 设备开关打开但无有效流程配置：仅更新状态
  if (!(*state)["process"].is<JsonObject>() ||
      !(*state)["process"]["steps"].is<JsonArray>())
  {
    _idled = true;
    yield();
    return;
  }

  // 启动新流程
  _idled = false;
  process.setSchema((*state).as<JsonObject>());
  // 支持从指定步骤开始执行
  if ((*state)["stepIndex"].is<int>()) {
    int stepIndex = (*state)["stepIndex"].as<int>();
    process.execute(stepIndex);
  } else {
    process.execute();
  }
}

/**
 * 流程执行变化回调
 * 当流程步骤状态变化（就绪/开始/结束/超时/中断）时，
 * 通过 network.invoke() 延迟推送变更事件到服务端
 * @param change 变化信息指针（回调负责 delete）
 * @param process 流程处理器指针
 * @param context 用户上下文指针
 */
void processChangeHandler(Process::Change *change, Process *process,
                          void *context)
{
  // 通过 invoke 延迟执行网络请求，确保网络空闲时才推送
  network.invoke(
      [](NetworkExt *network, void *context)
      {
        Process::Change *change = reinterpret_cast<Process::Change *>(context);
        // 构建推送数据
        JsonDocument fields;
        JsonObject object = fields.to<JsonObject>();
        object["stateId"] = change->stateId;
        object["type"] = change->type;
        object["message"] = change->message;
        object["stepIndex"] = change->stepIndex;
        // 推送变更事件（异步请求期间会返回 false，由 invoke 队列稍后重试）
        bool ok = network->pushState("change", &fields);
        // 无论成功或失败都释放内存（change 通过 new 创建）
        delete change;
        return ok;
      },
      change);
}

/**
 * 流程执行结束回调
 * 流程全部步骤完成后，推送完成事件到服务端
 * @param process 流程处理器指针
 * @param context 用户上下文指针
 */
void processFinishHandler(Process *process, void *context)
{
  // 通过 invoke 延迟执行网络请求
  network.invoke(
      [](NetworkExt *network, void *context)
      {
        JsonDocument fields;
        JsonObject object = fields.to<JsonObject>();
        Process *process = reinterpret_cast<Process *>(context);
        object["stateId"] = process->getStateId();
        _idled = true;
        // 推送完成事件
        return network->pushState("finish", &fields);
      },
      process);
}

/**
 * 按钮信号变化回调
 * 任何按钮按下/抬起时闪烁指示灯提示
 * @param type 事件类型（TYPE_NONE / TYPE_PRESS / TYPE_LONG_PRESS）
 * @param value 事件数值
 * @param button 按钮对象指针
 * @param context 用户上下文指针
 */
void buttonChangeHandler(int type, float value, Button *button, void *context)
{
  // 指示灯闪烁 1 次提示
  light.twinkle(1, Light::SPEED_FAST);

  // 仅处理短按事件
  if (type != Button::TYPE_PRESS) {
    return;
  }

  Process *processPtr = reinterpret_cast<Process *>(context);

  if (!_idled) {
    // ---- 运行中：万能中断，终止当前流程 ----
    log("Button Interrupt {\"key\":\"%s\",\"action\":\"terminate\"}",
        button->getKey().c_str());
    processPtr->terminate();
    _idled = true;
  } else {
    // ---- 空闲中：匹配 trigger 启动流程 ----
    String buttonKey = button->getKey();
    if (buttonKey.length() == 0) {
      return;
    }

    // 解析缓存的 processes JSON
    String processesJson = network.getProcessesCache();
    JsonDocument processesDoc;
    DeserializationError error = deserializeJson(processesDoc, processesJson);
    if (error) {
      log("Processes Parse Error {\"message\":\"%s\"}", error.c_str());
      return;
    }

    // 遍历 processes 数组，匹配 trigger
    JsonArray processes = processesDoc.as<JsonArray>();
    for (JsonObject proc : processes) {
      if (!proc["trigger"].is<const char*>()) continue;
      String trigger = proc["trigger"].as<String>();
      if (trigger == buttonKey) {
        log("Button Trigger {\"key\":\"%s\",\"process\":\"%s\"}",
            buttonKey.c_str(), proc["name"].as<const char*>());
        // 构造 setSchema 所需的 JSON（需要 stateId + process 字段）
        JsonDocument schema;
        schema["stateId"] = network.getStateId();
        schema["process"] = proc;
        processPtr->setSchema(schema);
        processPtr->execute();
        _idled = false;
        return;
      }
    }
    // 未匹配到 trigger（灯已在函数开头闪烁）
  }
}
