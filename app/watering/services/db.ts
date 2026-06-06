import { getDb } from "@/lib/db";
import type { DeviceConfig, DeviceState, DeviceItem } from "../types";

/**
 * 初始化浇花模块数据库表
 */
export function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_devices (
      chipId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      macAddress TEXT NOT NULL,
      processes TEXT NOT NULL DEFAULT '[]',
      idleSleep INTEGER NOT NULL DEFAULT 0,
      idleTimeout INTEGER NOT NULL DEFAULT 30000,
      bootExec INTEGER NOT NULL DEFAULT -1,
      execDelay INTEGER NOT NULL DEFAULT 0,
      schedules TEXT NOT NULL DEFAULT '[]',
      createdTime TEXT NOT NULL,
      lastWriteTime TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_device_state (
      chipId TEXT PRIMARY KEY,
      stateId TEXT NOT NULL,
      switch TEXT NOT NULL DEFAULT 'off',
      buttons TEXT,
      sensors TEXT,
      loads TEXT,
      currentIndex INTEGER,
      currentProcess TEXT,
      message TEXT,
      lastTickTime INTEGER DEFAULT 0,
      lastWriteTime TEXT NOT NULL,
      FOREIGN KEY (chipId) REFERENCES watering_devices(chipId)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chipId TEXT NOT NULL,
      event TEXT NOT NULL,
      state TEXT,
      createdTime TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watering_logs_chipId
    ON watering_logs(chipId, createdTime DESC)
  `);
}

/**
 * 获取所有设备（含状态和在线信息）
 */
export function getAllDevices(): DeviceItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.*, s.stateId, s.switch, s.buttons, s.sensors, s.loads,
           s.currentIndex, s.currentProcess, s.message,
           s.lastTickTime as stateLastTickTime, s.lastWriteTime as stateLastWriteTime
    FROM watering_devices d
    LEFT JOIN watering_device_state s ON d.chipId = s.chipId
    ORDER BY d.name
  `).all() as any[];

  const now = Date.now();
  return rows.map((row) => {
    const config: DeviceConfig = {
      chipId: row.chipId,
      name: row.name,
      macAddress: row.macAddress,
      processes: JSON.parse(row.processes),
      idleSleep: !!row.idleSleep,
      idleTimeout: row.idleTimeout,
      bootExec: row.bootExec,
      execDelay: row.execDelay,
      schedules: JSON.parse(row.schedules),
      createdTime: row.createdTime,
      lastWriteTime: row.lastWriteTime,
    };

    const item: DeviceItem = { ...config };

    if (row.stateId) {
      item.state = {
        chipId: row.chipId,
        stateId: row.stateId,
        switch: row.switch,
        buttons: row.buttons ? JSON.parse(row.buttons) : undefined,
        sensors: row.sensors ? JSON.parse(row.sensors) : undefined,
        loads: row.loads ? JSON.parse(row.loads) : undefined,
        index: row.currentIndex ?? undefined,
        process: row.currentProcess ? JSON.parse(row.currentProcess) : undefined,
        message: row.message ?? undefined,
        lastWriteTime: row.stateLastWriteTime,
      };
      item.lastTickTime = row.stateLastTickTime;
      // 60 秒内心跳视为在线
      item.isOnline = row.stateLastTickTime && (now - row.stateLastTickTime) <= 60 * 1000;
    }

    return item;
  });
}

/**
 * 获取单个设备配置
 */
export function getDeviceConfig(chipId: string): DeviceConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM watering_devices WHERE chipId = ?").get(chipId) as any;
  if (!row) return null;
  return {
    chipId: row.chipId,
    name: row.name,
    macAddress: row.macAddress,
    processes: JSON.parse(row.processes),
    idleSleep: !!row.idleSleep,
    idleTimeout: row.idleTimeout,
    bootExec: row.bootExec,
    execDelay: row.execDelay,
    schedules: JSON.parse(row.schedules),
    createdTime: row.createdTime,
    lastWriteTime: row.lastWriteTime,
  };
}

/**
 * 保存设备配置
 */
export function saveDeviceConfig(config: DeviceConfig) {
  const db = getDb();
  db.prepare(`
    INSERT INTO watering_devices (chipId, name, macAddress, processes, idleSleep, idleTimeout, bootExec, execDelay, schedules, createdTime, lastWriteTime)
    VALUES (@chipId, @name, @macAddress, @processes, @idleSleep, @idleTimeout, @bootExec, @execDelay, @schedules, @createdTime, @lastWriteTime)
    ON CONFLICT(chipId) DO UPDATE SET
      name=@name, macAddress=@macAddress, processes=@processes, idleSleep=@idleSleep,
      idleTimeout=@idleTimeout, bootExec=@bootExec, execDelay=@execDelay,
      schedules=@schedules, lastWriteTime=@lastWriteTime
  `).run({
    ...config,
    processes: JSON.stringify(config.processes),
    idleSleep: config.idleSleep ? 1 : 0,
    schedules: JSON.stringify(config.schedules),
  });
}

/**
 * 删除设备
 */
export function deleteDevice(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_device_state WHERE chipId = ?").run(chipId);
  db.prepare("DELETE FROM watering_devices WHERE chipId = ?").run(chipId);
}

/**
 * 获取设备日志
 */
export function getDeviceLogs(chipId: string, limit = 100) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM watering_logs WHERE chipId = ? ORDER BY createdTime DESC LIMIT ?"
  ).all(chipId, limit);
}

/**
 * 写入设备日志
 */
export function writeDeviceLog(chipId: string, event: string, state?: Record<string, unknown>) {
  const db = getDb();
  db.prepare("INSERT INTO watering_logs (chipId, event, state, createdTime) VALUES (?, ?, ?, ?)").run(
    chipId,
    event,
    state ? JSON.stringify(state) : null,
    new Date().toISOString()
  );
}

/**
 * 清空设备日志
 */
export function clearDeviceLogs(chipId: string) {
  const db = getDb();
  db.prepare("DELETE FROM watering_logs WHERE chipId = ?").run(chipId);
}
