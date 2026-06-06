"use server";

import { getAllDevices } from "./services/db";

export async function getDevices() {
  return getAllDevices();
}
