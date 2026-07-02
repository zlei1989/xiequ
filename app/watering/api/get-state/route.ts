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
import { getDeviceState, getDeviceConfig, updateTick, insertScheduleLog, hasScheduleLog, saveDeviceState, saveDeviceConfig, writeDeviceLog, writeSensorLog, getSensorLogs } from '@/app/watering/services/db';
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
  if (!config || Object.keys(rawSensors).length === 0 || !config.sensors.length) return;

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

/** 深睡眠最大时长（毫秒），由 WATERING_SLEEP_DURATION 环境变量控制，默认 15 分钟 */
const SLEEP_DURATION = (() => {
  const v = parseInt(process.env.WATERING_SLEEP_DURATION || '900000');
  return Number.isFinite(v) ? v : 900000;
})();

/** 计划任务检查的最大误差容忍（毫秒） */
const SCHEDULE_OFFSET = 45 * 60 * 1000;

/**
 * 计划任务时区偏移（分钟），由 WATERING_TZ_OFFSET 环境变量控制
 *
 * 优先使用 WATERING_TZ_OFFSET 显式指定（如 480 表示 UTC+8）；
 * 未设置时自动从系统时区检测（受 TZ 环境变量影响，如 TZ=Asia/Shanghai → 480）。
 * 所有计划任务的时间计算（零点、星期几）均使用此时区，与服务器本地时区解耦。
 */
const TZ_OFFSET = (() => {
  const explicit = parseInt(process.env.WATERING_TZ_OFFSET || '');
  if (Number.isFinite(explicit)) return explicit;
  /** getTimezoneOffset() 返回反向偏移（UTC+8 → -480），取反得到常规值 */
  return -new Date().getTimezoneOffset();
})();

/**
 * 获取配置时区下某天的零点 UTC 时间戳（毫秒）
 *
 * 将 UTC 时间偏移到目标时区后取零点，再转回 UTC 时间戳，
 * 不依赖服务器本地时区或 dayjs 插件。
 */
function startOfDayInTz(date: Date): number {
  // 将 UTC 时间加上时区偏移，得到目标时区的本地时间
  const localMs = date.getTime() + TZ_OFFSET * 60000;
  // 用 UTC 方法取出目标时区的小时/分/秒/毫秒，算出零点偏移
  const localDate = new Date(localMs);
  const midnightOffset =
    localDate.getUTCHours() * 3600000 +
    localDate.getUTCMinutes() * 60000 +
    localDate.getUTCSeconds() * 1000 +
    localDate.getUTCMilliseconds();
  // 目标时区零点对应的 UTC 时间戳
  return localMs - midnightOffset - TZ_OFFSET * 60000;
}

/**
 * 获取配置时区下的星期几（1=周一...7=周日）
 *
 * 将 UTC 时间偏移到目标时区后取星期，转换为 1=周一...7=周日
 * 以匹配 ScheduleConfig.week 的定义。
 */
function getWeekDayInTz(date: Date): number {
  const localDate = new Date(date.getTime() + TZ_OFFSET * 60000);
  const jsDay = localDate.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * 计算 day/week 类型计划任务的今日触发时间戳（毫秒）
 *
 * 使用配置时区的零点 + value 偏移，不依赖服务器本地时区。
 */
function calcDayLoopTriggerTime(now: Date, value: number): number {
  return startOfDayInTz(now) + value;
}

/**
 * 计算 minute 类型计划任务的当前理论触发时间戳（毫秒）
 *
 * 从 startTime 开始，按 interval 分钟等间隔触发。
 * 计算公式：startTime + floor((now - startTime) / intervalMs) * intervalMs
 * 结果为 ≤ now 的最大触发时间点。
 */
function calcMinuteTriggerTime(startTime: number, intervalMinutes: number, now: Date): number {
  const intervalMs = intervalMinutes * 60000;
  const elapsed = now.getTime() - startTime;
  if (elapsed < 0) return startTime;
  const n = Math.floor(elapsed / intervalMs);
  return startTime + n * intervalMs;
}

/**
 * 计算 week 类型计划任务的今日触发时间戳（毫秒）
 *
 * 仅当在配置时区下今天是指定星期时返回触发时间，否则返回 null。
 * 使用 getWeekDayInTz 确保星期判断不受服务器本地时区影响。
 */
function calcWeekTriggerTime(now: Date, value: number, week: number): number | null {
  if (getWeekDayInTz(now) !== week) return null;
  return calcDayLoopTriggerTime(now, value);
}

/**
 * 检查计划任务并执行
 *
 * 遍历 config.schedules，找到第一个应触发的计划任务。
 * 支持 once/day/minute/week 四种循环类型。
 * 触发后标记 schedule_log、更新 state.switch/process/stateId。
 * once 类型触发后自动将 disabled 设为 true 并保存配置。
 *
 * @returns 是否触发了计划任务（用于判断 changed）
 */
async function checkAndExecuteSchedule(
  config: DeviceConfig,
  state: DeviceState,
  now: Date,
  macAddress: string,
): Promise<boolean> {
  // 仅在设备空闲时检查
  if (state.switch !== 'off') return false;

  let configNeedsSave = false;

  for (const schedule of config.schedules) {
    if (schedule.disabled) continue;

    let triggerTime: number;

    switch (schedule.type) {
      case 'once': {
        // 单次任务：startTime 即执行时间
        triggerTime = schedule.startTime;
        const elapsed = now.getTime() - triggerTime;
        if (elapsed < 0 || Math.abs(elapsed) > SCHEDULE_OFFSET) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;
        break;
      }

      case 'day': {
        // 按天：检查启用日期是否已到（使用配置时区比较日期）
        if (startOfDayInTz(new Date(schedule.startTime)) > startOfDayInTz(now)) continue;

        triggerTime = calcDayLoopTriggerTime(now, schedule.value ?? 0);
        if (triggerTime > now.getTime()) continue;
        if (Math.abs(now.getTime() - triggerTime) > SCHEDULE_OFFSET) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;

        // interval 去重：interval=0 表示每天都执行，跳过间隔检查
        if (schedule.interval && schedule.interval > 0) {
          let previouslyExecuted = false;
          for (let i = 1; i <= schedule.interval; i++) {
            const prevTime = triggerTime - i * 86400000;
            if (await hasScheduleLog(config.chipId, prevTime)) {
              previouslyExecuted = true;
              break;
            }
          }
          if (previouslyExecuted) continue;
        }
        break;
      }

      case 'minute': {
        // 按分钟：从 startTime 开始等间隔触发
        triggerTime = calcMinuteTriggerTime(schedule.startTime, schedule.interval ?? 30, now);
        // 还没到首次执行时间
        if (triggerTime > now.getTime()) continue;
        // 当前时间距理论触发时间超过一个间隔则跳过（防止唤醒后批量执行）
        const intervalMs = (schedule.interval ?? 30) * 60000;
        if (now.getTime() - triggerTime > intervalMs) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;
        break;
      }

      case 'week': {
        // 按星期：检查启用日期和星期（使用配置时区比较日期）
        if (startOfDayInTz(new Date(schedule.startTime)) > startOfDayInTz(now)) continue;

        const weekTriggerTime = calcWeekTriggerTime(now, schedule.value ?? 0, schedule.week ?? 1);
        if (weekTriggerTime === null) continue;
        triggerTime = weekTriggerTime;
        if (triggerTime > now.getTime()) continue;
        if (Math.abs(now.getTime() - triggerTime) > SCHEDULE_OFFSET) continue;
        if (await hasScheduleLog(config.chipId, triggerTime)) continue;
        break;
      }

      default:
        continue;
    }

    // 下发流程（深拷贝防止修改原始配置）
    if (
      config.processes.length > 0 &&
      config.processes.length > schedule.process
    ) {
      state.switch = 'on';
      state.index = schedule.process;
      state.process = filterProcess(
        JSON.parse(JSON.stringify(config.processes[schedule.process])) as ProcessConfig,
      );
      state.lastActionStartedAt = Date.now();
      // 标记执行
      await insertScheduleLog(config.chipId, triggerTime, schedule.process);
      // once 类型触发后自动禁用
      if (schedule.type === 'once') {
        schedule.disabled = true;
        configNeedsSave = true;
      }
      state.stateId = newId();
      state.lastWriteTime = new Date().toISOString();
      await saveDeviceState(state);
      // 写入执行日志（trigger 标识计划任务触发，不阻断主流程）
      try {
        await writeDeviceLog(config.chipId, 'execute', macAddress, { index: schedule.process, trigger: 'schedule' }, undefined, state.stateId);
      } catch (logErr) {
        console.error('[Watering] 写入计划任务执行日志失败:', { chipId: config.chipId, scheduleType: schedule.type }, logErr);
      }
      // once 类型需要持久化 disabled 状态到配置
      if (configNeedsSave) {
        await saveDeviceConfig(config);
      }
      return true;
    }
  }

  return false;
}

/**
 * 计算单个计划任务距现在还有多少毫秒
 */
function calcNextScheduleDelay(schedule: ScheduleConfig, now: Date): number {
  if (schedule.disabled) return SLEEP_DURATION;

  switch (schedule.type) {
    case 'once': {
      if (schedule.startTime <= now.getTime()) return SLEEP_DURATION;
      return schedule.startTime - now.getTime();
    }

    case 'day': {
      const startDateMidnight = startOfDayInTz(new Date(schedule.startTime));
      const nowMidnight = startOfDayInTz(now);
      if (startDateMidnight > nowMidnight) {
        return startDateMidnight + (schedule.value ?? 0) - now.getTime();
      }

      const todayTrigger = calcDayLoopTriggerTime(now, schedule.value ?? 0);
      if (todayTrigger > now.getTime()) {
        return todayTrigger - now.getTime();
      }

      const intervalMs = ((schedule.interval ?? 0) + 1) * 86400000;
      return todayTrigger + intervalMs - now.getTime();
    }

    case 'minute': {
      if (schedule.startTime > now.getTime()) {
        return schedule.startTime - now.getTime();
      }
      const triggerTime = calcMinuteTriggerTime(schedule.startTime, schedule.interval ?? 30, now);
      const intervalMs = (schedule.interval ?? 30) * 60000;
      return triggerTime + intervalMs - now.getTime();
    }

    case 'week': {
      const startDateMidnight = startOfDayInTz(new Date(schedule.startTime));
      const nowMidnight = startOfDayInTz(now);
      if (startDateMidnight > nowMidnight) {
        return startDateMidnight + (schedule.value ?? 0) - now.getTime();
      }

      const weekTriggerTime = calcWeekTriggerTime(now, schedule.value ?? 0, schedule.week ?? 1);
      if (weekTriggerTime !== null && weekTriggerTime > now.getTime()) {
        return weekTriggerTime - now.getTime();
      }

      // 计算下一个目标星期（使用配置时区的星期几）
      const currentWeekDay = getWeekDayInTz(now);
      const targetWeekDay = schedule.week ?? 1;
      let daysUntil = targetWeekDay - currentWeekDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (weekTriggerTime !== null && weekTriggerTime <= now.getTime()) {
        daysUntil = daysUntil === 0 ? 7 : daysUntil;
      }
      // 计算下个目标星期的零点 + value 偏移
      const nextWeekTrigger = startOfDayInTz(now) + daysUntil * 86400000 + (schedule.value ?? 0);
      return nextWeekTrigger - now.getTime();
    }

    default:
      return SLEEP_DURATION;
  }
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
      await checkAndExecuteSchedule(config, state, new Date(), macAddress);
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
