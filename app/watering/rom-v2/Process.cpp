/**
 * @file Process.cpp
 * @brief 业务流程处理器实现
 *
 * 管理和执行由服务端下发的自动化浇花流程。
 * 流程由多个步骤（Step）顺序执行，每个步骤控制一个负载组件，
 * 并可配置中断条件（Interrupt）用于提前结束步骤。
 *
 * 执行时序：
 * 1. calculateStep() 计算延迟启动和超时时间戳
 * 2. next() 循环检测：等待延迟 → 开始执行 → 检测超时/中断 → 结束步骤 → 下一步
 * 3. 全部步骤完成后触发 finishHandler 回调
 */
#include "Process.h"

/**
 * 进程循环调用，驱动流程执行
 *
 * 核心状态机：
 * - processing==false：流程未运行，直接返回
 * - current.processing==true：步骤正在执行中
 *   - 检查超时 → 强制结束当前步骤
 *   - 检查中断条件 → 满足时结束当前步骤
 *   - 正常执行中 → 等待
 *   - 步骤结束 → 关闭负载，推进到下一步或完成流程
 * - current.processing==false：步骤就绪，等待下一轮 next() 调用
 *   - 立即标记开始执行，写入启动参数（delay 已删除）
 */
void Process::next() {
  // 流程未运行则跳过
  if (!processing) {
    yield();
    return;
  }
  unsigned long now = millis();

  // ---- 步骤执行中 ----
  if (current.processing) {
    bool waiting = true;

    // 检查步骤超时
    if (current.expire > 0 && now >= current.expire) {
      log("Process Step Timeout "
          "{\"index\":%d,\"name\":\"%s\",\"value\":\"%s\","
          "\"process\":\"%s\",\"stateId\":\"%s\"}",
          current.index, steps[current.index].name.c_str(),
          steps[current.index].value.end.c_str(), name.c_str(),
          stateId.c_str());
      // 通知超时事件
      if (changeHandler) {
        char buffer[256];
        sprintf(buffer,
                "{processName:%s}流程的{stepName:%s}{stepId:%d}环节持续{"
                "timeout:%lu}秒超时。",
                name.c_str(), steps[current.index].name.c_str(), current.index,
                (unsigned long)((now - current.executeTime) / 1000));
        Change *change = new Change();
        change->stateId = stateId;
        change->type = "step_timeout";
        change->stepIndex = current.index;
        change->message = String(buffer);
        changeHandler(change, this, context);
      }
      waiting = false;
    }

    // 遍历检查所有中断条件
    for (int i = 0; waiting && i < steps[current.index].interruptCount; i++) {
      bool ok = checkInterruptState(&steps[current.index],
                                    &steps[current.index].interrupts[i],
                                    &current, now, i);
      if (ok) {
        log("Process Step Interrupt "
            "{\"index\":%d,\"name\":%s,\"state\":%s,\"step\":\"%s\","
            "\"process\":\"%s\",\"stateId\":\"%s\"}",
            i, steps[current.index].interrupts[i].name.c_str(),
            steps[current.index].interrupts[i].state ? "true" : "false",
            steps[current.index].name.c_str(), name.c_str(), stateId.c_str());
        // 通知中断事件
        if (changeHandler) {
          char buffer[256];
          sprintf(buffer,
                  "{processName:%s}流程的{stepName:%s}{stepId:%d}环节已被{"
                  "interruptName:%s}{interruptId:%d}{componentKey:%s}{state:%s}"
                  "中断。",
                  name.c_str(), steps[current.index].name.c_str(),
                  current.index,
                  steps[current.index].interrupts[i].name.c_str(), i,
                  steps[current.index].interrupts[i].componentKey.c_str(),
                  steps[current.index].interrupts[i].state ? "true" : "false");
          Change *change = new Change();
          change->stateId = stateId;
          change->type = "step_interrupt";
          change->stepIndex = current.index;
          change->message = String(buffer);
          changeHandler(change, this, context);
        }
        waiting = false;
      }
    }

    // 正常执行中，等待超时或中断
    if (waiting) {
      yield();
      return;
    }

    // ---- 步骤结束处理 ----
    log("Process Step End "
        "{\"index\":%d,\"name\":\"%s\",\"value\":\"%s\",\"process\":\"%s\","
        "\"stateId\":\"%s\"}",
        current.index, steps[current.index].name.c_str(),
        steps[current.index].value.end.c_str(), name.c_str(), stateId.c_str());
    // 通知步骤结束事件
    if (changeHandler) {
      char buffer[256];
      sprintf(buffer,
              "{processName:%s}流程的{stepName:%s}{stepId:%d}环节结束。负载{"
              "componentKey:%s}{value:%s}已关闭。环节持续{stepDuration:%lu}"
              "秒，流程持续{duration:%lu}秒。",
              name.c_str(), steps[current.index].name.c_str(), current.index,
              steps[current.index].componentKey.c_str(),
              steps[current.index].value.end.c_str(),
              (unsigned long)((now - current.executeTime) / 1000),
              (unsigned long)((now - executeTime) / 1000));
      Change *change = new Change();
      change->stateId = stateId;
      change->type = "step_end";
      change->stepIndex = current.index;
      change->message = String(buffer);
      changeHandler(change, this, context);
    }

    // 向负载写入结束参数（关闭或复位）
    if (steps[current.index].component != nullptr) {
      (*(IStepComponent *)steps[current.index].component)
          .setJsonValue(steps[current.index].value.end.c_str());
    }

    // 推进到下一步
    current.index += 1;
    // 检查是否全部完成
    if (current.index >= stepCount) {
      processing = false;
      current.processing = false;
      int duration = (now - executeTime) / 1000;
      log("Process Finish {\"name\":\"%s\",\"duration\":%d,\"stateId\":\"%s\"}",
          name.c_str(), duration, stateId.c_str());
      // 触发流程完成回调
      if (finishHandler) {
        finishHandler(this, context);
      }
      return;
    }
    // 计算下一步的执行时间参数
    calculateStep(&current, &steps[current.index]);

  // ---- 步骤就绪，立即开始执行（delay 已删除） ----
  } else {
    // delay 已删除，步骤就绪即立即开始执行
    current.processing = true;
    log("Process Step Begin "
        "{\"index\":%d,\"name\":\"%s\",\"value\":\"%s\",\"process\":\"%s\","
        "\"stateId\":\"%s\"}",
        current.index, steps[current.index].name.c_str(),
        steps[current.index].value.begin.c_str(), name.c_str(),
        stateId.c_str());
    // 通知步骤开始事件
    if (changeHandler) {
      char buffer[256];
      sprintf(buffer,
              "{processName:%s}流程的{stepName:%s}{stepId:%d}环节开始执行。负载{componentKey:%s}{value:%s}已打开。",
              name.c_str(), steps[current.index].name.c_str(), current.index,
              steps[current.index].componentKey.c_str(),
              steps[current.index].value.begin.c_str());
      Change *change = new Change();
      change->stateId = stateId;
      change->type = "step_begin";
      change->stepIndex = current.index;
      change->message = String(buffer);
      changeHandler(change, this, context);
    }
    // 向负载写入启动参数
    if (steps[current.index].component != nullptr) {
      (*(IStepComponent *)steps[current.index].component)
          .setJsonValue(steps[current.index].value.begin);
    }
  } // end if (current.processing)
}

/**
 * 获得会话标识
 * @return 会话标识字符串
 */
String Process::getStateId() { return stateId; }

/**
 * 设置上下文
 * @param value 上下文指针
 */
void Process::setContext(void *value) { context = value; }

/**
 * 设置流程变化回调
 * @param handler 回调函数指针
 */
void Process::setChangeHandler(ChangeHandler handler) {
  changeHandler = handler;
}

/**
 * 设置流程结束回调
 * @param handler 回调函数指针
 */
void Process::setFinishHandler(FinishHandler handler) {
  finishHandler = handler;
}

/**
 * 设置流程描述
 * 从 JSON 文档解析流程配置，构建内部步骤和中断结构。
 * 会先清除之前的步骤数据再重新解析。
 * @param value 流程配置 JSON 文档
 */
void Process::setSchema(JsonDocument value) {
  // 清空历史数据
  clearSteps();
  // 设置会话标识
  stateId = value["stateId"].as<String>();
  // 设置流程名称
  name = value["process"]["name"].as<String>();
  // 校验 steps 字段
  if (value["process"]["steps"].is<JsonArray>() != true) {
    log("Process Schema Error {\"message\":\"steps not array in %s\"}",
        name.c_str());
    return;
  }
  // 校验步骤数量
  stepCount = value["process"]["steps"].size();
  if (stepCount < 1) {
    log("Process Schema Error {\"message\":\"steps empty in %s\"}",
        name.c_str());
    return;
  }
  // 分配步骤数组并逐个初始化
  steps = new Step[stepCount]();
  for (int i = 0; i < stepCount; i++) {
    initStep(&steps[i], value["process"]["steps"][i], i);
  }
}

/**
 * 初始化步骤
 * 从 JSON 对象解析步骤配置，包括名称、延迟、超时、组件关联、运行参数和中断条件
 * @param step 步骤结构指针
 * @param stepSchema 步骤配置 JSON 对象
 * @param index 步骤索引
 */
void Process::initStep(Step *step, JsonObject stepSchema, int index) {
  // 设置步骤名称
  step->name = String(stepSchema["name"]);
  // 设置执行超时时间（毫秒）
  if (stepSchema["timeout"].is<unsigned long>()) {
    step->timeout = stepSchema["timeout"].as<unsigned long>();
  }
  // 关联负载组件
  step->componentKey = stepSchema["component"].as<String>();
  step->component = getComponentValue(step->componentKey);
  // 校验组件是否存在
  if (step->component == nullptr) {
    log("Process Schema Error {\"message\":\"step(%s:%d) component(%s) is "
        "nullptr\"}",
        step->name.c_str(), index, step->componentKey.c_str());
  }
  // 解析运行参数（begin/end）
  if (stepSchema["value"].is<JsonObject>()) {
    parseValue(&step->value, stepSchema["value"].as<JsonObject>());
  }
  // 校验中断条件配置
  if (stepSchema["interrupts"].is<JsonArray>() != true) {
    log("Process Schema Warning {\"message\":\"interrupts not exists or not "
        "array\",\"step\":\"%s\"}",
        step->name.c_str());
    return;
  }
  // 校验中断条件数量
  step->interruptCount = stepSchema["interrupts"].size();
  if (step->interruptCount < 1) {
    log("Process Schema Warning {\"message\":\"interruptCount "
        "empty\",\"step\":\"%s\"}",
        step->name.c_str());
    return;
  }
  // 分配中断数组并逐个初始化
  step->interrupts = new Interrupt[step->interruptCount]();
  for (int i = 0; i < step->interruptCount; i++) {
    initInterrupt(&step->interrupts[i], stepSchema["interrupts"][i], i, step);
  }
}

/**
 * 初始化步骤的中断条件
 * 从 JSON 对象解析中断配置，包括名称、延迟、持续时间、组件关联和期望状态
 * @param interrupt 中断结构指针
 * @param interruptSchema 中断配置 JSON 对象
 * @param index 中断索引
 * @param step 所属步骤结构指针
 */
void Process::initInterrupt(Interrupt *interrupt, JsonObject interruptSchema,
                            int index, Step *step) {
  // 设置中断名称
  interrupt->name = String(interruptSchema["name"]);
  // 设置中断检测延迟（步骤开始后多久开始检测）
  if (interruptSchema["delay"].is<unsigned long>()) {
    interrupt->delay = interruptSchema["delay"].as<unsigned long>();
  }
  // 设置中断检测持续时间（超过此时间后停止检测）
  if (interruptSchema["duration"].is<unsigned long>()) {
    interrupt->duration = interruptSchema["duration"].as<unsigned long>();
  }
  // 设置有效信号变化间隔（过滤抖动）
  if (interruptSchema["intercept"].is<unsigned int>()) {
    interrupt->intercept = interruptSchema["intercept"].as<unsigned int>();
  }
  // 关联传感器组件
  interrupt->componentKey = interruptSchema["component"].as<String>();
  interrupt->component = getComponentValue(interrupt->componentKey);
  // 校验组件是否存在
  if (interrupt->component == nullptr) {
    log("Process Schema Error {\"message\":\"interrupt(%s:%d) component(%s) is "
        "nullptr\",\"step\":\"%s\",\"process\":\"%s\"}",
        interrupt->name.c_str(), index, interrupt->componentKey.c_str(),
        step->name.c_str(), name.c_str());
  }
  // 设置期望状态（支持布尔值和整数值）
  if (interruptSchema["state"].is<bool>()) {
    interrupt->state = interruptSchema["state"].as<bool>() ? 1 : 0;
  } else if (interruptSchema["state"].is<int>()) {
    interrupt->state = interruptSchema["state"].as<int>();
  }
  // 解析信号类型（可选，默认 "digital"）
  if (interruptSchema["signalType"].is<const char*>()) {
    interrupt->signalType = interruptSchema["signalType"].as<String>();
  }
  // 解析逻辑比较符（可选，默认 "==")
  if (interruptSchema["logic"].is<const char*>()) {
    interrupt->logic = interruptSchema["logic"].as<String>();
  }
  // 解析模拟量触发阈值（可选，默认 0）
  if (interruptSchema["threshold"].is<long>()) {
    interrupt->threshold = interruptSchema["threshold"].as<long>();
  }
}

/**
 * 注册组件到流程处理器
 * @param type 组件类型（TYPE_LOAD / TYPE_SENSOR）
 * @param key 组件标识键名
 * @param value 组件对象指针
 * @return 是否注册成功
 */
bool Process::registerComponent(int type, String key, void *value) {
  Component cmp;
  cmp.type = type;
  cmp.key = key;
  cmp.value = value;
  components.insert(std::make_pair(key, cmp));
  size_t size = components.size();
  log("Register Component {\"index\":%zu,\"type\":%d,\"key\":\"%s\"}", size - 1,
      type, key.c_str());
  return true;
}

/**
 * 销毁已注册的组件
 * @param key 组件标识键名
 * @return 是否销毁成功
 */
bool Process::unregisterComponent(String key) {
  components.erase(key);
  return true;
}

/**
 * 获得组件对象指针
 * @param key 组件标识键名
 * @return 组件对象指针，未找到返回 nullptr
 */
void *Process::getComponentValue(String key) {
  auto target = components.find(key);
  if (target != components.end()) {
    return target->second.value;
  }
  log("Process Component Error {\"message\":\"%s component not found\"}",
      key.c_str());
  return nullptr;
}

/**
 * 检查中断条件是否满足
 * 依次检查：
 * 1. 延迟检测期：步骤开始后未超过 interrupt.delay 时不检测
 * 2. 检测有效期：超过 interrupt.delay + interrupt.duration 后停止检测
 * 3. 组件存在性：组件指针为空则跳过
 * 4. 抖动过滤：信号变化时间间隔小于 intercept 时忽略
 * 5. 状态比对：当前状态等于期望状态时触发中断
 * @param step 步骤结构指针
 * @param interrupt 中断结构指针
 * @param current 当前执行状态指针
 * @param now 当前时间戳（毫秒）
 * @param index 中断索引
 * @return 是否满足中断条件
 */
bool Process::checkInterruptState(Step *step, Interrupt *interrupt,
                                  Current *current, unsigned long now,
                                  int index) {
  // 延迟检测期：未超过延迟时间则不检测
  if (interrupt->delay > 0 && interrupt->delay + current->executeTime > now) {
    return false;
  }
  // 检测有效期：超过持续检测时间后不再检测
  if (interrupt->duration > 0 &&
      interrupt->delay + interrupt->duration + current->executeTime < now) {
    return false;
  }
  // 组件不存在则无法检测
  if (interrupt->component == nullptr) {
    return false;
  }
  // 抖动过滤：信号变化间隔小于阈值则忽略
  unsigned long lastTimestamp =
      (*(IInterruptComponent *)interrupt->component).getLastTimestamp();
  if (now - lastTimestamp < interrupt->intercept) {
    return false;
  }
  long currentState = (*(IInterruptComponent *)interrupt->component).getState();

  // 模拟量模式：根据 logic 比较 currentState 与 threshold
  if (interrupt->signalType == "analog") {
    if (interrupt->logic == ">")  return currentState > interrupt->threshold;
    if (interrupt->logic == "<")  return currentState < interrupt->threshold;
    if (interrupt->logic == ">=") return currentState >= interrupt->threshold;
    if (interrupt->logic == "<=") return currentState <= interrupt->threshold;
    return currentState == interrupt->threshold;  // "==" fallback
  }

  // 数字量模式：原有等值比较
  return currentState == interrupt->state;
}

/**
 * 解析组件运行参数
 * 从 JSON 对象提取 begin 和 end 字段，序列化为字符串供组件使用
 * @param result 结果结构指针
 * @param value 参数配置 JSON 对象
 */
void Process::parseValue(ComponentValue *result, JsonObject value) {
  char output[512];
  if (value["begin"].is<JsonVariant>()) {
    serializeJson(value["begin"], output);
    result->begin = String(output);
  }
  if (value["end"].is<JsonVariant>()) {
    serializeJson(value["end"], output);
    result->end = String(output);
  }
}

/**
 * 清空步骤列表
 * 释放中断数组和步骤数组的动态分配内存，重置步骤计数
 */
void Process::clearSteps() {
  // 释放每一步的中断条件数组
  for (int i = 0; i < stepCount; i++) {
    if (steps[i].interrupts != nullptr) {
      delete[] steps[i].interrupts;
      steps[i].interrupts = nullptr;
    }
  }
  // 释放步骤数组
  if (steps != nullptr) {
    delete[] steps;
    steps = nullptr;
  }
  // 重置计数
  stepCount = 0;
}

/**
 * 启动流程执行
 * 重置执行状态，计算第一步的时间参数
 */
void Process::execute() {
  // 校验步骤数据
  if (steps == nullptr) {
    return;
  }
  // 重置执行状态
  current.index = 0;
  processing = true;
  executeTime = millis();
  // 计算第一步的执行时间参数
  calculateStep(&current, &steps[current.index]);
}

/**
 * 从指定步骤启动流程执行
 * 与 execute() 逻辑相同，但从 startStep 开始而非步骤 0。
 * 边界检查：startStep 越界时回退到 0。
 * @param startStep 起始步骤索引（0-based）
 */
void Process::execute(int startStep) {
  if (steps == nullptr) {
    return;
  }
  // 边界检查：越界时从 0 开始
  if (startStep < 0 || startStep >= stepCount) {
    startStep = 0;
  }
  current.index = startStep;
  processing = true;
  executeTime = millis();
  calculateStep(&current, &steps[current.index]);
}

/**
 * 计算步骤执行时间参数
 * 设置延迟启动时间、超时时间戳，并通知步骤就绪
 * @param current 当前执行状态指针
 * @param step 步骤结构指针
 */
void Process::calculateStep(Current *current, Step *step) {
  // 标记为延迟等待状态（delay 已删除，步骤立即就绪）
  current->processing = false;
  // 记录当前时间
  current->executeTime = millis();
  // 计算超时时间戳（0 表示不超时）
  if (step->timeout > 0) {
    current->expire = current->executeTime + step->timeout;
  } else {
    current->expire = 0;
  }
  // 打印就绪日志
  log("Process Step Ready "
      "{\"name\":\"%s\",\"executeTime\":%lu,"
      "\"expire\":%lu,\"process\":\"%s\",\"stateId\":\"%s\"}",
      step->name.c_str(), (unsigned long)current->executeTime,
      (unsigned long)current->expire,
      name.c_str(), stateId.c_str());
  // 通知步骤就绪事件
  if (changeHandler) {
    char buffer[256];
    sprintf(buffer,
            "{processName:%s}流程的{stepName:%s}{stepId:%d}"
            "环节已经准备就绪，执行{expire:%lu}"
            "秒后超时。",
            name.c_str(), step->name.c_str(), current->index,
            (unsigned long)((current->expire - current->executeTime) / 1000));
    Change *change = new Change();
    change->stateId = stateId;
    change->type = "step_ready";
    change->message = String(buffer);
    changeHandler(change, this, context);
  }
}

/**
 * 终止当前流程
 * 关闭当前步骤正在运行的负载，通知步骤结束事件，但不触发流程完成回调。
 * 安全处理：当步骤数据为空时仅清除标志，不访问空指针。
 */
void Process::terminate() {
  // 清除运行标志
  processing = false;
  // 步骤数据为空或当前无正在执行的步骤，仅清除标志
  if (steps == nullptr || !current.processing) {
    current.processing = false;
    return;
  }
  unsigned long now = millis();
  current.processing = false;
  // 安全检查：当前索引是否在有效范围内
  if (current.index < 0 || current.index >= stepCount) {
    return;
  }
  // 打印终止日志
  log("Process Terminate "
      "{\"processName\":\"%s\",\"stepName\":\"%s\",\"stepId:%d\","
      "\"componentKey\":\"%s\",\"componentValue\":\"%s\",\"stepDuration\":\"%"
      "lu\",\"duration\":\"%lu\",\"stateId\":\"%s\"}",
      name.c_str(), steps[current.index].name.c_str(), current.index,
      steps[current.index].componentKey.c_str(),
      steps[current.index].value.end.c_str(),
      (unsigned long)((now - current.executeTime) / 1000),
      (unsigned long)((now - executeTime) / 1000), stateId.c_str());
  // 通知步骤结束事件
  if (changeHandler) {
    char buffer[256];
    sprintf(
        buffer,
        "{processName:%s}流程的{stepName:%s}{stepId:%d}环节终止。负载{"
        "componentKey:%s}{componentValue:%s}已关闭。环节持续{stepDuration:%lu}"
        "秒，流程持续{duration:%lu}秒。",
        name.c_str(), steps[current.index].name.c_str(), current.index,
        steps[current.index].componentKey.c_str(),
        steps[current.index].value.end.c_str(),
        (unsigned long)((now - current.executeTime) / 1000),
        (unsigned long)((now - executeTime) / 1000));
    Change *change = new Change();
    change->stateId = stateId;
    change->type = "step_end";
    change->message = String(buffer);
    changeHandler(change, this, context);
  }
  // 向当前负载写入结束参数
  if (steps[current.index].component == nullptr) {
    return;
  }
  (*(IStepComponent *)steps[current.index].component)
      .setJsonValue(steps[current.index].value.end);
}

/**
 * 获得指定类型的所有组件键名
 * @param type 组件类型（TYPE_LOAD / TYPE_SENSOR）
 * @return 组件键名列表
 */
std::vector<String> Process::getComponentKeys(int type) {
  std::vector<String> keys;
  for (const auto &pair : components) {
    if (pair.second.type == type) {
      keys.push_back(pair.second.key);
    }
  }
  return keys;
}

/**
 * 获得所有组件的键值对列表
 * 传感器返回 getState()，负载返回 getValue()
 * @return 组件键值对列表
 */
std::vector<std::pair<String, long>> Process::getComponentKeyValuePairs() {
  std::vector<std::pair<String, long>> pairs;
  // 收集传感器状态值
  std::vector<String> keys0 = getComponentKeys(Process::TYPE_SENSOR);
  for (const String &key : keys0) {
    void *component = getComponentValue(key);
    if (component != nullptr) {
      long state = (*(IInterruptComponent *)component).getState();
      pairs.push_back(std::make_pair(key, state));
    }
  }
  // 收集负载当前值
  std::vector<String> keys1 = getComponentKeys(Process::TYPE_LOAD);
  for (const String &key : keys1) {
    void *component = getComponentValue(key);
    if (component != nullptr) {
      long value = (*(IStepComponent *)component).getValue();
      pairs.push_back(std::make_pair(key, value));
    }
  }
  return pairs;
}
