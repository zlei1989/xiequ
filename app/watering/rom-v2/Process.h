/**
 * @file Process.h
 * @brief 业务流程处理器
 *
 * 管理和执行由服务端下发的自动化浇花流程，支持多步骤顺序执行、
 * 步骤延迟启动、超时控制及中断检测。
 *
 * 核心概念：
 * - 组件（Component）：已注册的负载或传感器，通过 key 索引
 * - 步骤（Step）：流程中的一个环节，控制某个负载的启停
 * - 中断（Interrupt）：步骤执行期间的条件检测，满足时提前结束当前步骤
 * - 流程执行：按步骤顺序执行，每步有延迟、超时、中断等控制逻辑
 *
 * 流程生命周期：
 * 1. setSchema() 设置流程描述（解析 JSON 为内部结构）
 * 2. execute() 启动流程
 * 3. next() 循环驱动流程执行
 * 4. 流程结束或中断时触发回调
 */
#ifndef PROCESS_H_
#define PROCESS_H_
#include "config.h"
#include "utils.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <map>
#include <vector>

/**
 * 业务流程处理器类
 * 负责解析服务端下发的流程配置，按步骤顺序驱动负载运行，
 * 并在执行过程中检测中断条件（如水浸传感器触发）。
 */
class Process {

public:
  /** 未定义组件类型 */
  static const int TYPE_NONE = 0;
  /** 负载类型（电机/水泵等可控制组件） */
  static const int TYPE_LOAD = 1;
  /** 传感器类型（传感器/按钮等只读组件） */
  static const int TYPE_SENSOR = 2;

  /**
   * 组件注册信息
   * 用于将逻辑名称（key）映射到实际硬件对象指针
   */
  struct Component {
    /** 组件类型（TYPE_LOAD / TYPE_SENSOR） */
    int type = 0;
    /** 组件标识键名，如 "load_0"、"sensor_1" */
    String key = "";
    /** 组件对象指针，实际类型为 Motor* / Sensor* / Button* 等 */
    void *value = nullptr;
  };

  /**
   * 组件运行参数
   * begin 为步骤开始时的设定值，end 为步骤结束时的设定值
   */
  struct ComponentValue {
    /** 启动参数（步骤开始时写入组件） */
    String begin = "undefined";
    /** 中断参数（步骤结束/中断时写入组件，用于关闭或复位） */
    String end = "undefined";
  };

  /**
   * 中断条件
   * 定义步骤执行期间的检测条件，满足时提前结束当前步骤
   */
  struct Interrupt {
    /** 中断名称 */
    String name = "__INTERRUPT__";
    /** 关联的传感器组件标识，如 "sensor_1" */
    String componentKey = "__SENSOR__";
    /** 关联的传感器对象指针（IInterruptComponent*） */
    void *component = nullptr;
    /** 期望的状态值，当传感器状态等于此值时触发中断 */
    long state = 1;
    /** 中断检测延迟（毫秒）：步骤开始后多久开始检测中断 */
    unsigned long delay = 0;
    /** 信号变化有效间隔（毫秒）：过滤抖动，变化持续时间小于此值忽略 */
    unsigned long intercept = 0;
    /** 中断检测持续时间（毫秒）：超过此时间后停止检测该中断，0=持续检测 */
    unsigned long duration = 0;
    /** 信号类型："digital"（数字量）或 "analog"（模拟量） */
    String signalType = "digital";
    /** 逻辑比较符：">" | "<" | ">=" | "<=" | "==" */
    String logic = "==";
    /** 模拟量触发阈值（仅 signalType="analog" 时生效） */
    long threshold = 0;
  };

  /**
   * 流程步骤
   * 描述流程中的一个环节，包含负载控制、延迟、超时和中断条件
   */
  struct Step {
    /** 步骤名称 */
    String name = "__STEP__";
    /** 关联的负载组件标识，如 "load_0" */
    String componentKey = "__LOAD__";
    /** 关联的负载对象指针（IStepComponent*） */
    void *component = nullptr;
    /** 步骤运行参数（begin=启动值, end=结束值） */
    ComponentValue value;
    /** 步骤超时时间（毫秒）：执行超过此时间后强制结束，0=不超时 */
    unsigned long timeout = 0;
    /** 中断条件数量 */
    unsigned int interruptCount = 0;
    /** 中断条件列表（动态分配） */
    Interrupt *interrupts = nullptr;
  };

  /**
   * 当前执行状态
   * 跟踪流程执行进度，包括当前步骤索引、各阶段时间戳等
   */
  struct Current {
    /** 当前执行步骤索引 */
    int index = 0;
    /** 当前步骤是否正在执行中（true=已开始，false=延迟等待中） */
    bool processing = false;
    /** 当前步骤开始执行的时间戳（毫秒） */
    unsigned long executeTime = 0;
    /** 当前步骤超时时间戳（= executeTime + timeout），0=不超时 */
    unsigned long expire = 0;
  };

  /**
   * 流程变化信息
   * 用于回调通知外部流程执行状态的变化
   */
  struct Change {
    /** 关联的会话标识（对应服务端下发的 stateId） */
    String stateId = "";
    /** 变化类型：step_ready / step_begin / step_end / step_timeout / step_interrupt */
    String type = "";
    /** 变化描述信息 */
    String message = "";
    /** 当前步骤索引 */
    int stepIndex = -1;
  };

  /**
   * 流程结束回调函数类型
   * @param process 流程处理器指针
   * @param context 用户上下文指针
   */
  typedef void (*FinishHandler)(Process *process, void *context);

  /**
   * 流程变化回调函数类型
   * @param change 变化信息指针（由回调接收方负责 delete）
   * @param process 流程处理器指针
   * @param context 用户上下文指针
   */
  typedef void (*ChangeHandler)(Change *change, Process *process,
                                void *context);

  /** 最大组件注册数量 */
  static const int COMPONENT_MAX_COUNT = 8;

  /**
   * 注册组件到流程处理器
   * @param type 组件类型（TYPE_LOAD / TYPE_SENSOR）
   * @param key 组件标识键名
   * @param value 组件对象指针
   * @return 是否注册成功
   */
  bool registerComponent(int type, String key, void *value);
  /**
   * 销毁已注册的组件
   * @param key 组件标识键名
   * @return 是否销毁成功
   */
  bool unregisterComponent(String key);
  /**
   * 获得组件对象指针
   * @param key 组件标识键名
   * @return 组件对象指针，未找到返回 nullptr
   */
  void *getComponentValue(String key);
  /**
   * 获得指定类型的所有组件键名
   * @param type 组件类型（TYPE_LOAD / TYPE_SENSOR）
   * @return 组件键名列表
   */
  std::vector<String> getComponentKeys(int type);
  /**
   * 获得所有组件的键值对列表（传感器返回状态值，负载返回当前值）
   * @return 组件键值对列表
   */
  std::vector<std::pair<String, long>> getComponentKeyValuePairs();
  /**
   * 获得会话标识
   * @return 会话标识字符串
   */
  String getStateId();
  /**
   * 设置流程描述（从 JSON 文档解析步骤和中断）
   * @param value 流程配置 JSON 文档
   */
  void setSchema(JsonDocument value);
  /** 清空步骤列表（释放动态分配的内存） */
  void clearSteps();
  /**
   * 设置上下文
   * @param value 上下文指针
   */
  void setContext(void *value);
  /**
   * 设置流程结束回调
   * @param handler 回调函数指针
   */
  void setFinishHandler(FinishHandler handler);
  /**
   * 设置流程变化回调
   * @param handler 回调函数指针
   */
  void setChangeHandler(ChangeHandler handler);
  /** 启动流程执行 */
  void execute();
  /**
   * 从指定步骤启动流程执行
   * @param startStep 起始步骤索引（0-based）
   */
  void execute(int startStep);
  /** 终止当前流程（关闭当前负载，释放资源） */
  void terminate();
  /** 进程循环调用，驱动流程执行 */
  void next();

protected:
  /** 已注册组件映射表，key 为组件标识名 */
  std::map<String, Component> components;

  /**
   * 初始化步骤（从 JSON 对象解析步骤配置）
   * @param step 步骤结构指针
   * @param stepSchema 步骤配置 JSON 对象
   * @param index 步骤索引
   */
  void initStep(Step *step, JsonObject stepSchema, int index);
  /**
   * 初始化步骤的中断条件（从 JSON 对象解析中断配置）
   * @param interrupt 中断结构指针
   * @param interruptSchema 中断配置 JSON 对象
   * @param index 中断索引
   * @param step 所属步骤结构指针
   */
  void initInterrupt(Interrupt *interrupt, JsonObject interruptSchema,
                     int index, Step *step);
  /**
   * 解析组件运行参数
   * @param result 结果结构指针
   * @param value 参数配置 JSON 对象
   */
  void parseValue(ComponentValue *result, JsonObject value);
  /**
   * 计算步骤执行时间参数（设置延迟启动和超时时间戳）
   * @param current 当前执行状态指针
   * @param step 步骤结构指针
   */
  void calculateStep(Current *current, Step *step);
  /**
   * 检查中断条件是否满足
   * @param step 步骤结构指针
   * @param interrupt 中断结构指针
   * @param current 当前执行状态指针
   * @param now 当前时间戳（毫秒）
   * @param index 中断索引
   * @return 是否满足中断条件
   */
  bool checkInterruptState(Step *step, Interrupt *interrupt, Current *current,
                           unsigned long now, int index);

  /** 用户上下文指针 */
  void *context = nullptr;
  /** 流程结束回调函数指针 */
  FinishHandler finishHandler;
  /** 流程变化回调函数指针 */
  ChangeHandler changeHandler;
  /** 会话标识（对应服务端下发的 stateId） */
  String stateId = "";
  /** 流程名称 */
  String name = "";
  /** 步骤数量 */
  int stepCount = 0;
  /** 步骤列表（动态分配数组） */
  Step *steps = nullptr;
  /** 流程是否正在执行 */
  bool processing = false;
  /** 流程整体执行开始时间 */
  unsigned long executeTime = 0;
  /** 当前步骤执行状态 */
  Current current;
};

/**
 * 步骤组件接口
 * 可被流程步骤控制的组件（如电机/水泵）需实现此接口
 */
class IStepComponent {
public:
  /**
   * 设置 JSON 格式的运行参数
   * @param value 参数字符串（如 PWM 占空比）
   */
  virtual void setJsonValue(String value) = 0;
  /**
   * 获得当前数值
   * @return 组件当前值
   */
  virtual long getValue() = 0;
};

/**
 * 中断组件接口
 * 可作为流程中断条件检测的组件（如传感器/按钮）需实现此接口
 */
class IInterruptComponent {
public:
  /**
   * 获得当前状态
   * @return 组件当前状态值
   */
  virtual long getState() = 0;
  /**
   * 获得最后一次状态变化的时间戳
   * @return 时间戳（毫秒）
   */
  virtual unsigned long getLastTimestamp() = 0;
};
#endif /* PROCESS_H_ */
