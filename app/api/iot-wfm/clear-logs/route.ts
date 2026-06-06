import { NextRequest, NextResponse } from "next/server";
import { clearDeviceLogs } from "@/app/watering/services/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  clearDeviceLogs(chipId);
  return NextResponse.json({ data: undefined });
}
