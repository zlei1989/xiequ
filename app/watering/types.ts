// 流程步骤
export type Step = {
  key?: string;
  name: string;
  component?: string;
  value: { begin: unknown; end: unknown };
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};

// 中断
export type Interrupt = {
  key?: string;
  name: string;
  component: string;
  state: number | boolean;
  signalType?: "analog" | "digital";  // 信号类型：模拟 / 数字
  logic?: ">" | "<";                   // 逻辑：大于 / 小于（仅模拟信号生效）
  threshold?: number;                  // 触发阈值（仅模拟信号生效）
  intercept?: number;
  delay?: number;
  duration?: number;
  disabled?: boolean;
};

// 流程
export type Process = {
  key?: string;
  name: string;
  trigger?: string;
  steps: Step[];
};

// 定时任务
export type Schedule = {
  key?: string;
  type: "minute" | "day" | "week" | "month";
  day?: number;
  week?: number;
  month?: number;
  value: number;
  interval: number;
  process: number;
  disabled?: boolean;
};

// 电压检测配置
export type VoltageConfig = {
  sensor: string;   // 传感器引脚名，如 "sensor_0"
  r1: number;       // R1 电阻值（欧姆），默认 30000
  r2: number;       // R2 电阻值（欧姆），默认 10000
};

// 设备配置
export type DeviceConfig = {
  chipId: string;
  name: string;
  macAddress: string;
  processes: Process[];
  idleSleep: boolean;
  idleTimeout: number;
  bootExec: number;
  execDelay: number;
  schedules: Schedule[];
  voltage?: VoltageConfig;
  processesVersion?: string;  // 流程配置版本（变更时更新）
  createdTime: string;
  lastWriteTime: string;
};

// 设备状态
export type DeviceState = {
  chipId: string;
  stateId: string;
  switch: "on" | "off";
  buttons?: Record<string, number>;
  sensors?: Record<string, number>;
  loads?: Record<string, number>;
  index?: number;
  process?: Process;
  message?: string;
  sleep?: number;           // 固件轮询间隔（毫秒）
  sleepDuration?: number;   // 空闲深度睡眠时长（毫秒）
  lastWriteTime: string;
};

// 设备列表项（配置 + 状态 + 在线信息）
export type DeviceItem = DeviceConfig & {
  state?: DeviceState;
  lastTickTime?: number;
  isOnline?: boolean;
};
