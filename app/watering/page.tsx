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
    <div style={{ padding: '12px 16px' }}>
      {/* 操作栏 — 匹配 iot-wfm 的 #extra 插槽 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>设备列表</h2>
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
        <div style={{ textAlign: 'center', padding: 48 }}>
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
