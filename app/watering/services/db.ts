import { getDb } from "@/lib/db";
import type { DeviceConfig, DeviceState, DeviceItem } from "../types";

/**
 * sql.js 的 getAsObject() 将 JSON 列作为字符串返回（不自动解析）。
 * 此辅助函数安全地将 JSON 字符串解析为对象/数组，如果已经是对象则直接返回。
 */
function parseJSON<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
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
export async function initDb() {
  const db = await getDb();

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
      created_time TEXT NOT NULL,
      last_write_time TEXT NOT NULL
    )
  `);

  // 为已有表添加 voltage_config 列（兼容旧数据库）
  try {
    db.exec(`ALTER TABLE watering_devices ADD COLUMN voltage_config JSON`);
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
      event TEXT NOT NULL,
      state JSON,
      created_time TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watering_logs_chip_id
    ON watering_logs(chip_id, created_time DESC)
  `);
}

/**
 * 获取所有设备（含状态和在线信息）
 */
export async function getAllDevices(): Promise<DeviceItem[]> {
  const db = await getDb();
  const rows = db.prepare(`
    SELECT d.chip_id, d.name, d.mac_address, d.processes, d.idle_sleep, d.idle_timeout,
           d.boot_exec, d.exec_delay, d.schedules, d.voltage_config, d.created_time, d.last_write_time,
           s.state_id, s.switch, s.buttons, s.sensors, s.loads,
           s.current_index, s.current_process, s.message,
           s.last_tick_time as state_last_tick_time, s.last_write_time as state_last_write_time
    FROM watering_devices d
    LEFT JOIN watering_device_state s ON d.chip_id = s.chip_id
    ORDER BY d.name
  `).all() as any[];

  const now = Date.now();
  return rows.map((row) => {
    const config: DeviceConfig = {
      chipId: row.chip_id,
      name: row.name,
      macAddress: row.mac_address,
      processes: parseJSON(row.processes, [] as DeviceConfig["processes"]),
      idleSleep: !!row.idle_sleep,
      idleTimeout: row.idle_timeout,
      bootExec: row.boot_exec,
      execDelay: row.exec_delay,
      schedules: parseJSON(row.schedules, [] as DeviceConfig["schedules"]),
      voltageConfig: parseJSON(row.voltage_config, undefined as DeviceConfig["voltageConfig"]),
      createdTime: row.created_time,
      lastWriteTime: row.last_write_time,
    };

    const item: DeviceItem = { ...config };

    if (row.state_id) {
      item.state = {
        chipId: row.chip_id,
        stateId: row.state_id,
        switch: row.switch,
        buttons: parseJSON(row.buttons, undefined as Record<string, number> | undefined),
        sensors: parseJSON(row.sensors, undefined as Record<string, number> | undefined),
        loads: parseJSON(row.loads, undefined as Record<string, number> | undefined),
        index: row.current_index ?? undefined,
        process: parseJSON(row.current_process, undefined as DeviceState["process"]),
        message: row.message ?? undefined,
        lastWriteTime: row.state_last_write_time,
      };
      item.lastTickTime = row.state_last_tick_time;
      // 60 秒内心跳视为在线
      item.isOnline = row.state_last_tick_time && (now - row.state_last_tick_time) <= 60 * 1000;
    }

    return item;
  });
}

/**
 * 获取单个设备配置
 */
export async function getDeviceConfig(chipId: string): Promise<DeviceConfig | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM watering_devices WHERE chip_id = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    name: row.name,
    macAddress: row.mac_address,
    processes: parseJSON(row.processes, [] as DeviceConfig["processes"]),
    idleSleep: !!row.idle_sleep,
    idleTimeout: row.idle_timeout,
    bootExec: row.boot_exec,
    execDelay: row.exec_delay,
    schedules: parseJSON(row.schedules, [] as DeviceConfig["schedules"]),
    voltageConfig: parseJSON(row.voltage_config, undefined as DeviceConfig["voltageConfig"]),
    createdTime: row.created_time,
    lastWriteTime: row.last_write_time,
  };
}

/**
 * 保存设备配置
 */
export async function saveDeviceConfig(config: DeviceConfig) {
  const db = await getDb();
  db.prepare(`
    INSERT INTO watering_devices (chip_id, name, mac_address, processes, idle_sleep, idle_timeout, boot_exec, exec_delay, schedules, voltage_config, created_time, last_write_time)
    VALUES (@chip_id, @name, @mac_address, @processes, @idle_sleep, @idle_timeout, @boot_exec, @exec_delay, @schedules, @voltage_config, @created_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      name=@name, mac_address=@mac_address, processes=@processes, idle_sleep=@idle_sleep,
      idle_timeout=@idle_timeout, boot_exec=@boot_exec, exec_delay=@exec_delay,
      schedules=@schedules, voltage_config=@voltage_config, last_write_time=@last_write_time
  `).run({
    "@chip_id": config.chipId,
    "@name": config.name,
    "@mac_address": config.macAddress,
    "@processes": JSON.stringify(config.processes),
    "@idle_sleep": config.idleSleep ? 1 : 0,
    "@idle_timeout": config.idleTimeout,
    "@boot_exec": config.bootExec,
    "@exec_delay": config.execDelay,
    "@schedules": JSON.stringify(config.schedules),
    "@voltage_config": config.voltageConfig ? JSON.stringify(config.voltageConfig) : null,
    "@created_time": config.createdTime,
    "@last_write_time": config.lastWriteTime,
  });
}

/**
 * 删除设备
 */
export async function deleteDevice(chipId: string) {
  const db = await getDb();
  db.prepare("DELETE FROM watering_device_state WHERE chip_id = ?").run(chipId);
  db.prepare("DELETE FROM watering_devices WHERE chip_id = ?").run(chipId);
}

/**
 * 获取设备状态
 */
export async function getDeviceState(chipId: string): Promise<DeviceState | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM watering_device_state WHERE chip_id = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    stateId: row.state_id,
    switch: row.switch,
    buttons: parseJSON(row.buttons, undefined as Record<string, number> | undefined),
    sensors: parseJSON(row.sensors, undefined as Record<string, number> | undefined),
    loads: parseJSON(row.loads, undefined as Record<string, number> | undefined),
    index: row.current_index ?? undefined,
    process: parseJSON(row.current_process, undefined as DeviceState["process"]),
    message: row.message ?? undefined,
    lastWriteTime: row.last_write_time,
  };
}

/**
 * 保存设备状态（upsert）
 */
export async function saveDeviceState(state: DeviceState) {
  const db = await getDb();
  db.prepare(`
    INSERT INTO watering_device_state (chip_id, state_id, switch, buttons, sensors, loads, current_index, current_process, message, last_tick_time, last_write_time)
    VALUES (@chip_id, @state_id, @switch, @buttons, @sensors, @loads, @current_index, @current_process, @message, @last_tick_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      state_id=@state_id, switch=@switch, buttons=@buttons, sensors=@sensors, loads=@loads,
      current_index=@current_index, current_process=@current_process, message=@message,
      last_tick_time=@last_tick_time, last_write_time=@last_write_time
  `).run({
    "@chip_id": state.chipId,
    "@state_id": state.stateId,
    "@switch": state.switch,
    "@buttons": state.buttons ? JSON.stringify(state.buttons) : null,
    "@sensors": state.sensors ? JSON.stringify(state.sensors) : null,
    "@loads": state.loads ? JSON.stringify(state.loads) : null,
    "@current_index": state.index ?? null,
    "@current_process": state.process ? JSON.stringify(state.process) : null,
    "@message": state.message ?? null,
    "@last_tick_time": Date.now(),
    "@last_write_time": state.lastWriteTime,
  });
}

/**
 * 更新心跳时间
 */
export async function updateTick(chipId: string) {
  const db = await getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT 1 FROM watering_device_state WHERE chip_id = ?").get(chipId);
  if (existing) {
    db.prepare("UPDATE watering_device_state SET last_tick_time = ? WHERE chip_id = ?").run(now, chipId);
  }
}

/**
 * 获取设备日志
 */
export async function getDeviceLogs(chipId: string, limit = 100) {
  const db = await getDb();
  const rows = db.prepare(
    "SELECT id, chip_id, event, state, created_time FROM watering_logs WHERE chip_id = ? ORDER BY created_time DESC LIMIT ?"
  ).all(chipId, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    event: row.event,
    state: parseJSON(row.state, undefined as Record<string, unknown> | undefined),
    createdTime: row.created_time,
  }));
}

/**
 * 写入设备日志
 */
export async function writeDeviceLog(chipId: string, event: string, state?: Record<string, unknown>) {
  const db = await getDb();
  db.prepare("INSERT INTO watering_logs (chip_id, event, state, created_time) VALUES (?, ?, ?, ?)").run(
    chipId,
    event,
    state ? JSON.stringify(state) : null,
    new Date().toISOString()
  );
}

/**
 * 清空设备日志
 */
export async function clearDeviceLogs(chipId: string) {
  const db = await getDb();
  db.prepare("DELETE FROM watering_logs WHERE chip_id = ?").run(chipId);
}
