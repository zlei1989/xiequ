"use server";

import { deleteDevice } from "../services/db";
import { revalidatePath } from "next/cache";

export async function removeDevice(chipId: string) {
  deleteDevice(chipId);
  revalidatePath("/watering");
  return { success: true };
}
