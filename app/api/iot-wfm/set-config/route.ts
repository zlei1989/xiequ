import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const config = getDeviceConfig(chipId);
  if (!config) {
    return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  }

  // 更新配置字段
  if (body.name !== undefined) config.name = body.name;
  if (body.idleSleep !== undefined) config.idleSleep = body.idleSleep;
  if (body.idleTimeout !== undefined) config.idleTimeout = body.idleTimeout;
  if (body.bootExec !== undefined) config.bootExec = body.bootExec;
  if (body.execDelay !== undefined) config.execDelay = body.execDelay;
  if (body.processes !== undefined) config.processes = body.processes;
  if (body.schedules !== undefined) config.schedules = body.schedules;
  config.lastWriteTime = new Date().toISOString();

  saveDeviceConfig(config);

  // 如果设备处于 off 状态，刷新 stateId 以通知设备
  const state = getDeviceState(chipId);
  if (state && state.switch === "off") {
    state.stateId = newId();
    state.lastWriteTime = new Date().toISOString();
    saveDeviceState(state);
  }

  return NextResponse.json({ data: undefined });
}
