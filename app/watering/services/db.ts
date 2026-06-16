import { getDb, getDbSync } from '@/lib/db';
import { newId } from '@/lib/utils';

import { calcSensorReadings } from '../utils/calc-sensor';

import type { DeviceConfig, DeviceState, DeviceItem } from '../types';

/** 日志保留天数 */
const LOG_RETENTION_DAYS = 7;

/** watering_devices 表 SQLite 原始行 */
interface DeviceRow {
  chip_id: string;
  name: string;
  mac_address: string;
  processes: string;
  idle_sleep: number;
  idle_timeout: number;
  boot_exec: number;
  exec_delay: number;
  schedules: string;
  sensors: string;
  processes_version: string | null;
  created_time: string;
  last_write_time: string;
}

/** watering_device_state 表 SQLite 原始行 */
interface StateRow {
  chip_id: string;
  state_id: string;
  switch: string;
  buttons: string | null;
  sensors: string | null;
  loads: string | null;
  current_index: number | null;
  current_process: string | null;
  message: string | null;
  idle_since: number | null;
  last_action_type: string | null;
  step_index: number | null;
  last_tick_time: number;
  last_write_time: string;
}

/** watering_devices LEFT JOIN watering_device_state 原始行 */
interface JoinRow extends DeviceRow {
  /** 对应 state 表列（LEFT JOIN 为 null 表示无状态行） */
  state_id: string | null;
  switch: string | null;
  buttons: string | null;
  state_sensors: string | null;
  loads: string | null;
  current_index: number | null;
  current_process: string | null;
  message: string | null;
  idle_since: number | null;
  last_action_type: string | null;
  step_index: number | null;
  /** s.last_tick_time 别名 */
  state_last_tick_time: number | null;
  /** s.last_write_time 别名 */
  state_last_write_time: string | null;
}

/** watering_logs 表 SQLite 原始行 */
interface LogRow {
  id: number;
  chip_id: string;
  mac_address: string | null;
  event: string;
  state_id: string | null;
  message: string | null;
  state: string | null;
  readings: string | null;
  created_time: string;
}

/**
 * sql.js 的 getAsObject() 将 JSON 列作为字符串返回（不自动解析）。
 * 此辅助函数安全地将 JSON 字符串解析为对象/数组，如果已经是对象则直接返回。
 */
function parseJSON<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * 初始化浇花模块数据库表
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_devices (
      chip_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mac_address TEXT NOT NULL,
      processes JSON NOT NULL DEFAULT '[]',
      idle_sleep INTEGER NOT NULL DEFAULT 0,
      idle_timeout INTEGER NOT NULL DEFAULT 30000,
      boot_exec INTEGER NOT NULL DEFAULT -1,
      exec_delay INTEGER NOT NULL DEFAULT 0,
      schedules JSON NOT NULL DEFAULT '[]',
      sensors JSON NOT NULL DEFAULT '[]',
      processes_version TEXT,
      created_time TEXT NOT NULL,
      last_write_time TEXT NOT NULL
    )
  `);

  // 为旧数据库添加 processes_version 列
  try {
    db.exec('ALTER TABLE watering_devices ADD COLUMN processes_version TEXT');
  } catch {
    // 列已存在，忽略
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_device_state (
      chip_id TEXT PRIMARY KEY,
      state_id TEXT NOT NULL,
      switch TEXT NOT NULL DEFAULT 'off',
      buttons JSON,
      sensors JSON,
      loads JSON,
      current_index INTEGER,
      current_process JSON,
      message TEXT,
      last_tick_time INTEGER DEFAULT 0,
      last_write_time TEXT NOT NULL,
      FOREIGN KEY (chip_id) REFERENCES watering_devices(chip_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chip_id TEXT NOT NULL,
      mac_address TEXT,
      event TEXT NOT NULL,
      state_id TEXT,
      message TEXT,
      state JSON,
      readings JSON,
      created_time TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watering_logs_chip_id
    ON watering_logs(chip_id, created_time DESC)
  `);

  // 新增独立列迁移（v2: 从 state JSON 提取高频字段）
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN mac_address TEXT');
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN state_id TEXT');
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN message TEXT');
  } catch { /* 列已存在 */ }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_watering_logs_state_id ON watering_logs(state_id)');
  } catch { /* 索引已存在 */ }

  // 为旧数据库添加 idle_since 列（设备空闲计时起点）
  try {
    db.exec('ALTER TABLE watering_device_state ADD COLUMN idle_since INTEGER');
  } catch {
    // 列已存在，忽略
  }

  // 为旧数据库添加 last_action_type 列（设备最后一次动作类型）
  try {
    db.exec('ALTER TABLE watering_device_state ADD COLUMN last_action_type TEXT');
  } catch {
    // 列已存在，忽略
  }

  // 为旧数据库添加 step_index 列（步骤进度追踪）
  try {
    db.exec('ALTER TABLE watering_device_state ADD COLUMN step_index INTEGER');
  } catch {
    // 列已存在，忽略
  }

  // 计划任务执行日志表（防重复执行）
  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_schedule_log (
      chip_id TEXT NOT NULL,
      trigger_time INTEGER NOT NULL,
      process_index INTEGER NOT NULL,
      created_time INTEGER NOT NULL,
      PRIMARY KEY (chip_id, trigger_time, process_index)
    )
  `);

  // ---- voltage → sensors 迁移 ----
  try {
    db.exec("ALTER TABLE watering_devices ADD COLUMN sensors JSON NOT NULL DEFAULT '[]'");
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_devices DROP COLUMN voltage');
  } catch { /* 列不存在或 SQLite 版本不支持 */ }
  try {
    db.exec('ALTER TABLE watering_logs ADD COLUMN readings JSON');
  } catch { /* 列已存在 */ }
  try {
    db.exec('ALTER TABLE watering_logs DROP COLUMN voltage');
  } catch { /* 列不存在 */ }
}

/**
 * 获取所有设备（含状态和在线信息）
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getAllDevices(): Promise<DeviceItem[]> {
  const db = getDb();
  const rows = db.all(`
    SELECT d.chip_id, d.name, d.mac_address, d.processes, d.idle_sleep, d.idle_timeout,
           d.boot_exec, d.exec_delay, d.schedules, d.sensors, d.processes_version, d.created_time, d.last_write_time,
           s.state_id, s.switch, s.buttons, s.sensors as state_sensors, s.loads,
           s.current_index, s.current_process, s.message,
           s.idle_since, s.last_action_type, s.step_index,
           s.last_tick_time as state_last_tick_time, s.last_write_time as state_last_write_time
    FROM watering_devices d
    LEFT JOIN watering_device_state s ON d.chip_id = s.chip_id
    ORDER BY d.name
  `) as unknown as JoinRow[];

  const now = Date.now();
  return rows.map((row) => {
    const config: DeviceConfig = {
      chipId: row.chip_id,
      name: row.name,
      macAddress: row.mac_address,
      processes: parseJSON(row.processes, [] as DeviceConfig['processes']),
      idleSleep: !!row.idle_sleep,
      idleTimeout: row.idle_timeout,
      bootExec: row.boot_exec,
      execDelay: row.exec_delay,
      schedules: parseJSON(row.schedules, [] as DeviceConfig['schedules']),
      sensors: parseJSON(row.sensors, [] as DeviceConfig['sensors']),
      processesVersion: row.processes_version ?? undefined,
      createdTime: row.created_time,
      lastWriteTime: row.last_write_time,
    };

    const item: DeviceItem = { ...config };

    if (row.state_id) {
      item.state = {
        chipId: row.chip_id,
        stateId: row.state_id,
        switch: row.switch as DeviceState['switch'],
        buttons: parseJSON(row.buttons, undefined as Record<string, number> | undefined),
        sensors: parseJSON(row.state_sensors, undefined as Record<string, number> | undefined),
        loads: parseJSON(row.loads, undefined as Record<string, number> | undefined),
        index: row.current_index ?? undefined,
        process: parseJSON(row.current_process, undefined as DeviceState['process']),
        message: row.message ?? undefined,
        idleSince: row.idle_since ?? undefined,
        lastActionType: (row.last_action_type ?? undefined) as DeviceState['lastActionType'],
        stepIndex: row.step_index ?? undefined,
        lastWriteTime: row.state_last_write_time as string,
      };
      item.lastTickTime = row.state_last_tick_time ?? undefined;
      // 60 秒内心跳视为在线
      item.isOnline = !!(row.state_last_tick_time && (now - row.state_last_tick_time) <= 60 * 1000);
    }

    return item;
  });
}

/**
 * 获取单个设备配置
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getDeviceConfig(chipId: string): Promise<DeviceConfig | null> {
  const db = getDb();
  const row = db.get('SELECT * FROM watering_devices WHERE chip_id = ?', chipId) as unknown as DeviceRow | undefined;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    name: row.name,
    macAddress: row.mac_address,
    processes: parseJSON(row.processes, [] as DeviceConfig['processes']),
    idleSleep: !!row.idle_sleep,
    idleTimeout: row.idle_timeout,
    bootExec: row.boot_exec,
    execDelay: row.exec_delay,
    schedules: parseJSON(row.schedules, [] as DeviceConfig['schedules']),
    sensors: parseJSON(row.sensors, [] as DeviceConfig['sensors']),
    processesVersion: row.processes_version ?? undefined,
    createdTime: row.created_time,
    lastWriteTime: row.last_write_time,
  };
}

/**
 * 保存设备配置
 */
export async function saveDeviceConfig(config: DeviceConfig) {
  const db = getDb();

  // processesVersion 生成：对比旧值，变更时生成新版本
  const oldConfig = await getDeviceConfig(config.chipId);
  if (!config.processesVersion || !oldConfig) {
    config.processesVersion = newId();
  } else {
    const oldProcessesJson = JSON.stringify(oldConfig.processes);
    const newProcessesJson = JSON.stringify(config.processes);
    if (oldProcessesJson !== newProcessesJson) {
      config.processesVersion = newId();
    }
  }

  db.run(`
    INSERT INTO watering_devices (chip_id, name, mac_address, processes, idle_sleep, idle_timeout, boot_exec, exec_delay, schedules, sensors, processes_version, created_time, last_write_time)
    VALUES (@chip_id, @name, @mac_address, @processes, @idle_sleep, @idle_timeout, @boot_exec, @exec_delay, @schedules, @sensors, @processes_version, @created_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      name=@name, mac_address=@mac_address, processes=@processes, idle_sleep=@idle_sleep,
      idle_timeout=@idle_timeout, boot_exec=@boot_exec, exec_delay=@exec_delay,
      schedules=@schedules, sensors=@sensors, processes_version=@processes_version,
      last_write_time=@last_write_time
  `, {
    '@chip_id': config.chipId,
    '@name': config.name,
    '@mac_address': config.macAddress,
    '@processes': JSON.stringify(config.processes),
    '@idle_sleep': config.idleSleep ? 1 : 0,
    '@idle_timeout': config.idleTimeout,
    '@boot_exec': config.bootExec,
    '@exec_delay': config.execDelay,
    '@schedules': JSON.stringify(config.schedules),
    '@sensors': JSON.stringify(config.sensors),
    '@processes_version': config.processesVersion ?? null,
    '@created_time': config.createdTime,
    '@last_write_time': config.lastWriteTime,
  });
}

/**
 * 删除设备
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function deleteDevice(chipId: string) {
  const db = getDb();
  db.run('DELETE FROM watering_device_state WHERE chip_id = ?', chipId);
  db.run('DELETE FROM watering_devices WHERE chip_id = ?', chipId);
}

/**
 * 获取设备状态
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getDeviceState(chipId: string): Promise<DeviceState | null> {
  const db = getDb();
  const row = db.get('SELECT * FROM watering_device_state WHERE chip_id = ?', chipId) as unknown as StateRow | undefined;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    stateId: row.state_id,
    switch: row.switch as DeviceState['switch'],
    buttons: parseJSON(row.buttons, undefined as Record<string, number> | undefined),
    sensors: parseJSON(row.sensors, undefined as Record<string, number> | undefined),
    loads: parseJSON(row.loads, undefined as Record<string, number> | undefined),
    index: row.current_index ?? undefined,
    process: parseJSON(row.current_process, undefined as DeviceState['process']),
    message: row.message ?? undefined,
    idleSince: row.idle_since ?? undefined,
    lastActionType: (row.last_action_type ?? undefined) as DeviceState['lastActionType'],
    stepIndex: row.step_index ?? undefined,
    lastWriteTime: row.last_write_time,
  };
}

/**
 * 保存设备状态（upsert）
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function saveDeviceState(state: DeviceState) {
  const db = getDb();
  db.run(`
    INSERT INTO watering_device_state (chip_id, state_id, switch, buttons, sensors, loads, current_index, current_process, message, last_tick_time, last_write_time, idle_since, last_action_type, step_index)
    VALUES (@chip_id, @state_id, @switch, @buttons, @sensors, @loads, @current_index, @current_process, @message, @last_tick_time, @last_write_time, @idle_since, @last_action_type, @step_index)
    ON CONFLICT(chip_id) DO UPDATE SET
      state_id=@state_id, switch=@switch, buttons=@buttons, sensors=@sensors, loads=@loads,
      current_index=@current_index, current_process=@current_process, message=@message,
      last_tick_time=@last_tick_time, last_write_time=@last_write_time,
      idle_since=@idle_since, last_action_type=@last_action_type, step_index=@step_index
  `, {
    '@chip_id': state.chipId,
    '@state_id': state.stateId,
    '@switch': state.switch,
    '@buttons': state.buttons ? JSON.stringify(state.buttons) : null,
    '@sensors': state.sensors ? JSON.stringify(state.sensors) : null,
    '@loads': state.loads ? JSON.stringify(state.loads) : null,
    '@current_index': state.index ?? null,
    '@current_process': state.process ? JSON.stringify(state.process) : null,
    '@message': state.message ?? null,
    '@idle_since': state.idleSince ?? null,
    '@last_action_type': state.lastActionType ?? null,
    '@step_index': state.stepIndex ?? null,
    '@last_tick_time': Date.now(),
    '@last_write_time': state.lastWriteTime,
  });
}

/**
 * 更新心跳时间
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function updateTick(chipId: string) {
  const db = getDb();
  const now = Date.now();
  const existing = db.get('SELECT 1 FROM watering_device_state WHERE chip_id = ?', chipId);
  if (existing) {
    db.run('UPDATE watering_device_state SET last_tick_time = ? WHERE chip_id = ?', [now, chipId]);
  }
}

/**
 * 更新设备空闲计时起点
 *
 * 每次 ROM 有动作（pushState）时调用，重置空闲倒计时。
 * 使用 getDbSync() 保持与 writeDeviceLog 一致的调用模式。
 * SQLite 为同步驱动，函数签名保持 async 以兼容上层契约。
 *
 * @param chipId 设备芯片 ID
 * @param actionType 动作类型
 * @param customIdleSince 可选 — 自定义空闲起点时间戳（毫秒）。
 * 不传则使用当前时间。bootstrap 时传入过去的时间戳，
 * 可使唤醒后首次 get-state 立即满足 idleTimeout 检查，无需等待。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function updateIdleSince(
  chipId: string,
  actionType: 'bootstrap' | 'button' | 'change' | 'finish' | 'heartbeat',
  customIdleSince?: number,
) {
  const db = getDbSync();
  const now = customIdleSince ?? Date.now();
  const existing = db.get('SELECT 1 FROM watering_device_state WHERE chip_id = ?', chipId);
  if (existing) {
    db.run('UPDATE watering_device_state SET idle_since = ?, last_action_type = ? WHERE chip_id = ?',
      [now, actionType, chipId]);
  }
}

/**
 * 获取设备日志（仅返回最近 7 天内的日志）
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getDeviceLogs(chipId: string) {
  const db = getDb();
  /** 7 天前的 ISO 时间字符串 */
  const since = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.all(
    'SELECT id, chip_id, mac_address, event, state_id, message, state, readings, created_time FROM watering_logs WHERE chip_id = ? AND created_time > ? ORDER BY created_time DESC',
    [chipId, since],
  ) as unknown as LogRow[];
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    macAddress: row.mac_address ?? undefined,
    event: row.event,
    stateId: row.state_id ?? undefined,
    message: row.message ?? undefined,
    state: parseJSON(row.state, undefined as Record<string, unknown> | undefined),
    readings: parseJSON(row.readings, undefined as { label: string; value: number }[] | undefined),
    createdTime: row.created_time,
  }));
}

/**
 * @deprecated 使用 calcSensorReadings 替代，支持多传感器统一计算
 * 计算设备当前电压
 *
 * 从 GPIO 传感器数据中取对应引脚的 ADC 读数，先换算为引脚电压
 * （ADC / 4095 × 3.3V），再应用分压公式反推实际电压。
 * 公式：V_actual = ADC / 4095 × 3.3 × (R1 + R2) / R2
 * 仅在 r1 > 0 && r2 > 0 时应用分压比，否则直接使用 ADC 读数。
 * 传感器数据缺失或电压未配置时返回 0。
 */
export function calcVoltage(
  voltageConfig: { sensor: string; r1: number; r2: number } | undefined,
  sensors: Record<string, number> | undefined,
): number {
  if (!voltageConfig || !sensors) return 0;
  const raw = sensors[voltageConfig.sensor];
  if (typeof raw !== 'number') return 0;
  const r1 = voltageConfig.r1;
  const r2 = voltageConfig.r2;
  /** ADC 原始值换算为引脚电压（3.3V 参考电压，ESP32 默认 12 位分辨率 0~4095） */
  const vSensor = (raw / 4095) * 3.3;
  /** 通过分压比反推实际电压：V_actual = V_sensor × (R1 + R2) / R2 */
  const value = r1 > 0 && r2 > 0 ? vSensor * ((r1 + r2) / r2) : vSensor;
  return Math.round(value * 100) / 100; // 保留 2 位小数
}

export { calcSensorReadings };

/**
 * 写入设备日志
 *
 * SQLite WASM 驱动 API 为同步调用，但函数签名保持 async 以兼容上层契约。
 * readings 为传感器读数数组，由 calcSensorReadings 计算得出。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function writeDeviceLog(
  chipId: string,
  event: string,
  macAddress: string,
  state?: Record<string, unknown>,
  readings?: { label: string; value: number }[],
  stateId?: string,
  message?: string,
) {
  const db = getDbSync();
  db.run(`
    INSERT INTO watering_logs (chip_id, mac_address, event, state_id, message, state, readings, created_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    chipId,
    macAddress,
    event,
    stateId ?? null,
    message ?? null,
    state ? JSON.stringify(state) : null,
    readings ? JSON.stringify(readings) : null,
    new Date().toISOString(),
  ]);
}

/**
 * 清空设备日志
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function clearDeviceLogs(chipId: string) {
  const db = getDb();
  db.run('DELETE FROM watering_logs WHERE chip_id = ?', chipId);
}

/**
 * 标记计划任务已执行
 *
 * 写入 (chipId, triggerTime, processIndex) 三元组，
 * 防止同一个定时任务在同一触发时间被重复执行。
 * SQLite 同步驱动，函数签名保持 async 以兼容上层契约。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function insertScheduleLog(
  chipId: string,
  triggerTime: number,
  processIndex: number,
): Promise<void> {
  const db = getDb();
  db.run(
    'INSERT OR IGNORE INTO watering_schedule_log (chip_id, trigger_time, process_index, created_time) VALUES (?, ?, ?, ?)',
    [chipId, triggerTime, processIndex, Date.now()],
  );
}

/**
 * 查询指定触发时间是否已有执行记录
 *
 * 用于计划任务去重：同一 chipId + triggerTime 下任意 processIndex
 * 有记录返回 true。interval 多天检查由调用方循环多个 triggerTime 完成。
 * SQLite 同步驱动，函数签名保持 async 以兼容上层契约。
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function hasScheduleLog(
  chipId: string,
  triggerTime: number,
): Promise<boolean> {
  const db = getDb();
  const row = db.get(
    'SELECT 1 FROM watering_schedule_log WHERE chip_id = ? AND trigger_time = ? LIMIT 1',
    [chipId, triggerTime],
  );
  return !!row;
}
