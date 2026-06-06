// 流程步骤
export type Step = {
  name: string;
  component: string;
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
