import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, getDeviceState } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const config = getDeviceConfig(chipId);
  const state = getDeviceState(chipId);

  if (!config) {
    return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  }

  return NextResponse.json({ data: { ...config, state } });
}
