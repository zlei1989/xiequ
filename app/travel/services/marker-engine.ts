/**
 * 标注渲染引擎
 *
 * 封装 AMap.MarkerClusterer 聚类 + 增量 diff 更新逻辑。
 * 对比新旧 locations 列表，仅增/删/更新变化的标注，避免全量重建导致闪烁。
 * MarkerClusterer 插件不可用时降级为逐个 Marker 直接渲染。
 */

import { createMarkerIcon } from './marker-style';

import type { Location } from '../types';
import type { MarkerStatus } from './marker-style';

/** 聚合半径（px） */
const CLUSTER_GRID_SIZE = 80;

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

  /** MarkerClusterer 实例（可能为 null，降级时用 map.add/map.remove） */
  let clusterer: AMap.MarkerClusterer | null = null;

  // 尝试初始化 MarkerClusterer，不可用时降级为逐个 Marker 渲染
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (AMap.MarkerClusterer) {
    clusterer = new AMap.MarkerClusterer(map, [], {
      gridSize: CLUSTER_GRID_SIZE,
      renderClusterMarker(context) {
        const count = context.count;
        const color = '#1677ff'; // antd-mobile primary
        const size = count < 10 ? 36 : count < 100 ? 44 : 52;
        return {
          content: `<div style="
            background:${color};color:white;border-radius:50%;
            width:${size}px;height:${size}px;display:flex;
            align-items:center;justify-content:center;
            font-size:${size * 0.4}px;font-weight:bold;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
          ">${count}</div>`,
          offset: new AMap.Pixel(-size / 2, -size / 2),
        };
      },
    });
  } else {
    console.warn('[Travel] MarkerClusterer 插件不可用，降级为逐个标注渲染');
  }

  /** 创建单个 Marker */
  function createMarker(loc: Location): AMap.Marker {
    const iconConfig = createMarkerIcon(getStatus(loc));
    const marker = new AMap.Marker({
      position: [loc.longitude, loc.latitude],
      title: loc.name,
      icon: new AMap.Icon(iconConfig),
      offset: new AMap.Pixel(-12, -12),
      label: {
        content: loc.name,
        offset: new AMap.Pixel(0, -30),
      },
    });
    marker.on('click', () => { onMarkerClick(loc); });
    return marker;
  }

  /** 添加标注到地图 */
  function addToMap(marker: AMap.Marker) {
    if (clusterer) {
      clusterer.addMarker(marker);
    } else {
      map.add(marker);
    }
  }

  /** 从地图移除标注 */
  function removeFromMap(marker: AMap.Marker) {
    if (clusterer) {
      clusterer.removeMarker(marker);
    } else {
      map.remove(marker);
    }
  }

  /**
   * 增量更新标注
   */
  function update(locations: Location[]) {
    const newMap = new Map(locations.map((l) => [l.id, l]));

    // 删除：旧有而新无
    for (const [id, marker] of markerMap) {
      if (!newMap.has(id)) {
        removeFromMap(marker);
        markerMap.delete(id);
      }
    }

    // 新增 / 更新
    for (const [id, loc] of newMap) {
      const prev = previousLocations.get(id);
      const marker = markerMap.get(id);

      if (!prev && !marker) {
        // 新增：旧快照无，markerMap 也无 → 新建
        const m = createMarker(loc);
        markerMap.set(id, m);
        addToMap(m);
      } else if (prev && marker && prev.checked !== loc.checked) {
        // checked 状态变更 → 原地替换图标
        const iconConfig = createMarkerIcon(getStatus(loc));
        marker.setIcon(new AMap.Icon(iconConfig));
      }
      // 其他字段变更（name 等）不重建 marker，忽略
    }

    previousLocations = newMap;
  }

  /** 销毁引擎，清理所有标注和聚类器 */
  function destroy() {
    for (const marker of markerMap.values()) {
      map.remove(marker);
    }
    markerMap.clear();
    previousLocations.clear();
    if (clusterer) {
      clusterer.destroy();
      clusterer = null;
    }
  }

  return { update, destroy };
}
