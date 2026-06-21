/**
 * 高德地图 SDK 封装
 *
 * 负责：
 * - 地图加载（@amap/amap-jsapi-loader）
 * - 位置搜索（PlaceSearch）
 * - GPS 定位（Geolocation）
 * - 地理编码（Geocoder）
 * - 行政区查询（DistrictSearch）
 *
 * 环境变量：NEXT_PUBLIC_AMAP_KEY, NEXT_PUBLIC_AMAP_SECRET
 */

export function getAmapKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_KEY || '';
}

export function getAmapSecret(): string {
  return process.env.NEXT_PUBLIC_AMAP_SECRET || '';
}

/** 地图 SDK 加载 Promise（防止重复加载） */
let amapPromise: Promise<AMapModule> | null = null;

/**
 * 动态加载高德地图 SDK（基于 @amap/amap-jsapi-loader）
 *
 * @amap/amap-jsapi-loader 的 load() 返回 Promise<any>，此处转为 Promise<AMapModule>
 */
export function loadAmap(): Promise<AMapModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('AMap only works in browser'));
  }
  /** window.AMap 由 @amap/amap-jsapi-loader 异步注入，初始为 undefined */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }
  if (amapPromise) {
    return amapPromise;
  }

  const secret = getAmapSecret();
  if (secret) {
    window._AMapSecurityConfig = {
      securityJsCode: secret,
    };
  }

  amapPromise = import('@amap/amap-jsapi-loader').then(({ load }) =>
    load({
      key: getAmapKey(),
      version: '2.0',
      plugins: [
        'AMap.PlaceSearch',
        'AMap.DistrictSearch',
        'AMap.Geolocation',
        'AMap.Geocoder',
        'AMap.Driving',
      ],
    }),
  ) as Promise<AMapModule>;

  return amapPromise;
}

/**
 * 搜索地点
 */
export async function searchPlace(address: string, city?: string): Promise<AMapPoiItem[]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const searcher = new AMap.PlaceSearch({
      children: 1,
      pageSize: 48,
      city: city || '全国',
    });
    searcher.search(address, (status: string, result: AMap.PlaceSearchResult) => {
      if (status !== 'complete' || !result.poiList) {
        reject(new Error(`搜索失败: ${status}`)); return;
      }
      const items: AMapPoiItem[] = [];
      for (const poi of result.poiList.pois) {
        if (!poi.address || !poi.location) continue;
        items.push({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          longitude: poi.location.lng,
          latitude: poi.location.lat,
        });
      }
      resolve(items);
    });
  });
}

/**
 * 获取当前位置
 *
 * 使用 AMap.Geolocation 回调模式（getCurrentPosition 直接接收 callback），
 * 避免 Turbopack dev 模式下 AMap.event 可能为 undefined 的问题。
 */
export async function getCurrentPosition(): Promise<[number, number]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const geolocation = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    geolocation.getCurrentPosition((status: string, result: unknown) => {
      if (status === 'complete') {
        const r = result as AMap.GeolocationResult;
        resolve([r.position.lng, r.position.lat]);
      } else {
        reject(new Error('定位失败'));
      }
    });
  });
}

/**
 * 逆地理编码：坐标 → 完整地址
 */
export async function reverseGeocode(position: [number, number]): Promise<string> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const geocoder = new AMap.Geocoder({ radius: 1, extensions: 'all' });
    geocoder.getAddress(position, (status: string, result: AMap.GeocoderResult) => {
      if (status !== 'complete' || result.info !== 'OK') {
        reject(new Error('逆地理编码失败')); return;
      }
      const comp = result.regeocode.addressComponent;
      resolve([comp.province, comp.city, comp.district, result.regeocode.formattedAddress].filter(Boolean).join(' '));
    });
  });
}

/**
 * 获取省份列表
 */
export async function getProvinceOptions(): Promise<AMapDistrictItem[]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const district = new AMap.DistrictSearch({ subdistrict: 1, showbiz: false });
    district.search('中国', (status: string, result: AMap.DistrictSearchResult) => {
      if (status !== 'complete') { reject(new Error('获取省份失败')); return; }
      // 中国的第一个子节点为省份列表
      const provinces = result.districtList[0]?.districtList;
      if (!provinces) { reject(new Error('获取省份失败')); return; }
      const items: AMapDistrictItem[] = [];
      for (const obj of provinces) {
        items.push({
          adcode: obj.adcode,
          name: obj.name,
          longitude: obj.center.lng,
          latitude: obj.center.lat,
        });
      }
      resolve(items);
    });
  });
}

// 类型定义
export type AMapPoiItem = {
  id: string;
  name: string;
  address: string;
  longitude: number;
  latitude: number;
};

export type AMapDistrictItem = {
  adcode: string;
  name: string;
  longitude: number;
  latitude: number;
};
