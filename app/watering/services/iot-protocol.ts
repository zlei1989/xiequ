/**
 * IoT 设备通信协议
 *
 * 负责：
 * - 设备状态推送（设备 → 服务器）
 * - 设备状态拉取（设备 ← 服务器，长轮询/SSE）
 * - 设备指令下发（开关、流程指定）
 *
 * 具体协议细节待后续实现时补充
 */

export type DeviceEvent = 'bootstrap' | 'finish' | 'heartbeat';

export type PushStatePayload = {
  chipId: string;
  macAddress: string;
  event: DeviceEvent;
  switch?: 'on' | 'off';
  cause?: string;
  [key: string]: unknown;
};
