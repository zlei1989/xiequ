import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick, calcVoltage } from "@/app/watering/services/db";
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
  await updateTick(chipId);

  // 解析 GPIO 状态
  const gpioState: Record<string, Record<string, number>> = { sensors: {}, loads: {} };
  searchParams.forEach((value, key) => {
    const match = key.match(/^(sensor|load):(.+)$/);
    if (match) {
      const category = match[1] === "sensor" ? "sensors" : "loads";
      gpioState[category][match[2]] = parseInt(value) || 0;
    }
  });

  // 获取设备配置用于电压计算（bootstrap 分支内可能重新获取/创建）
  const config = await getDeviceConfig(chipId);
  const voltage = calcVoltage(config?.voltage, gpioState.sensors);

  // 处理事件
  switch (event) {
    case "bootstrap": {
      let config = await getDeviceConfig(chipId);
      if (!config) {
        console.info('[Watering] bootstrap 自动创建默认配置', { chipId });
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
          voltage: undefined,
          createdTime: new Date().toISOString(),
          lastWriteTime: new Date().toISOString(),
        };
        await saveDeviceConfig(config);
      }

      let state = await getDeviceState(chipId);
      if (!state) {
        state = {
          chipId,
          stateId: newId(),
          switch: "off",
          lastWriteTime: new Date().toISOString(),
        };
      }
      Object.assign(state, {
        sensors: gpioState.sensors,
        loads: gpioState.loads,
        stateId: newId(),
        lastWriteTime: new Date().toISOString(),
      });
      await saveDeviceState(state);

      const bootstrapVoltage = calcVoltage(config.voltage, gpioState.sensors);
      await writeDeviceLog(chipId, 'bootstrap', macAddress, { cause: searchParams.get('cause') || '', sensors: gpioState.sensors, loads: gpioState.loads }, bootstrapVoltage, state.stateId);
      if (state.switch === 'on' && state.process) {
        await writeDeviceLog(chipId, 'execute', macAddress, { index: state.index }, bootstrapVoltage, state.stateId);
      }
      break;
    }
    case "change": {
      const stateId = searchParams.get('stateId') || '';
      const type = searchParams.get('type') || '';
      const message = searchParams.get('message') || '';
      const changeVoltage = calcVoltage(config?.voltage, gpioState.sensors);
      await writeDeviceLog(chipId, 'change', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads, type }, changeVoltage, stateId, message);
      break;
    }
    case "finish": {
      console.info('[Watering] finish 清除执行状态', { chipId });
      const state = await getDeviceState(chipId);
      if (state && state.switch !== "off") {
        state.switch = "off";
        state.index = undefined;
        state.process = undefined;
        state.message = undefined;
        state.stateId = newId();
        state.lastWriteTime = new Date().toISOString();
        await saveDeviceState(state);
      }
      const finishVoltage = calcVoltage(config?.voltage, gpioState.sensors);
      await writeDeviceLog(chipId, 'finish', macAddress, undefined, finishVoltage, state?.stateId);
      break;
    }
    default: {
      await writeDeviceLog(chipId, event || 'heartbeat', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads }, voltage);
      break;
    }
  }

  return NextResponse.json({ success: true });
}
