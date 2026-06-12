/**
 * GET /api/travel/download — 图片访问 API
 *
 * 接收 type + id 参数，检查 COS 文件是否存在后重定向到带样式后缀的公开 URL。
 * 注意：依赖 OSS 配置，未配置时返回 503。
 */

import { NextResponse } from 'next/server';

import { getOssAdapter, isOssConfigured } from '@/lib/oss';

import type { NextRequest } from 'next/server';

const POSTERS_PREFIX = process.env.OSS_TRAVEL_POSTERS_PREFIX || 'apps/travel/posters';

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
  const type = searchParams.get('type') || 'cover';
  const id = searchParams.get('id') || '';

  console.info('[Travel] download 请求', { type, id });

  if (!id) {
    console.error('[Travel] download 缺少 id 参数');
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  if (!isOssConfigured()) {
    console.warn('[Travel] OSS 未配置，download 不可用');
    return NextResponse.json({ error: 'OSS 未配置' }, { status: 503 });
  }

  try {
    const adapter = getOssAdapter();

    // 检查 poster 文件是否存在
    const ossKey = `${POSTERS_PREFIX}/${id}.jpg`;
    const fileExists = await adapter.exists(ossKey);
    if (!fileExists) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    // 重定向到带 COS CI 样式后缀的公共访问 URL
    const bucket = adapter.getBucket();
    const region = adapter.getEndpoint();
    const styledUrl = `https://${bucket}.cos.${region}.myqcloud.com/${POSTERS_PREFIX}/${id}.jpg/${type}`;
    return NextResponse.redirect(styledUrl);
  } catch (err: unknown) {
    console.error('[Travel] 图片访问失败:', err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    return NextResponse.json(
      { error: '访问失败', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
