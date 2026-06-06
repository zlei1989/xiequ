"use server";

import { getAllDevices } from "./services/db";

export async function getDevices() {
  return getAllDevices();
}

export { setDeviceSwitch } from "./actions/set-state";
export { updateDeviceConfig } from "./actions/set-config";
export { removeDevice } from "./actions/delete-device";
