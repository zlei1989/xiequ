/**
 * 浇花 IoT 模块类型定义
 *
 * 核心实体：DeviceConfig（设备配置）、DeviceState（设备状态）、DeviceItem（合并视图）。
 * IoT 协议实体：StepConfig（流程步骤）、InterruptConfig（中断条件）、ProcessConfig（流程）、ScheduleConfig（计划任务）。
 * 数据持久化在 SQLite，通过 services/db.ts 读写。
 */

/** 流程步骤 — 控制单个负载（水泵/电磁阀等）的执行单元 */
export type StepConfig = {
  key?: string;
  name: string;
  /** 负载组件名，如 "motor_0" */
  component?: string;
  /** 执行参数 { begin, end }，含义由组件类型决定 */
  value: { begin: unknown; end: unknown };
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 执行前延迟（毫秒），用于 execDelay 叠加 */
  delay?: number;
  /** 中断条件列表 */
  interrupts?: InterruptConfig[];
  disabled?: boolean;
};

/** 中断条件 — 满足时触发步骤中断 */
export type InterruptConfig = {
  key?: string;
  name: string;
  /** 触发组件名 */
  component: string;
  /** 触发阈值 */
  state: number | boolean;
  /** 信号类型：模拟（数值比较）/ 数字（布尔匹配） */
  signalType?: 'analog' | 'digital';
  /** 比较逻辑（仅模拟信号生效） */
  logic?: '>' | '<';
  /** 触发阈值（仅模拟信号生效） */
  threshold?: number;
  /** 拦截次数上限 */
  intercept?: number;
  /** 触发后延迟（毫秒） */
  delay?: number;
  /** 持续时间（毫秒） */
  duration?: number;
  disabled?: boolean;
};

/** 流程 — 包含多个步骤的自动化序列 */
export type ProcessConfig = {
  key?: string;
  name: string;
  /** 触发条件（保留字段） */
  trigger?: string;
  steps: StepConfig[];
};

/** 计划任务 — 按循环类型触发指定流程 */
export type ScheduleConfig = {
  key?: string;
  /** 循环类型：once=单次, day=按天, minute=按分钟, week=按星期 */
  type: 'once' | 'day' | 'minute' | 'week';
  /** 开始时间（Unix 时间戳 ms）
   *  - once: 执行时间
   *  - day/week: 启用日期（此日期起生效）
   *  - minute: 首次执行时间 */
  startTime: number;
  /** 循环时间（距 00:00 毫秒偏移）— 仅 day/week 类型，表示每天/每周几的触发时刻 */
  value?: number;
  /** 间隔数 — day: 间隔天数(0=每天, 1=隔天), minute: 间隔分钟数(最小30) */
  interval?: number;
  /** 星期几 (1=周一...7=周日) — 仅 week 类型 */
  week?: number;
  /** 要触发的流程索引 */
  process: number;
  /** 是否禁用（单次任务执行后自动设为 true） */
  disabled?: boolean;
};

/** 传感器配置 — 单个传感器检测参数 */
export type SensorConfig = {
  /** 感应名称，如 "电池电压"、"土壤湿度" */
  name: string;
  /** 传感器引脚名，如 "sensor_0" */
  sensor: string;
  /** 信号类型 */
  type: 'digital' | 'analog';
  /** 转换类型（仅模拟信号可选），不选则直接显示 ADC 原始值 */
  conversion?: 'resistor_divider' | 'ntc_10k';
  /** NTC B 值 3435 或 3950（仅 ntc_10k 显示，默认 3435） */
  bValue?: 3435 | 3950;
  /** 上拉电阻 R1（Ω），仅 resistor_divider 显示，默认 30000 */
  r1?: number;
  /** 下拉电阻 R2（Ω），仅 resistor_divider 显示，默认 10000 */
  r2?: number;
};

/** 电压检测配置 — 分压电阻参数，用于计算实际电压
 * @deprecated 使用 SensorConfig[] 替代，将在后续版本移除
 */
export type VoltageConfig = {
  /** 传感器引脚名，如 "sensor_0" */
  sensor: string;
  /** R1 电阻值（欧姆），默认 30000 */
  r1: number;
  /** R2 电阻值（欧姆），默认 10000 */
  r2: number;
};

/** 设备配置 — 存储在 SQLite device_config 表中 */
export type DeviceConfig = {
  /** 芯片 ID（唯一标识） */
  chipId: string;
  name: string;
  macAddress: string;
  processes: ProcessConfig[];
  /** 空闲时是否进入深度睡眠 */
  idleSleep: boolean;
  /** 空闲超时（毫秒） */
  idleTimeout: number;
  /** 启动时执行的流程索引 */
  bootExec: number;
  /** 指令执行延迟（毫秒） */
  execDelay: number;
  schedules: ScheduleConfig[];
  sensors: SensorConfig[];
  /** 流程配置版本（变更时更新，用于固件同步判断） */
  processesVersion?: string;
  createdTime: string;
  lastWriteTime: string;
};

/** 设备状态 — 存储在 SQLite device_state 表中 */
export type DeviceState = {
  chipId: string;
  /** 状态版本 ID（变更时刷新） */
  stateId: string;
  /** 开关状态 */
  switch: 'on' | 'off';
  /** 按钮状态（键为引脚名，值为按下次数） */
  buttons?: Record<string, number>;
  /** 传感器读数（键为引脚名，值为 ADC 原始值） */
  sensors?: Record<string, number>;
  /** 负载状态（键为负载名，值为 0/1） */
  loads?: Record<string, number>;
  /** 当前执行的流程步骤索引 */
  index?: number;
  /** 当前执行的流程副本 */
  process?: ProcessConfig;
  /** 状态消息 */
  message?: string;
  /** 固件轮询间隔（毫秒） */
  sleep?: number;
  /** 空闲深度睡眠时长（毫秒） */
  sleepDuration?: number;
  /** 设备最后一次动作的时间戳（毫秒），pushState 时更新 */
  idleSince?: number;
  /** 最后一次动作类型：bootstrap / button / change / finish / heartbeat */
  lastActionType?: 'bootstrap' | 'button' | 'change' | 'finish' | 'heartbeat';
  /** 当前执行的步骤索引（ROM change 上报，undefined 表示未追踪） */
  stepIndex?: number;
  lastWriteTime: string;
};

/** 设备列表项 — 配置 + 状态 + 在线信息的合并视图 */
export type DeviceItem = DeviceConfig & {
  state?: DeviceState;
  /** 最后心跳时间戳（毫秒） */
  lastTickTime?: number;
  /** 是否在线（基于心跳超时判断） */
  isOnline?: boolean;
};
