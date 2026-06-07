"use server";

import { getDeviceLogs } from "../services/db";

export async function getLogs(chipId: string) {
  return await getDeviceLogs(chipId);
}
