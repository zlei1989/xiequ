// 流程步骤
export type Step = {
  name: string;
  component: string;
  trigger?: string;
  value: { begin: unknown; end: unknown };
  delay?: number;
  timeout?: number;
  interrupts?: Interrupt[];
  disabled?: boolean;
};

// 中断
export type Interrupt = {
  name: string;
  component: string;
  state: number | boolean;
  intercept?: number;
  delay?: number;
  duration?: number;
  disabled?: boolean;
};

// 流程
export type Process = {
  name: string;
  steps: Step[];
};

// 定时任务
export type Schedule = {
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
  voltageConfig?: VoltageConfig;
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
  lastWriteTime: string;
};

// 设备列表项（配置 + 状态 + 在线信息）
export type DeviceItem = DeviceConfig & {
  state?: DeviceState;
  lastTickTime?: number;
  isOnline?: boolean;
};
