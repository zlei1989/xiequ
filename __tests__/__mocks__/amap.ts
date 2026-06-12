/**
 * AMap SDK Mock — 用于 vitest 单元测试
 *
 * 模拟 window.AMap 全局对象上的核心类：Map, Marker, MarkerClusterer, Icon, Pixel, event。
 * 每个 mock 类记录调用参数和状态，供测试断言使用。
 */
import { vi } from 'vitest';

/** 创建一个带调用记录的 mock 类 */
function createMockClass(methods: Record<string, () => unknown> = {}) {
  return vi.fn().mockImplementation(function (this: Record<string, unknown>, ...args: unknown[]) {
    Object.assign(this, methods);
    (this as Record<string, unknown>)._constructorArgs = args;
    return this;
  });
}

export function createAmapMock() {
  const Pixel = createMockClass();

  const Icon = createMockClass();

  const Marker = createMockClass({
    on: vi.fn(),
    setIcon: vi.fn(),
    setLabel: vi.fn(),
  });

  const MarkerClusterer = createMockClass({
    addMarker: vi.fn(),
    removeMarker: vi.fn(),
    setMarkers: vi.fn(),
    destroy: vi.fn(),
  });

  const Map = createMockClass({
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    getZoom: vi.fn().mockReturnValue(13),
    getCenter: vi.fn().mockReturnValue({ lng: 116.4, lat: 39.9 }),
    on: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    destroy: vi.fn(),
    setMapStyle: vi.fn(),
    setContainer: vi.fn(),
  });

  const event = {
    addListener: vi.fn(),
  };

  return {
    Pixel,
    Icon,
    Marker,
    MarkerClusterer,
    Map,
    event,
    /** 设置 window.AMap 模拟全局对象 */
    install(hasClusterer = true) {
      const amap: Record<string, unknown> = {
        Pixel,
        Icon,
        Marker,
        Map,
        event,
        PlaceSearch: createMockClass({ search: vi.fn() }),
        Geolocation: createMockClass({ getCurrentPosition: vi.fn() }),
        Geocoder: createMockClass({ getAddress: vi.fn() }),
        DistrictSearch: createMockClass({ search: vi.fn() }),
      };
      if (hasClusterer) {
        amap.MarkerClusterer = MarkerClusterer;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AMap = amap;
      return amap;
    },
    uninstall() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).AMap;
    },
  };
}
