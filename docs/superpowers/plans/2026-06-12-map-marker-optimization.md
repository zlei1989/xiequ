# 地图标注渲染优化与亮暗主题 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 TripMap 切换 Tab 后标注消失 bug，添加 MarkerClusterer 聚类、按状态区分标注颜色、系统亮暗主题跟随。

**Architecture:** 在 TripMap 中引入 `mapReady` 状态串行化异步时序；新增 `marker-style.ts`（antd-mobile 语义色图标）、`marker-engine.ts`（增量 diff + AMap.MarkerClusterer）、`use-map-theme.ts`（MutationObserver 监听系统主题）三个独立模块。不改变组件树结构。

**Tech Stack:** AMap JSAPI v2.0, @amap/amap-jsapi-loader, React 19, antd-mobile 5.x, vitest, TypeScript

---

## 文件结构

```
新增:
  app/travel/services/marker-style.ts       — 标注图标生成（antd-mobile 语义色）
  app/travel/services/marker-engine.ts      — 标注引擎（增量 diff + 聚类）
  app/travel/hooks/use-map-theme.ts         — 系统主题跟随 Hook
  __tests__/__mocks__/amap.ts              — AMap SDK mock
  __tests__/travel/marker-style.test.ts    — marker-style 单元测试
  __tests__/travel/marker-engine.test.ts   — marker-engine 单元测试
  __tests__/travel/use-map-theme.test.ts   — useMapTheme 单元测试

修改:
  app/travel/types/amap.d.ts               — 补充 Icon, MarkerClusterer, setMapStyle 等类型
  app/travel/services/amap.ts              — plugins 加 AMap.MarkerClusterer
  app/travel/components/trip-map.tsx        — mapReady + MarkerEngine + useMapTheme
```

---

### Task 1: 扩展 AMap 类型声明

**Files:**
- Modify: `app/travel/types/amap.d.ts`

- [ ] **Step 1: 补充缺失的 AMap 类型**

在 `declare namespace AMap` 块内的 `Marker` 类中补充 `setIcon`、`setLabel` 方法，在 `MarkerOptions` 中补充 `icon`、`offset` 属性。在 `Map` 类中补充 `setMapStyle`、`setContainer`。新增 `Icon`、`MarkerClusterer` 类声明。

在 `AMapModule` 接口中补充 `Icon`、`MarkerClusterer` 构造函数。

编辑 `app/travel/types/amap.d.ts`：

在 `AMap.Map` 类中（第 24 行 `destroy()` 之后）添加：

```typescript
    setMapStyle(style: string): void;
    setContainer(container: HTMLDivElement): void;
    getContainer(): HTMLElement | null;
```

替换 `AMap.Marker` 类及 `MarkerOptions`（第 33-41 行）：

```typescript
  /** 标记点 */
  class Marker {
    constructor(options: MarkerOptions);
    on(event: string, callback: () => void): void;
    setIcon(icon: Icon): void;
    setLabel(label: { content: string; offset: Pixel }): void;
  }
  interface MarkerOptions {
    position: [number, number];
    title?: string;
    label?: { content: string; offset: Pixel };
    icon?: Icon;
    offset?: Pixel;
  }
```

在 `AMap.Pixel` 类之后（第 47 行之后）添加：

```typescript
  /** 自定义图标 */
  class Icon {
    constructor(options: IconOptions);
  }
  interface IconOptions {
    image: string;
    size: Pixel;
    imageOffset?: Pixel;
  }

  /** 点聚合 */
  class MarkerClusterer {
    constructor(
      map: Map,
      markers: Marker[],
      options?: MarkerClustererOptions,
    );
    addMarker(marker: Marker): void;
    removeMarker(marker: Marker): void;
    setMarkers(markers: Marker[]): void;
    destroy(): void;
  }
  interface MarkerClustererOptions {
    gridSize?: number;
    renderClusterMarker?: (context: ClusterMarkerContext) => ClusterMarkerRender;
    renderMarker?: (context: MarkerRenderContext) => MarkerRender;
  }
  interface ClusterMarkerContext {
    count: number;
    markers: Marker[];
  }
  interface ClusterMarkerRender {
    content: string;
    offset: Pixel;
  }
  interface MarkerRenderContext {
    marker: Marker;
    count: number;
  }
  interface MarkerRender {
    content: string;
  }
```

在 `AMapModule` 接口中（`DistrictSearch` 行之后）添加：

```typescript
  Icon: new (options: AMap.IconOptions) => AMap.Icon;
  MarkerClusterer: new (
    map: AMap.Map,
    markers: AMap.Marker[],
    options?: AMap.MarkerClustererOptions,
  ) => AMap.MarkerClusterer;
```

同时更新 `Window` 接口中 `AMap` 的类型为允许 `MarkerClusterer` 可能不可用（插件加载失败时降级）：

将 `AMap: AMapModule | undefined;` 改为 `AMap: (AMapModule & { MarkerClusterer?: AMapModule['MarkerClusterer'] }) | undefined;`

---

### Task 2: 创建 AMap SDK Mock

**Files:**
- Create: `__tests__/__mocks__/amap.ts`

- [ ] **Step 1: 创建 Mock 文件**

```typescript
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
```

---

### Task 3: marker-style 服务（TDD）

**Files:**
- Create: `__tests__/travel/marker-style.test.ts`
- Create: `app/travel/services/marker-style.ts`

- [ ] **Step 1: 编写测试**

创建 `__tests__/travel/marker-style.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createMarkerIcon, getAdmColor } from '@/app/travel/services/marker-style';

describe('getAdmColor', () => {
  it('returns fallback color when document is not available', () => {
    // node 环境下 document 不可用（getComputedStyle 不存在），应返回 fallback
    const result = getAdmColor('--adm-color-success', '#00b578');
    expect(result).toBe('#00b578');
  });

  it('returns fallback when CSS variable is empty', () => {
    // 模拟 getComputedStyle 返回空字符串
    const originalGetComputedStyle = global.getComputedStyle;
    global.getComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: vi.fn().mockReturnValue(''),
    }) as unknown as typeof global.getComputedStyle;

    const result = getAdmColor('--adm-color-success', '#00b578');
    expect(result).toBe('#00b578');

    global.getComputedStyle = originalGetComputedStyle;
  });
});

describe('createMarkerIcon', () => {
  it('returns icon config with success color for visited status', () => {
    // node 环境使用 fallback
    const icon = createMarkerIcon('visited');
    expect(icon.image).toContain('#00b578');
    expect(icon.image).toContain('data:image/svg+xml');
    expect(icon.size).toEqual([24, 24]);
    expect(icon.imageOffset).toEqual([-12, -12]);
  });

  it('returns icon config with primary color for unvisited status', () => {
    const icon = createMarkerIcon('unvisited');
    expect(icon.image).toContain('#1677ff');
  });

  it('generates valid SVG with circle elements', () => {
    const icon = createMarkerIcon('visited');
    const decoded = decodeURIComponent(icon.image.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(decoded).toContain('<circle');
    expect(decoded).toContain('r="11"');
    expect(decoded).toContain('r="4"');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/travel/marker-style.test.ts
```

预期：全部 FAIL（文件不存在）

- [ ] **Step 3: 实现 marker-style.ts**

创建 `app/travel/services/marker-style.ts`：

```typescript
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
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/travel/marker-style.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app/travel/services/marker-style.ts __tests__/travel/marker-style.test.ts
git commit -m "feat: 添加 marker-style 服务（antd-mobile 语义色标注图标）"
```

---

### Task 4: MarkerEngine 标注引擎（TDD）

**Files:**
- Create: `__tests__/travel/marker-engine.test.ts`
- Create: `app/travel/services/marker-engine.ts`

- [ ] **Step 1: 编写测试**

创建 `__tests__/travel/marker-engine.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createMarkerEngine } from '@/app/travel/services/marker-engine';
import { createAmapMock } from '@/__tests__/__mocks__/amap';

import type { Location } from '@/app/travel/types';

const mockAmap = createAmapMock();

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: '1',
    name: '测试地点',
    address: '测试地址',
    longitude: 116.4,
    latitude: 39.9,
    checked: false,
    comments: '',
    deleted: false,
    createdTime: '2026-01-01',
    ...overrides,
  };
}

describe('createMarkerEngine', () => {
  beforeEach(() => {
    mockAmap.install();
  });

  afterEach(() => {
    mockAmap.uninstall();
  });

  it('creates markers for initial locations', () => {
    const map = new mockAmap.Map();
    const onMarkerClick = () => {};
    const engine = createMarkerEngine(map as unknown as AMap.Map, onMarkerClick);

    const locations = [makeLocation({ id: '1' }), makeLocation({ id: '2' })];
    engine.update(locations);

    // 验证 Marker 被创建了 2 次（通过 mock 调用次数）
    const MarkerCtor = mockAmap.Marker as ReturnType<typeof vi.fn>;
    expect(MarkerCtor).toHaveBeenCalledTimes(2);
  });

  it('adds new marker for new location on second update', () => {
    const map = new mockAmap.Map();
    const onMarkerClick = () => {};
    const engine = createMarkerEngine(map as unknown as AMap.Map, onMarkerClick);

    engine.update([makeLocation({ id: '1' })]);
    const callCountAfterFirst = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    engine.update([makeLocation({ id: '1' }), makeLocation({ id: '2' })]);
    const callCountAfterSecond = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    // 第二次 update 只应新建 id='2' 的 marker（1 个），不应重建 id='1'
    expect(callCountAfterSecond - callCountAfterFirst).toBe(1);
  });

  it('removes marker for deleted location', () => {
    const map = new mockAmap.Map();
    const onMarkerClick = () => {};
    const engine = createMarkerEngine(map as unknown as AMap.Map, onMarkerClick);

    engine.update([makeLocation({ id: '1' }), makeLocation({ id: '2' })]);

    // 删除 id='1'
    engine.update([makeLocation({ id: '2' })]);

    // MarkerClusterer.removeMarker 被调用
    const clustererRemove = mockAmap.MarkerClusterer.mock.results[0]?.value?.removeMarker;
    expect(clustererRemove).toHaveBeenCalledTimes(1);
  });

  it('updates icon when checked status changes', () => {
    const map = new mockAmap.Map();
    const onMarkerClick = () => {};
    const engine = createMarkerEngine(map as unknown as AMap.Map, onMarkerClick);

    engine.update([makeLocation({ id: '1', checked: false })]);

    // 打卡
    engine.update([makeLocation({ id: '1', checked: true })]);

    // Marker.setIcon 被调用
    const markerInstance = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(markerInstance.setIcon).toHaveBeenCalledTimes(1);
  });

  it('does not recreate marker when only non-checked fields change', () => {
    const map = new mockAmap.Map();
    const onMarkerClick = () => {};
    const engine = createMarkerEngine(map as unknown as AMap.Map, onMarkerClick);

    engine.update([makeLocation({ id: '1', name: '旧名称' })]);
    const callCountAfterFirst = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    // 仅名称变化
    engine.update([makeLocation({ id: '1', name: '新名称', checked: false })]);
    const callCountAfterSecond = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    // check 未变，不应重建 marker
    expect(callCountAfterSecond).toBe(callCountAfterFirst);
  });

  it('destroy cleans up clusterer and all markers', () => {
    const map = new mockAmap.Map();
    const onMarkerClick = () => {};
    const engine = createMarkerEngine(map as unknown as AMap.Map, onMarkerClick);

    engine.update([makeLocation({ id: '1' })]);
    engine.destroy();

    // MarkerClusterer.destroy 被调用
    const clustererDestroy = mockAmap.MarkerClusterer.mock.results[0]?.value?.destroy;
    expect(clustererDestroy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/travel/marker-engine.test.ts
```

预期：全部 FAIL（文件不存在）

- [ ] **Step 3: 实现 marker-engine.ts**

创建 `app/travel/services/marker-engine.ts`：

```typescript
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
  const AMap = window.AMap!;

  /** locationId → AMap.Marker */
  const markerMap = new Map<string, AMap.Marker>();
  /** 上次 locations 快照（id → Location），用于 diff */
  let previousLocations = new Map<string, Location>();

  /** MarkerClusterer 实例（可能为 null，降级时用 map.add/map.remove） */
  let clusterer: AMap.MarkerClusterer | null = null;

  // 尝试初始化 MarkerClusterer，不可用时降级为逐个 Marker 渲染
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
   *
   * 对比新旧 locations：
   * - id 在新不在旧 → 新建 Marker
   * - id 相同且 checked 变化 → 替换 Marker icon
   * - id 在旧不在新 → 移除 Marker
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/travel/marker-engine.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app/travel/services/marker-engine.ts __tests__/travel/marker-engine.test.ts __tests__/__mocks__/amap.ts
git commit -m "feat: 添加 MarkerEngine 标注引擎（增量 diff + 聚类）"
```

---

### Task 5: useMapTheme Hook（TDD）

**Files:**
- Create: `__tests__/travel/use-map-theme.test.ts`
- Create: `app/travel/hooks/use-map-theme.ts`

- [ ] **Step 0: 安装测试依赖**

```bash
npm install --save-dev jsdom @testing-library/react
```

- [ ] **Step 1: 编写测试**

创建 `__tests__/travel/use-map-theme.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// 注意：此测试需要 jsdom 环境
import { useMapTheme } from '@/app/travel/hooks/use-map-theme';

describe('useMapTheme', () => {
  beforeEach(() => {
    // 设置初始 data 属性
    document.documentElement.setAttribute('data-prefers-color-scheme', 'light');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-prefers-color-scheme');
  });

  it('returns null when map is null', () => {
    const { result } = renderHook(() => useMapTheme(null));
    expect(result.current).toBeNull();
  });

  it('returns current theme when map is provided', () => {
    const mockMap = {
      setMapStyle: vi.fn(),
    };
    const { result } = renderHook(() => useMapTheme(mockMap as unknown as AMap.Map));
    expect(result.current).toBe('light');
  });

  it('calls map.setMapStyle with dark style when data-prefers-color-scheme is dark', () => {
    document.documentElement.setAttribute('data-prefers-color-scheme', 'dark');
    const mockMap = {
      setMapStyle: vi.fn(),
    };
    renderHook(() => useMapTheme(mockMap as unknown as AMap.Map));
    expect(mockMap.setMapStyle).toHaveBeenCalledWith('amap://styles/dark');
  });

  it('calls map.setMapStyle with light style when data-prefers-color-scheme is light', () => {
    const mockMap = {
      setMapStyle: vi.fn(),
    };
    renderHook(() => useMapTheme(mockMap as unknown as AMap.Map));
    expect(mockMap.setMapStyle).toHaveBeenCalledWith('amap://styles/light');
  });
});
```

确保 vitest 支持 jsdom 环境。检查是否需要修改 vitest.config.ts 或在测试文件顶部添加 `// @vitest-environment jsdom`。

如果需要，在测试文件第一行添加：

```typescript
// @vitest-environment jsdom
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/travel/use-map-theme.test.ts
```

预期：全部 FAIL（文件不存在）

- [ ] **Step 3: 实现 use-map-theme.ts**

创建 `app/travel/hooks/use-map-theme.ts`：

```typescript
/**
 * 地图亮暗主题跟随 Hook
 *
 * 读取 document.documentElement.dataset.prefersColorScheme 获取系统主题，
 * 通过 MutationObserver 监听变化，调用 map.setMapStyle() 切换 AMap 暗色/亮色样式。
 */

import { useEffect, useRef, useState } from 'react';

/** AMap 地图样式 ID */
const STYLE_MAP = {
  light: 'amap://styles/light',
  dark: 'amap://styles/dark',
} as const;

type Theme = keyof typeof STYLE_MAP;

/** 从 DOM 读取当前系统主题 */
function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const val = document.documentElement.dataset.prefersColorScheme;
  return val === 'dark' ? 'dark' : 'light';
}

/**
 * 监听系统主题变化并同步到 AMap 地图
 *
 * @param map — AMap.Map 实例（null 时不做任何操作）
 * @returns 当前主题字符串（'light' | 'dark'），map 为 null 时返回 null
 */
export function useMapTheme(map: AMap.Map | null): Theme | null {
  const [theme, setTheme] = useState<Theme | null>(() =>
    map ? readTheme() : null,
  );
  // 用 ref 避免 MutationObserver 回调中读到过期 theme
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    if (!map) return;

    // 初始设置
    const initial = readTheme();
    setTheme(initial);
    map.setMapStyle(STYLE_MAP[initial]);

    // 监听 data-prefers-color-scheme 属性变化
    const observer = new MutationObserver(() => {
      const next = readTheme();
      if (next !== themeRef.current) {
        setTheme(next);
        // 加过渡避免突兀跳变（通过操作地图容器样式）
        const container = map.getContainer?.();
        if (container && 'style' in container) {
          (container as HTMLElement).style.transition = 'opacity 300ms';
          (container as HTMLElement).style.opacity = '0.6';
          map.setMapStyle(STYLE_MAP[next]);
          setTimeout(() => {
            (container as HTMLElement).style.opacity = '1';
          }, 100);
        } else {
          map.setMapStyle(STYLE_MAP[next]);
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-prefers-color-scheme'],
    });

    return () => {
      observer.disconnect();
    };
  }, [map]);

  return theme;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/travel/use-map-theme.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app/travel/hooks/use-map-theme.ts __tests__/travel/use-map-theme.test.ts
git commit -m "feat: 添加 useMapTheme Hook（系统亮暗主题跟随）"
```

---

### Task 6: 更新 amap.ts 插件列表

**Files:**
- Modify: `app/travel/services/amap.ts`

- [ ] **Step 1: 在 plugins 数组中添加 AMap.MarkerClusterer**

编辑 `app/travel/services/amap.ts`，第 54-59 行 plugins 数组：

```typescript
      plugins: [
        'AMap.PlaceSearch',
        'AMap.DistrictSearch',
        'AMap.Geolocation',
        'AMap.Geocoder',
        'AMap.MarkerClusterer',
      ],
```

- [ ] **Step 2: 提交**

```bash
git add app/travel/services/amap.ts
git commit -m "feat: amap plugins 添加 AMap.MarkerClusterer"
```

---

### Task 7: 重构 TripMap.tsx

**Files:**
- Modify: `app/travel/components/trip-map.tsx`

- [ ] **Step 1: 重写 TripMap 组件**

用以下内容替换 `app/travel/components/trip-map.tsx`：

```typescript
/**
 * 高德地图组件
 *
 * 使用 forwardRef + useImperativeHandle 暴露 setCenter 方法供父组件调用。
 * 异步加载 AMap SDK，通过 aborted 标记防止卸载后内存泄漏。
 * 通过 mapReady 状态串行化地图初始化与标注重建时序，防止竞态导致标注消失。
 * 集成 MarkerEngine（增量 diff + 聚类）和 useMapTheme（系统主题跟随）。
 */

'use client';

import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';

import { loadAmap } from '../services/amap';
import { createMarkerEngine } from '../services/marker-engine';
import { useMapTheme } from '../hooks/use-map-theme';

import type { Location } from '../types';
import type { CSSProperties } from 'react';

export const TripMap = forwardRef<
  { setCenter: (pos: [number, number]) => void },
  {
    locations: Location[];
    onMarkerClick: (location: Location) => void;
    style?: CSSProperties;
  }
>(function TripMap({ locations, onMarkerClick, style }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const engineRef = useRef<ReturnType<typeof createMarkerEngine> | null>(null);

  /** 地图实例是否就绪 */
  const [mapReady, setMapReady] = useState(false);
  /** SDK 加载错误 */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 重试计数 */
  const retryRef = useRef(0);

  // 主题跟随（mapReady 后再传实例）
  useMapTheme(mapReady ? mapRef.current : null);

  useImperativeHandle(ref, () => ({
    setCenter(pos: [number, number]) {
      if (mapRef.current) {
        mapRef.current.setCenter(pos);
        mapRef.current.setZoom(15);
      }
    },
  }));

  /** 地图初始化 effect */
  useEffect(() => {
    let aborted = false;

    async function createMap() {
      if (!containerRef.current) return;

      const startTime = Date.now();
      let AMap: AMapModule;
      try {
        AMap = await loadAmap();
      } catch (err: unknown) {
        console.error('[Travel] 高德地图 SDK 加载失败:', err);
        if (err instanceof Error && err.stack) console.error(err.stack);
        if (!aborted) setLoadError('地图加载失败，请检查网络后重试');
        return;
      }
      const loadElapsed = Date.now() - startTime;
      if (loadElapsed > 500) {
        console.info(`[Travel] 高德地图 SDK 加载耗时 ${String(loadElapsed)}ms`);
      }

      if (aborted) return;

      const container = containerRef.current;

      const centerStr = localStorage.getItem('TRAVEL_MAP_CENTER');
      const zoomStr = localStorage.getItem('TRAVEL_MAP_ZOOM');
      const center: [number, number] = centerStr
        ? (JSON.parse(centerStr) as [number, number])
        : [116.397477, 39.908692];
      const zoom: number = zoomStr ? (JSON.parse(zoomStr) as number) : 13;

      const map = new AMap.Map(container, {
        zoom,
        center,
        resizeEnable: true,
      });

      map.on('moveend', () => {
        const c = map.getCenter();
        localStorage.setItem('TRAVEL_MAP_CENTER', JSON.stringify([c.lng, c.lat]));
      });
      map.on('zoomend', () => {
        localStorage.setItem('TRAVEL_MAP_ZOOM', JSON.stringify(map.getZoom()));
      });

      if (!aborted) {
        mapRef.current = map;
        setMapReady(true);
      } else {
        map.destroy();
      }
    }

    void createMap();

    return () => {
      aborted = true;
      // 清理标注引擎
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  /** 标注重建 effect —— 依赖 mapReady + locations */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // 首次运行时创建引擎
    if (!engineRef.current) {
      engineRef.current = createMarkerEngine(mapRef.current, onMarkerClick);
    }

    engineRef.current.update(locations);
  }, [locations, mapReady, onMarkerClick]);

  /** 重试加载 */
  function handleRetry() {
    retryRef.current += 1;
    setLoadError(null);
    // 触发 effect 重新执行：卸载清理 → 重挂载
    if (mapRef.current) {
      mapRef.current.destroy();
      mapRef.current = null;
    }
    setMapReady(false);
  }

  // 加载失败降级 UI
  if (loadError && retryRef.current >= 3) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#999',
          fontSize: 14,
          gap: 12,
        }}
      >
        <span>地图加载失败</span>
        <span style={{ fontSize: 12 }}>请检查网络连接后刷新页面</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#999',
          fontSize: 14,
          gap: 12,
        }}
      >
        <span>{loadError}</span>
        <button
          onClick={handleRetry}
          style={{
            padding: '8px 16px',
            borderRadius: 4,
            border: '1px solid #1677ff',
            background: 'white',
            color: '#1677ff',
            cursor: 'pointer',
          }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 'calc(100vh - 64px)', ...style }}
    />
  );
});
```

- [ ] **Step 2: 格式化与检查**

```bash
npm run format
npm run check
```

修复所有 ESLint 和 TypeScript 错误。

- [ ] **Step 3: 提交**

```bash
git add app/travel/components/trip-map.tsx
git commit -m "fix: TripMap 引入 mapReady 时序 + MarkerEngine + useMapTheme"
```

---

### Task 8: 最终验证

**Files:**
- 无新建文件

- [ ] **Step 1: 运行所有测试**

```bash
npx vitest run
```

预期：全部 PASS

- [ ] **Step 2: 运行完整检查**

```bash
npm run check
```

预期：零错误

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

预期：构建成功

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: 最终验证通过 — 全部测试 + 类型检查 + 构建"
```
