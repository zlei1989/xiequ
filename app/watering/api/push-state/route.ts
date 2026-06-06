import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const event = searchParams.get("event") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  updateTick(chipId);

  // 解析 GPIO 状态
  const gpioState: Record<string, Record<string, number>> = { buttons: {}, sensors: {}, loads: {} };
  searchParams.forEach((value, key) => {
    const match = key.match(/^(button|sensor|load):(.+)$/);
    if (match) {
      const category = match[1] === "button" ? "buttons" : match[1] === "sensor" ? "sensors" : "loads";
      gpioState[category][match[2]] = parseInt(value) || 0;
    }
  });

  // 处理事件
  switch (event) {
    case "bootstrap": {
      // 首次上线，创建默认配置（如不存在）
      let config = getDeviceConfig(chipId);
      if (!config) {
        config = {
          chipId,
          name: `IOT-${chipId}`,
          macAddress,
          processes: [],
          idleSleep: false,
          idleTimeout: 30000,
          bootExec: -1,
          execDelay: 0,
          schedules: [],
          createdTime: new Date().toISOString(),
          lastWriteTime: new Date().toISOString(),
        };
        saveDeviceConfig(config);
      }

      let state = getDeviceState(chipId);
      if (!state) {
        state = {
          chipId,
          stateId: newId(),
          switch: "off",
          lastWriteTime: new Date().toISOString(),
        };
      }
      // 合并 GPIO 状态
      Object.assign(state, {
        buttons: gpioState.buttons,
        sensors: gpioState.sensors,
        loads: gpioState.loads,
        stateId: newId(),
        lastWriteTime: new Date().toISOString(),
      });
      saveDeviceState(state);

      // 记录日志
      writeDeviceLog(chipId, "bootstrap", { macAddress, cause: searchParams.get("cause") || "" });
      if (state.switch === "on" && state.process) {
        writeDeviceLog(chipId, "execute", { stateId: state.stateId, index: state.index });
      }
      break;
    }
    case "finish": {
      const state = getDeviceState(chipId);
      if (state && state.switch !== "off") {
        state.switch = "off";
        state.index = undefined;
        state.process = undefined;
        state.message = undefined;
        state.stateId = newId();
        state.lastWriteTime = new Date().toISOString();
        saveDeviceState(state);
      }
      writeDeviceLog(chipId, "finish", { macAddress });
      break;
    }
    default: {
      // 普通状态上报
      writeDeviceLog(chipId, event || "heartbeat", {
        macAddress,
        buttons: gpioState.buttons,
        sensors: gpioState.sensors,
        loads: gpioState.loads,
      });
      break;
    }
  }

  return NextResponse.json({ data: undefined });
}
