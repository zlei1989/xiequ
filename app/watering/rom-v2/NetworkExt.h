/**
 * @file NetworkExt.h
 * @brief 网络控制对象
 *
 * 封装 WiFi 连接管理和与服务端的 HTTP 通信。
 * 主要功能：
 * - WiFi STA 模式连接及自动重连
 * - 定时轮询服务端获取设备状态（getState）
 * - 向服务端推送事件通知（pushState）
 * - 支持异步 HTTP 请求（通过外部 AsyncHTTPRequest 驱动）
 * - 延迟回调队列（invoke），确保网络空闲时执行回调
 */
#ifndef NETWORK_H_
#define NETWORK_H_
#include "config.h"
#include "utils.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>
#if defined(ESP8266)
  #include <ESP8266WiFi.h>
#elif defined(ESP32)
  #include <WiFi.h>
#endif
#include "Process.h"
#include <HTTPClient.h>
#include <NetworkClient.h>
#include <UrlEncode.h>

// 服务端 API 路径常量
/** 获取设备状态的 API 路径 */
#define GET_STATE_URL "get-state"
/** 推送设备事件的 API 路径 */
#define PUSH_STATE_URL "push-state"

/**
 * 网络控制类
 * 管理 WiFi 连接生命周期，提供与服务端的状态同步能力。
 * 通过 next() 方法在主循环中驱动网络请求和回调处理。
 */
class NetworkExt {

public:
  /**
   * 状态变化回调函数类型
   * 当服务端返回的状态发生变化时触发
   * @param state 完整状态 JSON 文档指针
   * @param network 网络对象指针
   * @param context 用户上下文指针
   */
  typedef void (*ChangeHandler)(JsonDocument *state, NetworkExt *network,
                                void *context);
  /**
   * 网络连接成功回调函数类型
   * @param network 网络对象指针
   * @param context 用户上下文指针
   */
  typedef void (*EventHandler)(NetworkExt *network, void *context);
  /**
   * 异步监视状态变化回调函数类型
   * 用于自定义异步 HTTP 请求的响应处理
   * @param network 网络对象指针
   * @param context 用户上下文指针
   */
  typedef void (*WatchStateHandler)(NetworkExt *network, void *context);
  /**
   * 延迟回调执行函数类型
   * 在网络空闲时执行，返回 true 表示成功，false 表示稍后重试
   * @param network 网络对象指针
   * @param context 用户上下文指针
   * @return 是否执行成功
   */
  typedef bool (*InvokeHandler)(NetworkExt *network, void *context);

  /**
   * 延迟回调执行参数
   * 用于 invoke() 队列中存储待执行的回调
   */
  struct InvokeParams {
    /** 用户上下文指针 */
    void *context = nullptr;
    /** 执行方法函数指针 */
    InvokeHandler handler = nullptr;
    /** 执行结果（true=成功，false=失败需重试） */
    bool success = false;
  };

  /** 构造函数，初始化设备名称和 HTTP 客户端 */
  NetworkExt();

  /** 网络是否忙碌（异步请求进行中时为 true，防止同步请求并发冲突） */
  bool _busy = false;

  /** 发起 WiFi 连接 */
  void connect();
  /**
   * 查询网络是否忙碌
   * @return 是否忙碌
   */
  bool isBusy();
  /**
   * 设置用户上下文
   * @param value 上下文指针
   */
  void setContext(void *value);
  /**
   * 设置状态变化回调
   * @param handler 回调函数指针
   */
  void setStateChangeHandler(ChangeHandler handler);
  /**
   * 设置网络连接成功回调
   * @param handler 回调函数指针
   */
  void setConnectedHandler(EventHandler handler);
  /**
   * 设置异步监视状态变化回调
   * 设置后 watchState() 将调用此回调代替内部同步请求
   * @param handler 回调函数指针
   */
  void setWatchStateHandler(WatchStateHandler handler);
  /**
   * 添加延迟回调到执行队列
   * 回调将在网络空闲时执行，失败则稍后重试
   * @param handler 执行函数指针
   * @param context 上下文指针
   */
  void invoke(InvokeHandler handler, void *context);
  /**
   * 构造请求 URL（不含扩展参数和组件状态）
   * @param path API 路径
   * @return 完整 URL 字符串
   */
  String getUrl(String path);
  /**
   * 构造请求 URL（含扩展参数和组件状态）
   * @param path API 路径
   * @param fields 额外查询参数字段
   * @param component 是否追加组件状态到查询参数
   * @return 完整 URL 字符串
   */
  String getUrl(String path, JsonDocument *fields, bool component);
  /**
   * 获得状态查询 URL
   * @return URL 字符串
   */
  String getStateUrl();
  /**
   * 获得状态请求查询参数（包含组件状态）
   * @return 查询参数字符串
   */
  String getStateQuery();
  /**
   * 获得状态请求查询参数
   * @param fields 额外查询参数字段
   * @param component 是否追加组件状态
   * @return 查询参数字符串
   */
  String getStateQuery(JsonDocument *fields, bool component);
  /**
   * 推送事件到服务端（无扩展参数）
   * @param event 事件名称（如 "bootstrap"、"change"、"finish"）
   * @return 是否推送成功
   */
  bool pushState(String event);
  /**
   * 推送事件到服务端（含扩展参数）
   * @param event 事件名称
   * @param extendFields 扩展字段 JSON 文档指针
   * @return 是否推送成功
   */
  bool pushState(String event, JsonDocument *extendFields);
  /**
   * 绑定流程处理器（用于获取组件状态构建请求参数）
   * @param process 流程处理器指针
   */
  void setProcess(Process *process);
  /**
   * 解析服务端返回的 JSON 状态数据
   * @param value JSON 字符串
   */
  void setStateJSONString(String value);
  /**
   * 设置 WiFi SSID
   * @param value SSID 字符串
   */
  void setSSID(String value);
  /**
   * 设置 WiFi 密码
   * @param value 密码字符串
   */
  void setPassword(String value);
  /** 主循环驱动方法，处理连接、回调队列和状态轮询 */
  void next();
  /**
   * 获得当前状态标识（来自服务端下发）
   * @return 状态标识字符串
   */
  String getStateId();
  /**
   * 获得设备主机名称
   * @return 主机名称字符串
   */
  String getHostname();
  /**
   * 获得缓存的流程配置 JSON 字符串
   * @return processes JSON 字符串
   */
  String getProcessesCache();

protected:
  /**
   * WiFi 状态码转描述字符串
   * @param status WiFi 状态码
   * @return 状态描述字符串
   */
  String wifiStatusMessage(int status);

  /** 设备主机名称，格式如 "ESP32-a1b2c3d4" */
  String hostname = "ESP32-IOT";
  /** WiFi SSID */
  String ssid = "";
  /** WiFi 密码 */
  String password = "";
  /** 下次网络请求时间戳（毫秒，0=立即） */
  unsigned long nextTimestamp = 0;
  /** 同步 HTTP 客户端（用于 pushState） */
  HTTPClient httpClient;
  /** 网络客户端（HTTPClient 3.x 必需的底层传输） */
  NetworkClient networkClient;
  /** 同步方式监视服务端状态变化 */
  void watchState();
  /** 用户上下文指针 */
  void *context = nullptr;
  /** 流程处理器指针（用于获取组件状态） */
  Process *process = nullptr;
  /** 服务端返回的状态 JSON 文档 */
  JsonDocument state;
  /** 缓存的流程配置版本号 */
  String processesVersion = "";
  /** 缓存的流程配置 JSON 字符串（用于 trigger 匹配） */
  String processesCache = "[]";
  /** 网络连接成功回调 */
  EventHandler connectedHandler;
  /** 异步监视状态变化回调（设置后替代内部同步 watchState） */
  WatchStateHandler watchStateHandler;
  /** 状态变化回调 */
  ChangeHandler stateChangeHandler;
  /** 网络连接发起时间戳（0=未连接，>0=正在连接） */
  unsigned long connecting = 0;
  /** 延迟回调执行队列 */
  std::vector<InvokeParams> invokeParams;
};

#endif /* NETWORK_H_ */
