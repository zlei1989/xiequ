/**
 * 搜索添加位置弹窗
 *
 * 调用高德地图 POI 搜索 API（services/amap.ts），展示搜索结果列表。
 */

'use client';

import { DotLoading, ErrorBlock, List, NavBar, Popup, SearchBar, Toast } from 'antd-mobile';
import { useState } from 'react';

import { useBackButton } from '@/lib/back-button';

import { searchPlace } from '../services/amap';

import type { AMapPoiItem } from '../services/amap';

/**
 * POI 搜索弹窗
 *
 * 调用高德地图 POI 搜索 API（services/amap.ts），展示搜索结果列表。
 * 点击结果项回调 onAdd 将选中地点添加到计划中。
 */
export function SearchPopup({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (location: {
    name: string;
    address: string;
    longitude: number;
    latitude: number;
  }) => void;
}) {
  useBackButton(visible, onClose);

  const [results, setResults] = useState<AMapPoiItem[]>([]);
  const [searching, setSearching] = useState(false);

  /**
   * 执行 POI 关键词搜索 —— 调用高德搜索 API，耗时 >500ms 时打 INFO 日志，
   * 失败时打 ERROR 日志并 Toast 提示。
   */
  async function handleSearch(keyword: string) {
    if (!keyword.trim()) return;
    setSearching(true);
    const startTime = Date.now();
    try {
      const items = await searchPlace(keyword);
      const elapsed = Date.now() - startTime;
      if (elapsed > 500) {
        console.info(`[Travel] POI 搜索耗时 ${String(elapsed)}ms, keyword=${keyword}, 结果数=${String(items.length)}`);
      }
      setResults(items);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '搜索失败';
      console.error('[Travel] POI 搜索失败:', err, { keyword });
      if (err instanceof Error && err.stack) console.error(err.stack);
      Toast.show({ icon: 'fail', content: '搜索失败: ' + message });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Popup
      bodyClassName="min-h-[50vh] max-h-[75vh] overflow-auto"
      closeOnMaskClick={true}
      position="bottom"
      visible={visible}
      onClose={onClose}
      onMaskClick={onClose}
    >
      <NavBar onBack={onClose}>添加位置</NavBar>
      <div className="sticky top-0 z-10">
        <SearchBar placeholder="选择位置"
          style={{ '--border-radius': '0px' }} onSearch={(val) => { void handleSearch(val); }} />
      </div>
      {searching ? (
        <DotLoading />
      ) : results.length === 0 ? (
        <ErrorBlock status="empty" title="暂无搜索结果" />
      ) : (
        <List>
          {results.map((item) => (
            <List.Item
              clickable
              description={item.address}
              key={item.id}
              onClick={() => {
                onAdd({
                  name: item.name,
                  address: item.address,
                  longitude: item.longitude,
                  latitude: item.latitude,
                });
              }
              }
            >
              {item.name}
            </List.Item>
          ))}
        </List>
      )}
    </Popup>
  );
}
