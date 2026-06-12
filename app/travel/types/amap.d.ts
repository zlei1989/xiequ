/**
 * 高德地图 AMap SDK 类型声明
 *
 * @amap/amap-jsapi-loader 的 global.d.ts 将 AMap 声明为 any，
 * 此文件提供 AMap 及相关实体的最小类型覆盖。
 *
 * 命名约定：AMap 命名空间内放实体类/接口定义，
 * AMapModule 描述 window.AMap 运行时对象的形状。
 */

/* ==================== AMap 实体类（命名空间内） ==================== */

declare namespace AMap {
  /** 地图实例 */
  class Map {
    constructor(container: HTMLDivElement, options: MapOptions);
    setCenter(pos: [number, number]): void;
    setZoom(zoom: number): void;
    getZoom(): number;
    getCenter(): { lng: number; lat: number };
    on(event: string, callback: () => void): void;
    add(overlay: object): void;
    remove(overlay: object): void;
    destroy(): void;
  }
  interface MapOptions {
    zoom: number;
    center: [number, number];
    resizeEnable?: boolean;
  }

  /** 标记点 */
  class Marker {
    constructor(options: MarkerOptions);
    on(event: string, callback: () => void): void;
  }
  interface MarkerOptions {
    position: [number, number];
    title?: string;
    label?: { content: string; offset: Pixel };
  }

  /** 像素坐标（用于 Marker 偏移） */
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class Pixel {
    constructor(x: number, y: number);
  }

  /** 事件系统 */
  const event: {
    addListener(
      target: object,
      event: string,
      callback: (result: unknown) => void,
    ): void;
  };

  /** POI 搜索 */
  class PlaceSearch {
    constructor(options: PlaceSearchOptions);
    search(
      keyword: string,
      callback: (status: string, result: PlaceSearchResult) => void,
    ): void;
  }
  interface PlaceSearchOptions {
    children?: number;
    pageSize?: number;
    city?: string;
  }
  interface PlaceSearchResult {
    info: string;
    poiList?: {
      pois: PoiItem[];
    };
  }
  interface PoiItem {
    id: string;
    name: string;
    address: string;
    location?: LngLat;
  }

  /** 浏览器定位 */
  class Geolocation {
    constructor(options: GeolocationOptions);
    getCurrentPosition(): void;
  }
  interface GeolocationOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
  }
  interface GeolocationResult {
    position: LngLat;
  }

  /** 地理编码/逆地理编码 */
  class Geocoder {
    constructor(options: GeocoderOptions);
    getAddress(
      position: [number, number],
      callback: (status: string, result: GeocoderResult) => void,
    ): void;
  }
  interface GeocoderOptions {
    radius?: number;
    extensions?: string;
  }
  interface GeocoderResult {
    info: string;
    regeocode: {
      addressComponent: {
        province: string;
        city: string;
        district: string;
        township?: string;
      };
      formattedAddress: string;
    };
  }

  /** 行政区划查询 */
  class DistrictSearch {
    constructor(options: DistrictSearchOptions);
    search(
      keyword: string,
      callback: (status: string, result: DistrictSearchResult) => void,
    ): void;
  }
  interface DistrictSearchOptions {
    subdistrict?: number;
    showbiz?: boolean;
  }
  interface DistrictSearchResult {
    districtList: DistrictItem[];
  }
  interface DistrictItem {
    adcode: string;
    name: string;
    center: LngLat;
    districtList?: DistrictItem[];
  }

  /** 经纬度 */
  interface LngLat {
    lng: number;
    lat: number;
  }
}

/* ==================== AMap 运行时命名空间对象 ==================== */

/** window.AMap 对象的形状 —— 将所有静态类、常量汇聚为一个接口 */
interface AMapModule {
  Map: new (container: HTMLDivElement, options: AMap.MapOptions) => AMap.Map;
  Marker: new (options: AMap.MarkerOptions) => AMap.Marker;
  Pixel: new (x: number, y: number) => AMap.Pixel;
  event: {
    addListener(
      target: object,
      event: string,
      callback: (result: unknown) => void,
    ): void;
  };
  PlaceSearch: new (options: AMap.PlaceSearchOptions) => AMap.PlaceSearch;
  Geolocation: new (options: AMap.GeolocationOptions) => AMap.Geolocation;
  Geocoder: new (options: AMap.GeocoderOptions) => AMap.Geocoder;
  DistrictSearch: new (options: AMap.DistrictSearchOptions) => AMap.DistrictSearch;
}

/** 扩展 Window（AMap 通过异步加载注入，初始不存在） */
interface Window {
  AMap: AMapModule | undefined;
  _AMapSecurityConfig?: { securityJsCode: string };
}
