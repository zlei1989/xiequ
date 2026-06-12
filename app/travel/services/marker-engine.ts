/**
 * 标注渲染引擎
 *
 * 封装增量 diff 更新逻辑。
 * 对比新旧 locations 列表，仅增/删/更新变化的标注，避免全量重建导致闪烁。
 *
 * 注意：AMap MarkerClusterer.setMarkers() 经实测为空操作（仅返回 length，不渲染），
 * setData() 需要 {lnglat, weight}[] 格式（非 AMap.Marker[]）。
 * 因此暂不使用 MarkerClusterer，直接通过 map.add/map.remove 管理标注。
 */

import { createMarkerIcon } from './marker-style';

import type { Location } from '../types';
import type { MarkerStatus } from './marker-style';

/** 根据打卡状态获取标注图标类型 */
function getStatus(loc: Location): MarkerStatus {
  return loc.checked ? 'visited' : 'unvisited';
}

/**
 * 标注渲染引擎
 *
 * 内部持有 locationId → AMap.Marker 映射，update 时做增量 diff。
 */
export function createMarkerEngine(
  map: AMap.Map,
  onMarkerClick: (loc: Location) => void,
) {
  const AMap = window.AMap;

  /** locationId → AMap.Marker */
  const markerMap = new Map<string, AMap.Marker>();
  /** 上次 locations 快照（id → Location），用于 diff */
  let previousLocations = new Map<string, Location>();

  /** 创建单个 Marker */
  function createMarker(loc: Location): AMap.Marker {
    const iconConfig = createMarkerIcon(getStatus(loc));
    const marker = new AMap.Marker({
      position: [loc.longitude, loc.latitude],
      title: loc.name,
      icon: new AMap.Icon(iconConfig),
      offset: new AMap.Pixel(-12, -12),
    });
    marker.on('click', () => { onMarkerClick(loc); });
    return marker;
  }

  /**
   * 增量更新标注
   *
   * diff 后增量操作 markerMap，通过 map.add/map.remove 管理标注生命周期。
   */
  function update(locations: Location[]) {
    const newMap = new Map(locations.map((l) => [l.id, l]));

    // 删除：旧有而新无 → 从地图和 markerMap 中移除
    for (const [id, marker] of markerMap) {
      if (!newMap.has(id)) {
        map.remove(marker);
        markerMap.delete(id);
      }
    }

    // 新增 / 更新
    for (const [id, loc] of newMap) {
      const prev = previousLocations.get(id);
      const marker = markerMap.get(id);

      if (!prev && !marker) {
        // 新增：旧快照无，markerMap 也无 → 新建并直接添加到地图
        const m = createMarker(loc);
        markerMap.set(id, m);
        map.add(m);
      } else if (prev && marker && prev.checked !== loc.checked) {
        // checked 状态变更 → 原地替换图标
        const iconConfig = createMarkerIcon(getStatus(loc));
        marker.setIcon(new AMap.Icon(iconConfig));
      }
      // 其他字段变更（name 等）不重建 marker，忽略
    }

    previousLocations = newMap;
  }

  /** 销毁引擎，从地图移除所有标注 */
  function destroy() {
    for (const marker of markerMap.values()) {
      map.remove(marker);
    }
    markerMap.clear();
    previousLocations.clear();
  }

  return { update, destroy };
}
