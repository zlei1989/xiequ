import { getDb } from "@/lib/db";
import type { DeviceConfig, DeviceState, DeviceItem } from "../types";

/**
 * 初始化浇花模块数据库表
 */
export function initDb() {
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
      created_time TEXT NOT NULL,
      last_write_time TEXT NOT NULL
    )
  `);

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
export function getAllDevices(): DeviceItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.chip_id, d.name, d.mac_address, d.processes, d.idle_sleep, d.idle_timeout,
           d.boot_exec, d.exec_delay, d.schedules, d.created_time, d.last_write_time,
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
      processes: row.processes ?? [],
      idleSleep: !!row.idle_sleep,
      idleTimeout: row.idle_timeout,
      bootExec: row.boot_exec,
      execDelay: row.exec_delay,
      schedules: row.schedules ?? [],
      createdTime: row.created_time,
      lastWriteTime: row.last_write_time,
    };

    const item: DeviceItem = { ...config };

    if (row.state_id) {
      item.state = {
        chipId: row.chip_id,
        stateId: row.state_id,
        switch: row.switch,
        buttons: row.buttons ?? undefined,
        sensors: row.sensors ?? undefined,
        loads: row.loads ?? undefined,
        index: row.current_index ?? undefined,
        process: row.current_process ?? undefined,
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
export function getDeviceConfig(chipId: string): DeviceConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_devices WHERE chip_id = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    name: row.name,
    macAddress: row.mac_address,
    processes: row.processes ?? [],
    idleSleep: !!row.idle_sleep,
    idleTimeout: row.idle_timeout,
    bootExec: row.boot_exec,
    execDelay: row.exec_delay,
    schedules: row.schedules ?? [],
    createdTime: row.created_time,
    lastWriteTime: row.last_write_time,
  };
}

/**
 * 保存设备配置
 */
export function saveDeviceConfig(config: DeviceConfig) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_devices (chip_id, name, mac_address, processes, idle_sleep, idle_timeout, boot_exec, exec_delay, schedules, created_time, last_write_time)
    VALUES (@chip_id, @name, @mac_address, @processes, @idle_sleep, @idle_timeout, @boot_exec, @exec_delay, @schedules, @created_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      name=@name, mac_address=@mac_address, processes=@processes, idle_sleep=@idle_sleep,
      idle_timeout=@idle_timeout, boot_exec=@boot_exec, exec_delay=@exec_delay,
      schedules=@schedules, last_write_time=@last_write_time
  `).run({
    chip_id: config.chipId,
    name: config.name,
    mac_address: config.macAddress,
    processes: config.processes,
    idle_sleep: config.idleSleep ? 1 : 0,
    idle_timeout: config.idleTimeout,
    boot_exec: config.bootExec,
    exec_delay: config.execDelay,
    schedules: config.schedules,
    created_time: config.createdTime,
    last_write_time: config.lastWriteTime,
  });
}

/**
 * 删除设备
 */
export function deleteDevice(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_device_state WHERE chip_id = ?").run(chipId);
  db.prepare("DELETE FROM watering_devices WHERE chip_id = ?").run(chipId);
}

/**
 * 获取设备状态
 */
export function getDeviceState(chipId: string): DeviceState | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_device_state WHERE chip_id = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chip_id,
    stateId: row.state_id,
    switch: row.switch,
    buttons: row.buttons ?? undefined,
    sensors: row.sensors ?? undefined,
    loads: row.loads ?? undefined,
    index: row.current_index ?? undefined,
    process: row.current_process ?? undefined,
    message: row.message ?? undefined,
    lastWriteTime: row.last_write_time,
  };
}

/**
 * 保存设备状态（upsert）
 */
export function saveDeviceState(state: DeviceState) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_device_state (chip_id, state_id, switch, buttons, sensors, loads, current_index, current_process, message, last_tick_time, last_write_time)
    VALUES (@chip_id, @state_id, @switch, @buttons, @sensors, @loads, @current_index, @current_process, @message, @last_tick_time, @last_write_time)
    ON CONFLICT(chip_id) DO UPDATE SET
      state_id=@state_id, switch=@switch, buttons=@buttons, sensors=@sensors, loads=@loads,
      current_index=@current_index, current_process=@current_process, message=@message,
      last_tick_time=@last_tick_time, last_write_time=@last_write_time
  `).run({
    chip_id: state.chipId,
    state_id: state.stateId,
    switch: state.switch,
    buttons: state.buttons ?? null,
    sensors: state.sensors ?? null,
    loads: state.loads ?? null,
    current_index: state.index ?? null,
    current_process: state.process ?? null,
    message: state.message ?? null,
    last_tick_time: Date.now(),
    last_write_time: state.lastWriteTime,
  });
}

/**
 * 更新心跳时间
 */
export function updateTick(chipId: string) {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare("SELECT 1 FROM watering_device_state WHERE chip_id = ?").get(chipId);
  if (existing) {
    db.prepare("UPDATE watering_device_state SET last_tick_time = ? WHERE chip_id = ?").run(now, chipId);
  }
}

/**
 * 获取设备日志
 */
export function getDeviceLogs(chipId: string, limit = 100) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, chip_id, event, state, created_time FROM watering_logs WHERE chip_id = ? ORDER BY created_time DESC LIMIT ?"
  ).all(chipId, limit) as any[];
  return rows.map((row) => ({
    id: row.id,
    chipId: row.chip_id,
    event: row.event,
    state: row.state ?? undefined,
    createdTime: row.created_time,
  }));
}

/**
 * 写入设备日志
 */
export function writeDeviceLog(chipId: string, event: string, state?: Record<string, unknown>) {
  const db = getDb();
  db.prepare("INSERT INTO watering_logs (chip_id, event, state, created_time) VALUES (?, ?, ?, ?)").run(
    chipId,
    event,
    state ?? null,
    new Date().toISOString()
  );
}

/**
 * 清空设备日志
 */
export function clearDeviceLogs(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_logs WHERE chip_id = ?").run(chipId);
}
