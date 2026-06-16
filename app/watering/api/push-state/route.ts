import { NextResponse } from 'next/server';

import { execCallback } from '@/app/watering/services/callback-map';
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick, updateIdleSince, calcSensorReadings } from '@/app/watering/services/db';
import { newId } from '@/lib/utils';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get('chipId') || '';
  const macAddress = searchParams.get('macAddress') || '';
  const event = searchParams.get('event') || '';

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: 'chipId and macAddress required' }, { status: 400 });
  }

  // 刷新心跳
  await updateTick(chipId);

  // 解析 GPIO 状态
  const gpioState: {
    sensors: Record<string, number>;
    loads: Record<string, number>;
  } = { sensors: {}, loads: {} };
  searchParams.forEach((value, key) => {
    const match = key.match(/^(sensor|load):(.+)$/);
    if (match) {
      const category = match[1] === 'sensor' ? 'sensors' : 'loads';
      const gpioKey = match[2];
      if (gpioKey) {
        gpioState[category][gpioKey] = parseInt(value) || 0;
      }
    }
  });

  // 获取设备配置用于电压计算（bootstrap 分支内可能重新获取/创建）
  const config = await getDeviceConfig(chipId);
  const defaultReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);

  // 处理事件
  switch (event) {
    case 'bootstrap': {
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
          sensors: [],
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
          switch: 'off',
          lastWriteTime: new Date().toISOString(),
        };
      }
      Object.assign(state, {
        sensors: gpioState.sensors,
        loads: gpioState.loads,
        stateId: newId(),
        lastWriteTime: new Date().toISOString(),
      });

      // 开机执行检查：bootExec 配置了开机流程 + 设备空闲 + 外部触发/上电
      if (
        state.switch === 'off' &&
        config.bootExec > -1 &&
        config.bootExec < config.processes.length &&
        ['External System', 'Power On'].includes(searchParams.get('cause') || '')
      ) {
        console.info('[Watering] bootstrap 触发开机执行', {
          chipId,
          bootExec: config.bootExec,
          cause: searchParams.get('cause'),
        });
        state.switch = 'on';
        state.index = config.bootExec;
        // 深拷贝流程配置，防止后续修改影响原始配置
        state.process = JSON.parse(
          JSON.stringify(config.processes[config.bootExec]),
        ) as typeof state.process;
        if (config.execDelay > 0 && state.process?.steps.length && state.process.steps.length > 0) {
          const firstStep = state.process.steps[0];
          if (firstStep) {
            firstStep.delay = (firstStep.delay || 0) + config.execDelay;
          }
        }
        state.stateId = newId();
        state.lastWriteTime = new Date().toISOString();
      }

      await saveDeviceState(state);

      // 唤醒正在长轮询等待的设备
      execCallback(chipId);

      const bootstrapReadings = calcSensorReadings(config.sensors, gpioState.sensors);
      await writeDeviceLog(chipId, 'bootstrap', macAddress, { cause: searchParams.get('cause') || '', sensors: gpioState.sensors, loads: gpioState.loads }, bootstrapReadings, state.stateId);
      if (state.switch === 'on' && state.process) {
        await writeDeviceLog(chipId, 'execute', macAddress, { index: state.index }, bootstrapReadings, state.stateId);
      }
      await updateIdleSince(chipId, 'bootstrap');
      break;
    }
    case 'change': {
      const stateId = searchParams.get('stateId') || '';
      const type = searchParams.get('type') || '';
      const message = searchParams.get('message') || '';
      // 持久化步骤索引（ROM 新增上报）
      const stepIndex = searchParams.get('stepIndex');
      if (stepIndex !== null) {
        const state = await getDeviceState(chipId);
        // 仅当 stateId 匹配时接受 ROM 上报的 stepIndex：
        // 防止用户手动切换步骤后，ROM 延迟到达的旧 change 事件覆盖新值
        if (state && state.stateId === stateId) {
          state.stepIndex = parseInt(stepIndex, 10);
          await saveDeviceState(state);
        }
      }
      const changeReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
      await writeDeviceLog(chipId, 'change', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads, type, stepIndex: stepIndex ?? undefined }, changeReadings, stateId, message);
      await updateIdleSince(chipId, 'change');
      break;
    }
    case 'finish': {
      console.info('[Watering] finish 清除执行状态', { chipId });
      const state = await getDeviceState(chipId);
      if (state && state.switch !== 'off') {
        state.switch = 'off';
        state.index = undefined;
        state.process = undefined;
        state.stepIndex = undefined;
        state.message = undefined;
        state.stateId = newId();
        state.lastWriteTime = new Date().toISOString();
        await saveDeviceState(state);
        // 唤醒正在长轮询等待的设备
        execCallback(chipId);
      }
      const finishReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
      await writeDeviceLog(chipId, 'finish', macAddress, undefined, finishReadings, state?.stateId);
      await updateIdleSince(chipId, 'finish');
      break;
    }
    default: {
      await writeDeviceLog(chipId, event || 'heartbeat', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads }, defaultReadings);
      // event 来自固件上报，值域受控；兜底为 heartbeat
      await updateIdleSince(chipId, (event || 'heartbeat') as 'bootstrap' | 'button' | 'change' | 'finish' | 'heartbeat');
      break;
    }
  }

  return NextResponse.json({ success: true });
}
