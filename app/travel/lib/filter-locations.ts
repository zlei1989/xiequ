/**
 * 位置搜索过滤
 *
 * 按关键字在名称、地址、备注中模糊匹配（不区分大小写）。
 * 空关键字返回全量。
 */

import type { Location } from '../types';

/** 按关键字过滤位置列表 */
export function filterLocations(
  locations: Location[],
  keyword: string,
): Location[] {
  if (!keyword.trim()) return locations;

  const kw = keyword.toLowerCase();
  return locations.filter((loc) => {
    return (
      loc.name.toLowerCase().includes(kw) ||
      loc.address.toLowerCase().includes(kw) ||
      (loc.comments || '').toLowerCase().includes(kw)
    );
  });
}
