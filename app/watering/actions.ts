"use server";

import { getAllDevices } from "./services/db";
import { setDeviceSwitch as _setDeviceSwitch } from "./actions/set-state";
import { updateDeviceConfig as _updateDeviceConfig } from "./actions/set-config";
import { removeDevice as _removeDevice } from "./actions/delete-device";
import { getLogs as _getLogs } from "./actions/get-logs";
import { clearLogs as _clearLogs } from "./actions/clear-logs";
import type { DeviceConfig } from "./types";

export async function getDevices() {
  return await getAllDevices();
}

export async function setDeviceSwitch(
  chipId: string,
  switchState: "on" | "off",
  processIndex?: number
) {
  return _setDeviceSwitch(chipId, switchState, processIndex);
}

export async function updateDeviceConfig(chipId: string, updates: Partial<DeviceConfig>) {
  return _updateDeviceConfig(chipId, updates);
}

export async function removeDevice(chipId: string) {
  return _removeDevice(chipId);
}

export async function getLogs(chipId: string) {
  return _getLogs(chipId);
}

export async function clearLogs(chipId: string) {
  return _clearLogs(chipId);
}
