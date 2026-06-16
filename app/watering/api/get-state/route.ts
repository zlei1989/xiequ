/**
 * GET /api/watering/get-state — 设备拉取状态 API
 *
 * ESP32 固件定期轮询此接口获取最新 switch 状态和 process 指令。
 * 通过比较 stateId 判断是否有变化，仅在有变化时下发 process 对象。
 *
 * 长轮询模式：
 * - 有状态变化时立即返回
 * - 无变化时 Promise 阻塞等待（最长 WATERING_LONG_POLL_TIMEOUT 毫秒）
 * - set-state / push-state 通过 execCallback 唤醒等待中的请求
 * - 超时后返回 changed:false，设备发起下一轮请求
 *
 * 同时检查计划任务：设备空闲时自动判断定时触发并下发 process。
 */

import { NextResponse } from 'next/server';

import { setCallback, deleteCallback } from '@/app/watering/services/callback-map';
import { getDeviceState, getDeviceConfig, updateTick, insertScheduleLog, hasScheduleLog, saveDeviceState, writeSensorLog, getSensorLogs } from '@/app/watering/services/db';
import type { DeviceState, DeviceConfig, ScheduleConfig, ProcessConfig } from '@/app/watering/types';
import type { SensorConfig } from '@/app/watering/types';
import { calcSensorReadings } from '@/app/watering/utils/calc-sensor';
import { filterProcess, filterProcesses } from '@/app/watering/utils/filter-process';
import { newId } from '@/lib/utils';

import type { NextRequest } from 'next/server';


/**
 * 计算当前时间之前最近的自然 15 分钟 slot
 *
 * 对齐到自然时间：分钟数向下取整到 0/15/30/45，秒和毫秒归零。
 * 例如 14:32:45 → 14:30:00.000
 *
 * @param now 当前 Date 对象
 * @returns 对齐后的 ISO 8601 时间字符串
 */
function calcLatestSlot(now: Date): string {
  const slot = new Date(now);
  const minutes = slot.getMinutes();
  // 向下取整到最近的 15 分钟点
  const floored = Math.floor(minutes / 15) * 15;
  slot.setMinutes(floored, 0, 0);
  return slot.toISOString();
}

/**
 * 如果需要则写入传感器采样记录
 *
 * 从请求的查询参数中解析 sensor:xxx 参数，
 * 计算传感器读数，判断当前 slot 是否需要采样，是则写入。
 *
 * @param searchParams 请求 URL 查询参数
 * @param config 设备配置（含 sensors 配置）
 * @param chipId 设备芯片 ID
 */
async function sampleSensorIfNeeded(
  searchParams: URLSearchParams,
  config: { sensors: SensorConfig[] } | null,
  chipId: string,
): Promise<void> {
  // 解析传感器参数（同 push-state 解析方式）
  const rawSensors: Record<string, number> = {};
  searchParams.forEach((value, key) => {
    const match = key.match(/^sensor:(.+)$/);
    if (match) {
      const gpioKey = match[1];
      if (gpioKey) {
        rawSensors[gpioKey] = parseInt(value) || 0;
      }
    }
  });

  // 无传感器数据或未配置传感器 — 跳过
  if (Object.keys(rawSensors).length === 0 || !config?.sensors?.length) return;

  // 计算传感器读数
  const readings = calcSensorReadings(config.sensors, rawSensors);
  if (readings.length === 0) return;

  // 计算当前 slot 并判断是否需要采样
  const now = new Date();
  const latestSlot = calcLatestSlot(now);

  // 查询该设备最后一条记录的时间
  const existingLogs = await getSensorLogs(chipId, latestSlot);
  if (existingLogs.length > 0) return; // 当前 slot 已有记录

  // 写入采样记录
  await writeSensorLog(chipId, latestSlot, readings);
}

/** 环境变量 */
const POLL_INTERVAL = parseInt(process.env.WATERING_POLL_INTERVAL || '1000');
const LONG_POLL_TIMEOUT = parseInt(process.env.WATERING_LONG_POLL_TIMEOUT || '7000');

/** 深睡眠最大时长（毫秒），由 WATERING_SLEEP_DURATION 环境变量控制，默认 5 分钟 */
const SLEEP_DURATION = (() => {
  const v = parseInt(process.env.WATERING_SLEEP_DURATION || '300000');
  return Number.isFinite(v) ? v : 300000;
})();

/** 计划任务检查的最大误差容忍（毫秒） */
const SCHEDULE_OFFSET = 45 * 60 * 1000;

/**
 * 计算 day 类型定时任务的今日触发时间戳（毫秒）
 *
 * @param now 当前时间
 * @param value 距 00:00 的毫秒偏移
 */
function calcDayTriggerTime(now: Date, value: number): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.getTime() + value;
}

/**
 * 检查计划任务并执行
 *
 * 遍历 config.schedules，找到第一个应触发的 day 类型定时任务。
 * 触发条件：已到达、未过期超 45 分钟、今日及 interval 天内未执行。
 * 触发后标记 schedule_log、更新 state.switch/process/stateId。
 *
 * @returns 是否触发了计划任务（用于判断 changed）
 */
async function checkAndExecuteSchedule(
  config: DeviceConfig,
  state: DeviceState,
  now: Date,
): Promise<boolean> {
  // 仅在设备空闲时检查
  if (state.switch !== 'off') return false;

  for (const schedule of config.schedules) {
    if (schedule.disabled) continue;

    let triggerTime: number;
    switch (schedule.type) {
      case 'day':
        triggerTime = calcDayTriggerTime(now, schedule.value);
        break;
      default:
        // 其他类型暂不支持
        continue;
    }

    // 未到触发时间
    if (triggerTime > now.getTime()) continue;
    // 过期超过容忍误差
    if (Math.abs(now.getTime() - triggerTime) > SCHEDULE_OFFSET) continue;

    // 去重：查询当天及 interval 天内是否已执行
    if (await hasScheduleLog(config.chipId, triggerTime)) continue;

    let previouslyExecuted = false;
    for (let i = 1; i < schedule.interval; i++) {
      const prevTime = triggerTime - i * 24 * 3600 * 1000;
      if (await hasScheduleLog(config.chipId, prevTime)) {
        previouslyExecuted = true;
        break;
      }
    }
    if (previouslyExecuted) continue;

    // 下发流程（深拷贝防止修改原始配置）
    if (
      config.processes.length > 0 &&
      config.processes.length > schedule.process
    ) {
      state.switch = 'on';
      state.index = schedule.process;
      // 过滤禁用步骤和中断后再下发
      state.process = filterProcess(
        JSON.parse(JSON.stringify(config.processes[schedule.process])) as ProcessConfig,
      );
      // 标记执行（先确认流程有效再标记，防止无效流程永久跳过）
      await insertScheduleLog(config.chipId, triggerTime, schedule.process);
      state.stateId = newId();
      state.lastWriteTime = new Date().toISOString();
      await saveDeviceState(state);
      return true;
    }
  }

  return false;
}

/**
 * 计算单个定时任务距现在还有多少毫秒
 *
 * 目前完整支持 day 类型（value = 距 00:00 的毫秒偏移）。
 * 其他类型（minute/week/month）暂简化处理，返回 SLEEP_DURATION。
 */
function calcNextScheduleDelay(schedule: ScheduleConfig, now: Date): number {
  if (schedule.disabled) return SLEEP_DURATION;

  if (schedule.type === 'day') {
    const nowMs = now.getTime();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    const todayTrigger = todayStartMs + schedule.value;

    if (todayTrigger > nowMs) {
      return todayTrigger - nowMs;
    }

    const intervalMs = (schedule.interval || 1) * 24 * 3600000;
    return todayTrigger + intervalMs - nowMs;
  }

  return SLEEP_DURATION;
}

/**
 * 计算深睡眠时长（毫秒）
 */
function calcSleepDuration(schedules: ScheduleConfig[], now: Date): number {
  const enabled = schedules.filter((s) => !s.disabled);
  if (enabled.length === 0) return SLEEP_DURATION;

  let minDelay = SLEEP_DURATION;
  for (const s of enabled) {
    const delay = calcNextScheduleDelay(s, now);
    if (delay < minDelay) {
      minDelay = delay;
    }
  }

  return minDelay;
}

/**
 * 构建精简的 get-state 响应（仅包含固件实际使用的字段）
 */
function buildResponse(
  state: DeviceState | null,
  changed: boolean,
  config: DeviceConfig | null,
  clientProcessesVersion?: string,
) {
  const result: Record<string, unknown> = {};

  result.stateId = state?.stateId || '';

  result.changed = changed;

  result.switch = state?.switch || 'off';

  result.sleep = POLL_INTERVAL;

  if (changed && state?.process) {
    result.process = state.process;
    if (typeof state.stepIndex === 'number') {
      result.stepIndex = state.stepIndex;
    }
  }

  if (
    config &&
    config.idleSleep &&
    state?.switch !== 'on' &&
    state?.idleSince != null &&
    (Date.now() - state.idleSince) >= config.idleTimeout
  ) {
    result.sleepDuration = calcSleepDuration(config.schedules, new Date());
  }

  if (config?.processesVersion) {
    result.processesVersion = config.processesVersion;
    if (clientProcessesVersion !== config.processesVersion) {
      // 过滤禁用步骤和中断后再下发完整流程列表
      result.processes = filterProcesses(config.processes);
    }
  }

  return result;
}

/**
 * GET /api/watering/get-state
 *
 * ESP32 固件轮询获取最新 switch 状态和 process 指令。
 * 长轮询模式：有变化立即返回，无变化 Promise 阻塞等待（超时或 execCallback 唤醒）。
 * 同时检查计划任务（设备空闲时自动判断定时触发）。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get('chipId') || '';
  const macAddress = searchParams.get('macAddress') || '';
  const clientStateId = searchParams.get('stateId') || '';
  const clientProcessesVersion = searchParams.get('processesVersion') || '';

  console.info('[Watering] get-state 请求', { chipId, macAddress, clientStateId });

  if (!chipId || !macAddress) {
    console.warn('[Watering] get-state 缺少必要参数', { chipId, macAddress });
    return NextResponse.json({ error: 'chipId and macAddress required' }, { status: 400 });
  }

  try {
    // 刷新心跳
    await updateTick(chipId);

    // 读取设备配置（传感器采样和计划任务都需要 config）
    const config = await getDeviceConfig(chipId);

    // 传感器定时采样（fire-and-forget，不阻塞响应）
    void sampleSensorIfNeeded(searchParams, config, chipId).catch((err: unknown) => {
      console.error('[Watering] 传感器采样失败', {
        chipId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Error && err.stack) console.error(err.stack);
    });

    // 读取设备状态
    const state = await getDeviceState(chipId);

    // 计划任务检查（可能更新 state）
    if (state && config) {
      await checkAndExecuteSchedule(config, state, new Date());
    }

    // 比较是否有变化
    const changed = !state || clientStateId !== state.stateId;

    // 省电计算在 buildResponse 中完成

    // 有变化 → 立即返回
    if (changed) {
      const response = buildResponse(state, true, config, clientProcessesVersion);
      return NextResponse.json(response);
    }

    // 无变化 → 长轮询等待
    try {
      return await new Promise<NextResponse>((resolve) => {
        // 超时返回 unchanged
        const timer = setTimeout(() => {
          const response = buildResponse(state, false, config, clientProcessesVersion);
          resolve(NextResponse.json(response));
        }, LONG_POLL_TIMEOUT);

        // 中途收到状态变更通知：清除超时，返回最新状态
        const callback = async () => {
          clearTimeout(timer);
          const latestState = await getDeviceState(chipId);
          const latestConfig = await getDeviceConfig(chipId);
          const response = buildResponse(latestState, true, latestConfig, clientProcessesVersion);
          resolve(NextResponse.json(response));
        };

        setCallback(chipId, () => { void callback(); });
      });
    } finally {
      deleteCallback(chipId);
    }
  } catch (err) {
    console.error('[Watering] get-state 处理失败', {
      chipId,
      macAddress,
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error && err.stack) console.error(err.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
