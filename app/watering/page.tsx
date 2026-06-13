/**
 * 浇花帮手首页 — 设备列表
 *
 * 每 15 秒自动轮询设备状态，展示设备卡片列表。
 * 支持下拉刷新与手动按钮刷新，无设备时显示空状态提示。
 */

'use client';

import { ReloadOutlined, BugOutlined } from '@ant-design/icons';
import { Button, Spin, Empty, Space } from 'antd';
import { NavBar, PullToRefresh } from 'antd-mobile';
import { AppstoreOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';

import { DeviceCard } from './components/device-card';
import { useDevices } from './hooks/use-devices';

const isDev = process.env.NODE_ENV === 'development';

export default function WateringPage() {
  const { devices, loading, refresh } = useDevices(15000);
  const router = useRouter();
  return (
    <>
      <NavBar
        backIcon={
          <AppstoreOutline />
        }
        right={
          isDev && (
            <Button
              icon={<BugOutlined />}
              size="small"
              onClick={() => { router.push('/watering/debug'); }}
            >
              调试
            </Button>
          )
        }
        onBack={() => { router.push('/'); }}
      >
        我的设备
      </NavBar>
      {/* PullToRefresh: antd-mobile 下拉刷新，onRefresh 触发设备列表重新加载 */}
      <PullToRefresh onRefresh={refresh}>
          {/* 设备卡片列表 */}
          {loading && devices.length === 0 ? (
            <div className="py-12 text-center">
              <Spin />
            </div>
          ) : devices.length === 0 ? (
            <Empty description="暂无设备，等待 IoT 设备上线" />
          ) : (
            <span className="flex flex-col gap-4 px-3">
              {devices.map((device) => (
                <DeviceCard
                  device={device}
                  key={device.chipId}
                  onRefresh={() => { void refresh(); }}
                />
              ))}
            </span>
          )}

      </PullToRefresh>
    </>
  );
}
