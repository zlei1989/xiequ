"use server";

import { getDeviceConfig, saveDeviceConfig } from "../services/db";
import { revalidatePath } from "next/cache";
import type { DeviceConfig } from "../types";

export async function updateDeviceConfig(chipId: string, updates: Partial<DeviceConfig>) {
  const config = await getDeviceConfig(chipId);
  if (!config) throw new Error("设备不存在");

  const updated: DeviceConfig = {
    ...config,
    ...updates,
    chipId: config.chipId, // 不允许修改 chipId
    lastWriteTime: new Date().toISOString(),
  };
  await saveDeviceConfig(updated);
  revalidatePath("/watering");
  return { success: true };
}
