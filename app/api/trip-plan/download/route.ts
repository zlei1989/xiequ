import { NextRequest, NextResponse } from "next/server";
import { getOssAdapter, isOssConfigured } from "@/lib/oss";

/**
 * 图片下载代理 API
 *
 * GET /api/trip-plan/download?type=cover&id=xxx
 * GET /api/trip-plan/download?type=icon&id=xxx
 *
 * 流程参考 TencentOss.getSignedUrl()：
 * 1. 服务端通过 OssAdapter.getSignedUrl() 生成临时访问 URL
 * 2. 302 重定向到签名 URL
 * 3. COS 验证签名后返回文件内容
 *
 * 签名 URL 包含临时访问凭据，无需暴露 SecretId/SecretKey 给前端。
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

    // 根据类型确定 OSS Key
    const ossKey = type === "icon"
      ? `trip-plan/icons/${id}`
      : `trip-plan/covers/${id}`;

    // 检查文件是否存在（参考 TencentOss.exists()）
    const fileExists = await adapter.exists(ossKey);
    if (!fileExists) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 获取签名 URL 并重定向（参考 TencentOss.getSignedUrl()）
    const signedUrl = await adapter.getSignedUrl(ossKey);
    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error("图片下载失败:", err);
    return NextResponse.json(
      { error: "下载失败", message: err.message },
      { status: 500 }
    );
  }
}
