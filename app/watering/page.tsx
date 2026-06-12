/**
 * 浇花帮手首页 — 设备列表
 *
 * 每 15 秒自动轮询设备状态，展示设备卡片列表。
 * 支持手动刷新，无设备时显示空状态提示。
 */

'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Spin, Empty } from 'antd';

import { DeviceCard } from './components/device-card';
import { useDevices } from './hooks/use-devices';

export default function WateringPage() {
  const { devices, loading, refresh } = useDevices(15000);

  return (
    <div className="px-4 py-3">
      {/* 操作栏 — 匹配 iot-wfm 的 #extra 插槽 */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold">设备列表</h2>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => { void refresh(); }}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      </div>

      {/* 设备卡片列表 */}
      {loading && devices.length === 0 ? (
        <div className="py-12 text-center">
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <Empty description="暂无设备，等待 IoT 设备上线" />
      ) : (
        devices.map((device) => (
          <DeviceCard key={device.chipId} device={device} onRefresh={() => { void refresh(); }} />
        ))
      )}
    </div>
  );
}
