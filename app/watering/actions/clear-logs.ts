"use server";

import { clearDeviceLogs } from "../services/db";

export async function clearLogs(chipId: string) {
  clearDeviceLogs(chipId);
}
