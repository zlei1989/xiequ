"use server";

import { getDeviceConfig, getDeviceState, saveDeviceState } from "../services/db";
import { newId } from "@/lib/utils";

export async function setDeviceSwitch(
  chipId: string,
  switchState: "on" | "off",
  processIndex?: number
) {
  const config = getDeviceConfig(chipId);
  if (!config) throw new Error("设备不存在");

  const state = getDeviceState(chipId);
  if (!state) throw new Error("设备状态不存在");

  if (switchState === "on") {
    const processIdx = processIndex ?? 0;
    if (processIdx >= config.processes.length) {
      throw new Error("流程索引越界");
    }
    state.switch = "on";
    state.index = processIdx;
    state.process = config.processes[processIdx];
    state.message = undefined;
  } else {
    state.switch = "off";
    state.index = undefined;
    state.process = undefined;
    state.message = undefined;
  }

  state.stateId = newId();
  state.lastWriteTime = new Date().toISOString();
  saveDeviceState(state);

  return { success: true };
}
