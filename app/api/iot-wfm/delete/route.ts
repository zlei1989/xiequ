import { NextRequest, NextResponse } from "next/server";
import { deleteDevice } from "@/app/watering/services/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { chipId } = body;

  if (!chipId) {
    return NextResponse.json({ error: "chipId required" }, { status: 400 });
  }

  deleteDevice(chipId);
  return NextResponse.json({ data: undefined });
}
