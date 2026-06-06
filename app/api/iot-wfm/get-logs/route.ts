import { NextRequest, NextResponse } from "next/server";
import { getDeviceLogs } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  const logs = getDeviceLogs(chipId);
  return NextResponse.json({ data: logs });
}
