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

/** 带编号标注的图标尺寸 */
const NUMBERED_ICON_SIZE = 28;

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
 * 将 SVG 内容编码为 data URL
 *
 * 对 # 字符编码（%23），防止在部分环境（如移动端 WebView）
 * 中被误解析为 URL fragment，导致图标加载失败。
 */
function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${svg.replace(/#/g, '%23')}`;
}

/**
 * 生成圆形标记 SVG data URL
 */
function createSvgDataUrl(fillColor: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}">
  <circle cx="12" cy="12" r="11" fill="${fillColor}" stroke="white" stroke-width="2"/>
  <circle cx="12" cy="12" r="4" fill="white"/>
</svg>`;
  return encodeSvgDataUrl(svg);
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

/**
 * 创建带编号的路线标注图标配置
 *
 * 用于路线弹出层地图（routeMode），生成双圈圆形 SVG + 居中数字序号。
 * 颜色对齐 antd-mobile 语义色：激活态 warning 黄，非激活态 primary 蓝。
 *
 * @param num — 序号（1-based）
 * @param isActive — 是否为当前激活的标注
 * @returns 可用于 AMap.Icon 构造的配置对象
 */
export function createNumberedMarkerIcon(num: number, isActive: boolean) {
  const varName = isActive ? '--adm-color-warning' : '--adm-color-primary';
  const fallback = isActive ? '#ff8f1f' : '#1677ff';
  const color = getAdmColor(varName, fallback);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NUMBERED_ICON_SIZE}" height="${NUMBERED_ICON_SIZE}">
  <circle cx="14" cy="14" r="13" fill="${color}" stroke="white" stroke-width="2"/>
  <text x="14" y="14" text-anchor="middle" dominant-baseline="central" fill="white" font-size="12" font-weight="bold">${String(num)}</text>
</svg>`;
  return {
    image: encodeSvgDataUrl(svg),
    size: [NUMBERED_ICON_SIZE, NUMBERED_ICON_SIZE] as [number, number],
    imageSize: [NUMBERED_ICON_SIZE, NUMBERED_ICON_SIZE] as [number, number],
  };
}
