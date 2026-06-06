/**
 * 高德地图 SDK 封装
 *
 * 负责：
 * - 地图加载（动态注入 script）
 * - 位置搜索（PlaceSearch）
 * - GPS 定位（Geolocation）
 * - 地理编码（Geocoder）
 * - 行政区查询（DistrictSearch）
 *
 * 环境变量：NEXT_PUBLIC_AMAP_KEY
 */

const AMAP_SCRIPT_URL = "//webapi.amap.com/maps?v=1.4.15";

export function getAmapKey(): string {
  return process.env.NEXT_PUBLIC_AMAP_KEY || "";
}

export function getAmapScriptUrl(): string {
  const key = getAmapKey();
  return `${AMAP_SCRIPT_URL}&key=${key}&plugin=AMap.Driving,AMap.PlaceSearch,AMap.DistrictSearch,AMap.Geolocation,AMap.Geocoder`;
}

// 地图 SDK 加载 Promise（防止重复加载）
let amapPromise: Promise<any> | null = null;

/**
 * 动态加载高德地图 SDK
 */
export function loadAmap(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("AMap only works in browser"));
  }
  if ((window as any).AMap) {
    return Promise.resolve((window as any).AMap);
  }
  if (amapPromise) {
    return amapPromise;
  }
  amapPromise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = getAmapScriptUrl();
    el.onload = () => resolve((window as any).AMap);
    el.onerror = () => reject(new Error("AMap SDK 加载失败"));
    document.querySelector("head")?.appendChild(el);
  });
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
      city: city || "全国",
    });
    searcher.search(address, (status: string, result: any) => {
      if (status !== "complete" || !result.poiList) {
        return reject(new Error(`搜索失败: ${status}`));
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
 */
export async function getCurrentPosition(): Promise<[number, number]> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const geolocation = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    geolocation.getCurrentPosition();
    AMap.event.addListener(geolocation, "complete", (result: any) => {
      resolve([result.position.lng, result.position.lat]);
    });
    AMap.event.addListener(geolocation, "error", () => {
      reject(new Error("定位失败"));
    });
  });
}

/**
 * 逆地理编码：坐标 → 完整地址
 */
export async function reverseGeocode(position: [number, number]): Promise<string> {
  const AMap = await loadAmap();
  return new Promise((resolve, reject) => {
    const geocoder = new AMap.Geocoder({ radius: 1, extensions: "all" });
    geocoder.getAddress(position, (status: string, result: any) => {
      if (status !== "complete" || result.info !== "OK") {
        return reject(new Error("逆地理编码失败"));
      }
      const comp = result.regeocode.addressComponent;
      resolve([comp.province, comp.city, comp.district, result.regeocode.formattedAddress].filter(Boolean).join(" "));
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
    district.search("中国", (status: string, result: any) => {
      if (status !== "complete") return reject(new Error("获取省份失败"));
      const items: AMapDistrictItem[] = [];
      for (const obj of result.districtList[0].districtList) {
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
