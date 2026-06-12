/**
 * 标注图标样式生成
 *
 * 按打卡状态返回不同颜色的圆形 SVG 图标，颜色对齐 antd-mobile 语义色。
 * 从 DOM 读取 CSS 变量（--adm-color-success / --adm-color-primary），
 * 若 DOM 不可用则使用硬编码回退色值。
 */

/** 图标尺寸 */
const ICON_SIZE = 24;
/** 图标偏移（居中锚点） */
const ICON_OFFSET: [number, number] = [-12, -12];

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

/** 生成圆形标记 SVG data URL */
function createSvgDataUrl(fillColor: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}">
  <circle cx="12" cy="12" r="11" fill="${fillColor}" stroke="white" stroke-width="2"/>
  <circle cx="12" cy="12" r="4" fill="white"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${svg}`;
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
    imageOffset: ICON_OFFSET,
  };
}
