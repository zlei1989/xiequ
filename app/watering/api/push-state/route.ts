import { NextResponse } from 'next/server';

import { execCallback } from '@/app/watering/services/callback-map';
import { calcSensorReadings, getDeviceConfig, getDeviceState, saveDeviceConfig, saveDeviceState, updateIdleSince, updateTick, writeDeviceLog } from '@/app/watering/services/db';
import { parseGpioParams } from '@/app/watering/utils/parse-gpio';
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
  const gpioState = parseGpioParams(searchParams);

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
        state.lastActionStartedAt = Date.now();
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
        await writeDeviceLog(chipId, 'execute', macAddress, { index: state.index, trigger: 'bootstrap' }, bootstrapReadings, state.stateId);
      }
      // 根据启动原因设置 idleSince：
      // - 正常上电(cause=0)或外部唤醒(cause=2)：设为当前时间，需等待 idleTimeout 后才允许休眠
      // - 定时器唤醒(cause=4)：设为过去时间，无任务时首次 get-state 即可立即休眠
      // 若设备有 pending 工作（bootExec/计划任务），switch 已为 'on' 不会触发休眠。
      const cause = searchParams.get('cause') || '';
      const isColdBoot = cause === '0' || cause === '2';
      const bootstrapIdleSince = isColdBoot
        ? Date.now()
        : Date.now() - config.idleTimeout - 1000;
      await updateIdleSince(chipId, 'bootstrap', bootstrapIdleSince);
      break;
    }
    case 'change': {
      const stateId = searchParams.get('stateId') || '';
      const type = searchParams.get('type') || '';
      const message = searchParams.get('message') || '';
      // 持久化步骤索引（ROM 新增上报）
      const stepIndex = searchParams.get('stepIndex');
      const state = await getDeviceState(chipId);
      if (state) {
        // 更新传感器数据（每次 push-state 都写入最新 GPIO 采样）
        state.sensors = gpioState.sensors;
        state.lastWriteTime = new Date().toISOString();
        // 仅当 stateId 匹配时接受 ROM 上报的 stepIndex：
        // 防止用户手动切换步骤后，ROM 延迟到达的旧 change 事件覆盖新值
        if (stepIndex !== null && state.stateId === stateId) {
          state.stepIndex = parseInt(stepIndex, 10);
        }
        await saveDeviceState(state);
      }
      const changeReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
      await writeDeviceLog(chipId, 'change', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads, type, stepIndex: stepIndex ?? undefined }, changeReadings, stateId, message);
      await updateIdleSince(chipId, 'change');
      break;
    }
    case 'finish': {
      console.info('[Watering] finish 清除执行状态', { chipId });
      const state = await getDeviceState(chipId);
      if (state) {
        // 更新传感器数据
        state.sensors = gpioState.sensors;
        if (state.switch !== 'off') {
          // 持久化最后执行信息：进程名、耗时、完成时间
          state.lastActionName = state.process?.name;
          state.lastActionDuration = state.lastActionStartedAt != null
            ? Date.now() - state.lastActionStartedAt
            : 0;
          state.lastActionFinishedAt = Date.now();
          state.switch = 'off';
          state.index = undefined;
          state.process = undefined;
          state.stepIndex = undefined;
          state.message = undefined;
          state.stateId = newId();
          // 唤醒正在长轮询等待的设备
          execCallback(chipId);
        }
        state.lastWriteTime = new Date().toISOString();
        await saveDeviceState(state);
      }
      const finishReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
      await writeDeviceLog(chipId, 'finish', macAddress, undefined, finishReadings, state?.stateId);
      await updateIdleSince(chipId, 'finish');
      break;
    }
    case 'execute': {
      // 设备主动上报"开始执行流程"事件（按钮触发等）
      const trigger = searchParams.get('trigger') || '';
      const procIndex = parseInt(searchParams.get('index') || '-1', 10);
      console.info('[Watering] execute 事件', { chipId, trigger, procIndex });

      const state = await getDeviceState(chipId);
      if (state) {
        // 更新传感器数据
        state.sensors = gpioState.sensors;
        if (
          state.switch === 'off' &&
          config &&
          procIndex >= 0 &&
          procIndex < config.processes.length
        ) {
          state.switch = 'on';
          state.index = procIndex;
          state.process = JSON.parse(
            JSON.stringify(config.processes[procIndex]),
          ) as typeof state.process;
          state.lastActionStartedAt = Date.now();
          // 不生成新 stateId：保持与 ROM 同步，确保后续 change 事件的 stateId 能匹配
          execCallback(chipId);
        }
        state.lastWriteTime = new Date().toISOString();
        await saveDeviceState(state);
      }
      const executeReadings = calcSensorReadings(config?.sensors ?? [], gpioState.sensors);
      await writeDeviceLog(chipId, 'execute', macAddress, { index: procIndex, trigger }, executeReadings, state?.stateId);
      await updateIdleSince(chipId, 'execute');
      break;
    }
    default: {
      // 更新传感器数据到状态表
      const state = await getDeviceState(chipId);
      if (state) {
        state.sensors = gpioState.sensors;
        state.lastWriteTime = new Date().toISOString();
        await saveDeviceState(state);
      }
      await writeDeviceLog(chipId, event || 'heartbeat', macAddress, { sensors: gpioState.sensors, loads: gpioState.loads }, defaultReadings);
      // event 来自固件上报，值域受控；兜底为 heartbeat
      await updateIdleSince(chipId, (event || 'heartbeat') as 'bootstrap' | 'button' | 'change' | 'finish' | 'heartbeat');
      break;
    }
  }

  return NextResponse.json({ success: true });
}
