import { NextResponse } from "next/server";
import { getAllDevices } from "@/app/watering/services/db";

export async function GET() {
  const devices = getAllDevices();
  return NextResponse.json({ data: devices });
}
