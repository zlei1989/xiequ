import { NextRequest, NextResponse } from "next/server";
import type { DeviceState, DeviceConfig } from "@/app/watering/types";
import { getDeviceState, getDeviceConfig, updateTick } from "@/app/watering/services/db";

/** 环境变量 */
const POLL_INTERVAL = parseInt(process.env.WATERING_POLL_INTERVAL || "15000");
const SLEEP_DURATION = parseInt(process.env.WATERING_SLEEP_DURATION || "300000");

/**
 * 构建精简的 get-state 响应（仅包含固件实际使用的字段）
 */
function buildResponse(
  state: DeviceState | null,
  changed: boolean,
  config: DeviceConfig | null,
  clientProcessesVersion?: string
) {
  const result: Record<string, unknown> = {};

  // 始终包含 stateId
  result.stateId = state?.stateId || "";

  // 变化标志
  result.changed = changed;

  // switch 状态
  result.switch = state?.switch || "off";

  // 轮询间隔
  result.sleep = POLL_INTERVAL;

  // 当前执行的流程（仅在变化时下发，避免重复传大对象）
  if (changed && state?.process) {
    result.process = state.process;
  }

  // 深度睡眠时长（仅无定时任务且无流程执行时下发）
  if (
    config &&
    (!config.schedules || config.schedules.length === 0) &&
    state?.switch !== "on"
  ) {
    result.sleepDuration = SLEEP_DURATION;
  }

  // processes 版本控制下发
  if (config?.processesVersion) {
    result.processesVersion = config.processesVersion;
    // 仅在版本不匹配或首次下发时包含完整 processes 数据
    if (clientProcessesVersion !== config.processesVersion) {
      result.processes = config.processes;
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const clientStateId = searchParams.get("stateId") || "";
  const clientProcessesVersion = searchParams.get("processesVersion") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  await updateTick(chipId);

  // 并行读取状态和配置
  const [state, config] = await Promise.all([
    getDeviceState(chipId),
    getDeviceConfig(chipId),
  ]);

  // 比较是否有变化
  const changed = !state || clientStateId !== state.stateId;

  // 构建精简响应
  const response = buildResponse(state, changed, config, clientProcessesVersion);

  return NextResponse.json(response);
}
