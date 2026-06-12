/**
 * 标注图标样式生成
 *
 * 按打卡状态返回不同颜色的圆形 SVG 图标，颜色对齐 antd-mobile 语义色。
 * 从 DOM 读取 CSS 变量（--adm-color-success / --adm-color-primary），
 * 若 DOM 不可用则使用硬编码回退色值。
 *
 * 注意：返回的配置直接传给 new AMap.Icon()，所以只包含 Icon 的有效属性。
 * AMap.Icon 的有效属性为 image、size、imageSize，不含 imageOffset（那是 MarkerCluster styles 的）。
 * 图标居中由 Marker 级别的 offset 控制（见 marker-engine.ts）。
 */

/** 图标尺寸 */
const ICON_SIZE = 24;

/** 从 DOM 读取 antd-mobile CSS 变量，不可用时返回 fallback */
export function getAdmColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  try {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    return color || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 生成圆形标记 SVG data URL
 *
 * 对 SVG 内容中 # 字符编码（%23），防止在部分环境（如移动端 WebView）
 * 中被误解析为 URL fragment，导致图标加载失败。
 */
function createSvgDataUrl(fillColor: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}">
  <circle cx="12" cy="12" r="11" fill="${fillColor}" stroke="white" stroke-width="2"/>
  <circle cx="12" cy="12" r="4" fill="white"/>
</svg>`;
  // 对 URL 中有特殊含义的字符编码，保证 data URL 在各种环境下正确解析
  return `data:image/svg+xml;charset=utf-8,${svg.replace(/#/g, '%23')}`;
}

/** 标注状态 */
export type MarkerStatus = 'visited' | 'unvisited';

/**
 * 创建标注图标配置
 *
 * @param status — 'visited'（已打卡，success 绿）或 'unvisited'（待打卡，primary 蓝）
 * @returns 可用于 AMap.Icon 构造的配置对象
 */
export function createMarkerIcon(status: MarkerStatus) {
  const varName = status === 'visited' ? '--adm-color-success' : '--adm-color-primary';
  const fallback = status === 'visited' ? '#00b578' : '#1677ff';
  const color = getAdmColor(varName, fallback);
  return {
    image: createSvgDataUrl(color),
    size: [ICON_SIZE, ICON_SIZE] as [number, number],
    imageSize: [ICON_SIZE, ICON_SIZE] as [number, number],
  };
}
