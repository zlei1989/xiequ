/**
 * MarkerEngine 标注引擎单元测试
 *
 * 测试增量 diff 更新逻辑：新增/删除/状态变更/destroy。
 * 使用 AMap mock 模拟地图 SDK，验证 Marker 和 MarkerClusterer 的调用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createAmapMock } from '@/__tests__/__mocks__/amap';
import { createMarkerEngine } from '@/app/travel/services/marker-engine';
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

/** 创建 mock 地图实例并构造引擎（封装 mock any 类型转换） */
function setupEngine(onClick?: (loc: Location) => void) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const map = new mockAmap.Map();
  const onMarkerClick = onClick ?? (() => {});
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const engine = createMarkerEngine(map, onMarkerClick);
  return { engine };
}

describe('createMarkerEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAmap.install();
  });

  afterEach(() => {
    mockAmap.uninstall();
  });

  it('creates markers for initial locations', () => {
    const { engine } = setupEngine();

    const locations = [makeLocation({ id: '1' }), makeLocation({ id: '2' })];
    engine.update(locations);

    // 验证 Marker 被创建了 2 次
    const MarkerCtor = mockAmap.Marker as ReturnType<typeof vi.fn>;
    expect(MarkerCtor).toHaveBeenCalledTimes(2);
  });

  it('adds new marker for new location on second update', () => {
    const { engine } = setupEngine();

    engine.update([makeLocation({ id: '1' })]);
    const callCountAfterFirst = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    engine.update([makeLocation({ id: '1' }), makeLocation({ id: '2' })]);
    const callCountAfterSecond = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    // 第二次 update 只应新建 id='2' 的 marker（1 个），不应重建 id='1'
    expect(callCountAfterSecond - callCountAfterFirst).toBe(1);
  });

  it('removes marker for deleted location', () => {
    const { engine } = setupEngine();

    engine.update([makeLocation({ id: '1' }), makeLocation({ id: '2' })]);

    // 删除 id='1'
    engine.update([makeLocation({ id: '2' })]);

    // MarkerClusterer.removeMarker 被调用
    /* eslint-disable @typescript-eslint/no-unsafe-member-access,
        @typescript-eslint/no-unsafe-assignment */
    const clustererRemove = mockAmap.MarkerClusterer.mock.results[0]?.value?.removeMarker;
    /* eslint-enable @typescript-eslint/no-unsafe-member-access,
        @typescript-eslint/no-unsafe-assignment */
    expect(clustererRemove).toHaveBeenCalledTimes(1);
  });

  it('updates icon when checked status changes', () => {
    const { engine } = setupEngine();

    engine.update([makeLocation({ id: '1', checked: false })]);

    // 打卡
    engine.update([makeLocation({ id: '1', checked: true })]);

    // Marker.setIcon 被调用
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const markerInstance = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(markerInstance.setIcon).toHaveBeenCalledTimes(1);
  });

  it('does not recreate marker when only non-checked fields change', () => {
    const { engine } = setupEngine();

    engine.update([makeLocation({ id: '1', name: '旧名称' })]);
    const callCountAfterFirst = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    // 仅名称变化
    engine.update([makeLocation({ id: '1', name: '新名称', checked: false })]);
    const callCountAfterSecond = (mockAmap.Marker as ReturnType<typeof vi.fn>).mock.calls.length;

    // check 未变，不应重建 marker
    expect(callCountAfterSecond).toBe(callCountAfterFirst);
  });

  it('destroy cleans up clusterer and all markers', () => {
    const { engine } = setupEngine();

    engine.update([makeLocation({ id: '1' })]);
    engine.destroy();

    // MarkerClusterer.destroy 被调用
    /* eslint-disable @typescript-eslint/no-unsafe-member-access,
        @typescript-eslint/no-unsafe-assignment */
    const clustererDestroy = mockAmap.MarkerClusterer.mock.results[0]?.value?.destroy;
    /* eslint-enable @typescript-eslint/no-unsafe-member-access,
        @typescript-eslint/no-unsafe-assignment */
    expect(clustererDestroy).toHaveBeenCalled();
  });
});
