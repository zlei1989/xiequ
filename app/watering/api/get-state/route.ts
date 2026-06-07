import { NextRequest, NextResponse } from "next/server";
import { getDeviceState, updateTick } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const clientStateId = searchParams.get("stateId") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  await updateTick(chipId);

  // 读取当前状态
  const state = await getDeviceState(chipId);

  // 比较是否有变化
  const changed = !state || clientStateId !== state.stateId;

  return NextResponse.json({
    data: {
      ...(changed && state ? state : { stateId: state?.stateId }),
      changed,
    },
  });
}
