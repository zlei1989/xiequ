/**
 * @file NetworkExt.cpp
 * @brief 网络控制对象实现
 *
 * 封装 WiFi 连接管理和服务端 HTTP 通信的核心逻辑：
 * - WiFi STA 模式连接及自动重连
 * - 延迟回调队列（invoke）的执行
 * - 定时轮询服务端获取设备状态
 * - 向服务端推送事件通知
 * - 解析服务端返回的状态数据并触发回调
 */
#include "NetworkExt.h"
#include <cmath>

/**
 * 构造函数
 * 初始化设备主机名称和 HTTP 客户端 User-Agent
 */
NetworkExt::NetworkExt() {
  // 基于芯片ID生成唯一主机名称
  hostname = getDeviceName();
  log("Hostname {\"hostname\":\"%s\"}", hostname.c_str());
  // 设置 HTTP 客户端标识
  httpClient.setUserAgent("7qbjs for IOT v1.0.0");
}

/**
 * 主循环驱动方法
 *
 * 执行流程：
 * 1. 检查忙碌状态 → 跳过（异步请求进行中时拒绝同步操作）
 * 2. 执行延迟回调队列 → 逐个执行，失败则中断等待下次
 * 3. 检查定时休眠 → 未到时间则跳过
 * 4. WiFi 已连接 → 触发连接成功回调 + 监视状态变化
 * 5. WiFi 未连接 → 发起连接或等待重连
 */
void NetworkExt::next() {
  // 异步请求进行中时，仍需驱动异步监视回调以处理已完成的响应
  // 但跳过同步操作（invoke 队列、同步 watchState）防止并发冲突
  if (_busy) {
    if (watchStateHandler && stateChangeHandler) {
      watchStateHandler(this, context);
    }
    // 异步响应已处理完毕（_busy 被清除），继续执行后续逻辑
    if (_busy) {
      yield();
      return;
    }
  }

  // 处理延迟回调队列
  if (invokeParams.size() > 0) {
    bool fail = false;
    for (auto &params : invokeParams) {
      // 已成功的跳过
      if (params.success) {
        continue;
      }
      // 执行回调
      params.success = params.handler(this, params.context);
      // 失败则中断，稍后继续执行
      if (!params.success) {
        fail = true;
        break;
      }
    }
    // 全部成功则清空队列
    if (!fail) {
      invokeParams.clear();
    }
  }

  // 定时休眠检查
  const unsigned long now = millis();
  if (now < nextTimestamp) {
    yield();
    return;
  }

  const int status = WiFi.status();
  if (status == WL_CONNECTED) {
    // WiFi 已连接
    if (connecting) {
      // 首次连接成功，触发回调
      connecting = 0;
      log("Network Connected {\"ip\":\"%s\"}",
          WiFi.localIP().toString().c_str());
      if (connectedHandler) {
        connectedHandler(this, context);
      }
    }
    // 监视服务端状态变化
    if (stateChangeHandler) {
      if (watchStateHandler) {
        // 使用自定义异步监视回调
        watchStateHandler(this, context);
      } else {
        // 使用内部同步监视
        watchState();
      }
    }
    // 默认 15 秒后再次轮询
    nextTimestamp = now + 15000;
  } else if (connecting == 0) {
    // 首次连接：发起 WiFi 连接
    connect();
  } else if (connecting < now) {
    // 连接超时：打印错误并延迟 3 秒后重试
    const String message = wifiStatusMessage(status);
    log("Network Error {\"message\":\"network not available, %d:%s, "
        "reconnecting...\"}",
        status, message.c_str());
    nextTimestamp = now + 3000;
  } else {
    // 正在连接中：500ms 后再检查
    nextTimestamp = now + 500;
  }
  yield();
}

/**
 * 查询网络是否忙碌
 * @return 是否忙碌
 */
bool NetworkExt::isBusy() { return _busy; }

/**
 * 获得设备主机名称
 * @return 主机名称字符串
 */
String NetworkExt::getHostname() { return hostname; }

/**
 * 添加延迟回调到执行队列
 * 回调将在 next() 循环中网络空闲时执行。
 * 如果执行失败（返回 false），会在下次 next() 时重试。
 * @param handler 执行函数指针
 * @param context 上下文指针
 */
void NetworkExt::invoke(InvokeHandler handler, void *context) {
  InvokeParams params;
  params.handler = handler;
  params.context = context;
  invokeParams.push_back(params);
}

/**
 * 发起 WiFi 连接
 * 以 STA 模式连接指定 SSID，设置自动重连和主机名称
 */
void NetworkExt::connect() {
  // 缺少必要参数则跳过
  if (!ssid || !password) {
    return;
  }
  // 记录连接发起时间
  connecting = millis();
  // 配置 WiFi 参数
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostname.c_str());
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid, password);
  log("Network Connect "
      "{\"ssid\":\"%s\",\"password\":\"%s\","
      "\"macAddress\":\"%s\",\"hostname\":\"%s\"}",
      ssid.c_str(), password.c_str(), WiFi.macAddress().c_str(), hostname.c_str());
}

/**
 * WiFi 状态码转描述字符串
 * @param status WiFi 状态码
 * @return 状态描述字符串
 */
String NetworkExt::wifiStatusMessage(const int status) {
  String message = "unknown";
  switch (status) {
  case WL_IDLE_STATUS:
    message = "idle";
    break;
  case WL_NO_SSID_AVAIL:
    message = "ssid avail";
    break;
  case WL_SCAN_COMPLETED:
    message = "scan completed";
    break;
  case WL_CONNECTED:
    message = "connected";
    break;
  case WL_CONNECT_FAILED:
    message = "connect failed";
    break;
  case WL_CONNECTION_LOST:
    message = "connection lost";
    break;
  case WL_DISCONNECTED:
    message = "disconnected";
    break;
  case WL_NO_SHIELD:
    message = "no shield";
    break;
  default:
    message = String(WiFi.status());
    break;
  }
  return message;
}

/**
 * 设置用户上下文
 * @param value 上下文指针
 */
void NetworkExt::setContext(void *value) { context = value; }

/**
 * 设置网络连接成功回调
 * @param handler 回调函数指针
 */
void NetworkExt::setConnectedHandler(EventHandler handler) {
  connectedHandler = handler;
}

/**
 * 设置异步监视状态变化回调
 * 设置后 next() 中的状态轮询将调用此回调代替内部同步请求
 * @param handler 回调函数指针
 */
void NetworkExt::setWatchStateHandler(WatchStateHandler handler) {
  watchStateHandler = handler;
}

/**
 * 设置状态变化回调
 * 当服务端返回的状态标记 changed=true 时触发
 * @param handler 回调函数指针
 */
void NetworkExt::setStateChangeHandler(ChangeHandler handler) {
  stateChangeHandler = handler;
}

/**
 * 同步方式监视服务端状态变化
 * 向服务端发起 GET 请求获取最新设备状态，
 * 成功后调用 setStateJSONString() 解析并触发回调
 */
void NetworkExt::watchState() {
  // 构造请求 URL
  String url = getUrl(GET_STATE_URL);
  log("Network API Params {\"url\":\"%s\"}", url.c_str());
  // 发起同步 GET 请求
  httpClient.begin(networkClient, url);
  httpClient.setTimeout(15000);
  const int httpCode = httpClient.GET();
  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
      String payload = httpClient.getString();
      log("Network API Data %s", payload.c_str());
      // 解析响应并触发回调
      this->setStateJSONString(payload);
    }
  } else {
    log("Network HTTP Error {\"message\":\"GET failed, %s\"}",
        httpClient.errorToString(httpCode).c_str());
  }
  httpClient.end();
}

/**
 * 获得状态查询 URL
 * @return URL 字符串
 */
String NetworkExt::getStateUrl() {
  return getUrl(GET_STATE_URL);
}

/**
 * 解析服务端返回的 JSON 状态数据
 * 1. 检查 processesVersion 并缓存 processes（每次响应都检查）
 * 2. 检查 sleep 字段调整下次轮询间隔
 * 3. 检查 changed==true 时触发状态变化回调
 * @param value JSON 字符串
 */
void NetworkExt::setStateJSONString(String value) {
  // 反序列化 JSON
  DeserializationError error = deserializeJson(state, value);
  if (error) {
    log("Network HTTP Error {\"message\":\"parse JSON failed\"}");
    return;
  }

  // 1. 检查 processesVersion（每次响应都检查，不依赖 changed 标志）
  if (state["processesVersion"].is<const char*>()) {
    String newVersion = state["processesVersion"].as<String>();
    if (newVersion != processesVersion || processesVersion.length() == 0) {
      processesVersion = newVersion;
      if (state["processes"].is<JsonArray>()) {
        // 序列化 processes 为 JSON 字符串存储
        String processesJson;
        serializeJson(state["processes"], processesJson);
        processesCache = processesJson;
        log("Processes Cache Updated {\"version\":\"%s\"}", processesVersion.c_str());
      }
    }
  }

  // 2. 调整轮询间隔
  if (state["sleep"].is<unsigned int>()) {
    nextTimestamp = millis() + state["sleep"].as<unsigned int>();
  }

  // 2b. 提取睡眠时长（必须不依赖 changed 标志，保持和 sleep 字段一致的处理逻辑）
  // 原因：sleepDuration 首次出现在响应中时 changed 通常已为 false，
  // 若仅在 stateChangeHandler 中处理会导致 ROM 永远无法进入深睡眠。
  if (state["sleepDuration"].is<unsigned long>()) {
    _sleepDuration = state["sleepDuration"].as<unsigned long>();
    log("Network Sleep Duration Set {\"duration\":%lu,\"changed\":%s}",
        _sleepDuration, state["changed"] ? "true" : "false");
  } else {
    _sleepDuration = 0; // 响应中无 sleepDuration 时清除，防止使用过期值
  }

  // 3. 状态变化时触发回调（去掉 code 检查）
  if (state["changed"] == true) {
    stateChangeHandler(&state, this, context);
  }
}

/**
 * 构造请求 URL（不含扩展参数和组件状态）
 * 使用 String 动态拼接，避免固定缓冲区溢出风险
 * @param path API 路径
 * @return 完整 URL 字符串
 */
String NetworkExt::getUrl(String path) {
  String query = getStateQuery();
  return String(URL_PREFIX) + path + "?" + query;
}

/**
 * 构造请求 URL（含扩展参数和组件状态）
 * 使用 String 动态拼接，避免固定缓冲区溢出风险
 * @param path API 路径
 * @param fields 额外查询参数字段 JSON 文档指针
 * @param component 是否追加组件状态到查询参数
 * @return 完整 URL 字符串
 */
String NetworkExt::getUrl(String path, JsonDocument *fields, bool component) {
  String query = getStateQuery(fields, component);
  return String(URL_PREFIX) + path + "?" + query;
}

/**
 * 获得状态请求查询参数（包含组件状态）
 * @return 查询参数字符串
 */
String NetworkExt::getStateQuery() {
  JsonDocument fields;
  return getStateQuery(&fields, true);
}

/**
 * 获得状态请求查询参数
 *
 * 构建流程：
 * 1. 追加基础字段（macAddress, chipId）
 * 2. 追加 fields 中的自定义参数
 * 3. 追加服务端下发的 state 字段（排除内部字段和重复字段）
 * 4. 追加组件状态（传感器状态 + 负载当前值）
 *
 * @param fields 额外查询参数字段 JSON 文档指针
 * @param component 是否追加组件状态
 * @return 查询参数字符串
 */
String NetworkExt::getStateQuery(JsonDocument *fields, bool component) {
  // 1. 追加基础字段
  String query = "macAddress=" + urlEncode(WiFi.macAddress());
  query += "&chipId=" + String(getChipId());

  // 2. 追加 fields 中的自定义参数
  if (fields != nullptr) {
    JsonObject submitFields = fields->as<JsonObject>();
    if (submitFields.isNull() == false) {
      for (JsonPair kv : submitFields) {
        // 将 JSON 值序列化为字符串，支持 string / int / bool / float 四种类型
        String value;
        if (kv.value().is<const char *>()) {
          value = kv.value().as<String>();
        } else if (kv.value().is<int>()) {
          value = String(kv.value().as<int>());
        } else if (kv.value().is<bool>()) {
          value = String(kv.value().as<bool>() ? 1 : 0);
        } else if (kv.value().is<float>()) {
          value = String(kv.value().as<float>());
        } else {
          continue;
        }
        // 将 key 转换为 String 避免悬空指针
        const char *keyPtr = kv.key().c_str();
        if (keyPtr == nullptr) {
          continue;
        }
        const String key = String(keyPtr);
        if (key.length() == 0) {
          continue;
        }
        String pair = urlEncode(key) + "=" + urlEncode(value);
        query += "&" + pair;
      }
    }
  }

  // 3. 追加服务端下发的 state 字段
  // 排除内部字段（chipId, macAddress, sleep, changed, process, processes, processesVersion, sleepDuration）
  // 排除 fields 中已存在的字段（避免重复）
  if (state.is<JsonObject>()) {
    JsonObject stateFields = state.as<JsonObject>();
    if (stateFields.isNull() == false) {
      JsonObject submitFields = (fields != nullptr) ? fields->as<JsonObject>() : JsonObject();
      for (JsonPair kv : stateFields) {
        const char *keyPtr = kv.key().c_str();
        if (keyPtr == nullptr) {
          continue;
        }
        String keyStr = String(keyPtr);
        if (keyStr.length() == 0) {
          continue;
        }
        // 跳过内部保留字段
        if (keyStr.equalsIgnoreCase("chipId") ||
            keyStr.equalsIgnoreCase("macAddress") ||
            keyStr.equalsIgnoreCase("sleep") ||
            keyStr.equalsIgnoreCase("changed") ||
            keyStr.equalsIgnoreCase("process") ||
            keyStr.equalsIgnoreCase("processes") ||
            keyStr.equalsIgnoreCase("processesVersion") ||
            keyStr.equalsIgnoreCase("sleepDuration")) {
          continue;
        }
        // 跳过 fields 中已存在的字段
        if (submitFields.isNull() == false && submitFields[keyStr].is<JsonVariant>()) {
          continue;
        }
        // 将 JSON 值序列化为字符串，支持 string / int / bool / float 四种类型
        String value;
        if (kv.value().is<const char *>()) {
          value = kv.value().as<String>();
        } else if (kv.value().is<int>()) {
          value = String(kv.value().as<int>());
        } else if (kv.value().is<bool>()) {
          value = String(kv.value().as<bool>() ? 1 : 0);
        } else if (kv.value().is<float>()) {
          value = String(kv.value().as<float>());
        } else {
          continue;
        }
        String pair = urlEncode(keyStr) + "=" + urlEncode(value);
        query += "&" + pair;
      }
    }
  }

  // 4. 追加组件状态（传感器状态 + 负载当前值）
  if (component && process) {
    // 传感器状态，前缀 "sensor:"
    std::vector<String> keys0 = process->getComponentKeys(Process::TYPE_SENSOR);
    for (const String &key : keys0) {
      void *componentPtr = process->getComponentValue(key);
      if (componentPtr != nullptr) {
          long state = (*(IInterruptComponent *)componentPtr).getState();
          String pair = urlEncode("sensor:" + key) + "=" + String(state);
          query += "&" + pair;
      }
    }
    // 负载当前值，前缀 "load:"
    std::vector<String> keys1 = process->getComponentKeys(Process::TYPE_LOAD);
    for (const String &key : keys1) {
      void *componentPtr = process->getComponentValue(key);
      if (componentPtr != nullptr) {
          long value = (*(IStepComponent *)componentPtr).getValue();
          String pair = urlEncode("load:" + key) + "=" + String(value);
          query += "&" + pair;
      }
    }
  }
  return query;
}

/**
 * 推送事件到服务端（无扩展参数）
 * @param event 事件名称
 * @return 是否推送成功
 */
bool NetworkExt::pushState(String event) {
  return this->pushState(event, nullptr);
}

/**
 * 推送事件到服务端（含扩展参数）
 * 构造包含事件名称和扩展字段的 URL，发起同步 GET 请求。
 * 当异步请求进行中（_busy==true）时拒绝发起请求，返回 false，
 * 调用方（invoke 队列）会在下次循环时重试。
 * @param event 事件名称（如 "bootstrap"、"change"、"finish"）
 * @param extendFields 扩展字段 JSON 文档指针
 * @return 是否推送成功
 */
bool NetworkExt::pushState(String event, JsonDocument *extendFields) {
  // 异步请求进行中时不发起同步请求，防止并发冲突
  if (_busy) {
    return false;
  }

  bool ok = false;
  // 构建请求字段
  JsonDocument fields;
  JsonObject object = fields.to<JsonObject>();
  object["event"] = event;

  // 合并扩展参数（支持 string / int / bool / float 四种类型，
  // 统一转为字符串存入 fields，与 getStateQuery 的类型处理逻辑一致）
  if (extendFields) {
    JsonObject extendIter = extendFields->as<JsonObject>();
    if (extendIter.isNull() == false) {
      for (JsonPair kv : extendIter) {
        // 按 string / int / bool / float 顺序尝试转换，与 getStateQuery 相同
        String value;
        if (kv.value().is<const char *>()) {
          value = kv.value().as<String>();
        } else if (kv.value().is<int>()) {
          value = String(kv.value().as<int>());
        } else if (kv.value().is<bool>()) {
          value = String(kv.value().as<bool>() ? 1 : 0);
        } else if (kv.value().is<float>()) {
          value = String(kv.value().as<float>());
        } else {
          continue;
        }
        const char *keyPtr = kv.key().c_str();
        if (keyPtr == nullptr || strlen(keyPtr) == 0) {
          continue;
        }
        object[keyPtr] = value;
      }
    }
  }

  // 构造请求 URL
  String url = getUrl(PUSH_STATE_URL, &fields, true);
  log("Network API Params {\"url\":\"%s\"}", url.c_str());

  // 发起同步 GET 请求
  httpClient.begin(networkClient, url);
  httpClient.setTimeout(15000);
  int httpCode = httpClient.GET();
  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK) {
      String payload = httpClient.getString();
      log("Network API Data {\"payload\":\"%s\"}", payload.c_str());
      ok = true;
    }
  } else {
    log("Network HTTP Error {\"message\":\"GET failed, %s\"}",
        httpClient.errorToString(httpCode).c_str());
  }
  httpClient.end();
  return ok;
}

/**
 * 绑定流程处理器
 * @param process 流程处理器指针
 */
void NetworkExt::setProcess(Process *process) { this->process = process; }

/**
 * 设置 WiFi SSID
 * @param value SSID 字符串
 */
void NetworkExt::setSSID(String value) { this->ssid = value; }

/**
 * 设置 WiFi 密码
 * @param value 密码字符串
 */
void NetworkExt::setPassword(String value) { this->password = value; }

/**
 * 获得当前状态标识
 * @return 状态标识字符串（来自服务端下发的 stateId）
 */
String NetworkExt::getStateId() { return state["stateId"]; }

/**
 * 获得缓存的流程配置 JSON 字符串
 * @return processes JSON 字符串
 */
String NetworkExt::getProcessesCache() { return processesCache; }
