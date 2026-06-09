import { NextRequest, NextResponse } from "next/server";
import { getOssAdapter, isOssConfigured } from "@/lib/oss";

/**
 * 图片访问 API
 *
 * GET /travel/api/download?type=cover&id=xxx
 * GET /travel/api/download?type=icon&id=xxx
 *
 * 重定向到带 COS CI 样式后缀的公共访问 URL：
 * https://{bucket}.cos.{region}.myqcloud.com/apps/travel/posters/{id}.jpg/{type}
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "cover";
  const id = searchParams.get("id") || "";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (!isOssConfigured()) {
    return NextResponse.json({ error: "OSS 未配置" }, { status: 503 });
  }

  try {
    const adapter = getOssAdapter();

    // 检查 poster 文件是否存在
    const ossKey = `apps/travel/posters/${id}.jpg`;
    const fileExists = await adapter.exists(ossKey);
    if (!fileExists) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 重定向到带 COS CI 样式后缀的公共访问 URL
    const bucket = adapter.getBucket();
    const region = adapter.getEndpoint();
    const styledUrl = `https://${bucket}.cos.${region}.myqcloud.com/apps/travel/posters/${id}.jpg/${type}`;
    return NextResponse.redirect(styledUrl);
  } catch (err: any) {
    console.error("图片访问失败:", err);
    return NextResponse.json(
      { error: "访问失败", message: err.message },
      { status: 500 }
    );
  }
}
