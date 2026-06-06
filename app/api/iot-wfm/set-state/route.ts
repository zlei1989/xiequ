import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId, switch: switchVal, index, process } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const state = getDeviceState(chipId);
  if (!state) {
    return NextResponse.json({ error: "设备状态不存在" }, { status: 404 });
  }

  const prevStateId = state.stateId;

  if (switchVal === "off" && state.switch === "off") {
    return NextResponse.json({ data: undefined });
  }

  state.switch = switchVal;
  if (index !== undefined) state.index = index;
  if (process !== undefined) state.process = process;
  state.stateId = newId();
  state.lastWriteTime = new Date().toISOString();

  saveDeviceState(state);
  writeDeviceLog(chipId, switchVal === "on" ? "execute" : "terminate", { stateId: prevStateId });

  return NextResponse.json({ data: undefined });
}
