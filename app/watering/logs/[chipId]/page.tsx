/**
 * 设备日志页
 *
 * 展示设备的 IoT 通信日志，支持刷新和清空。
 * 日志数据由 services/db.ts 存储，不自动轮询（需要手动加载）。
 */

'use client';

import { ArrowLeftOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Spin, Popconfirm, message } from 'antd';
import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';

import { LogViewer } from '../../components/log-viewer';
import { useDeviceLogs } from '../../hooks/use-device-logs';

/** 设备日志页 */
export default function DeviceLogsPage({
  params,
}: {
  /** Next.js 15 将动态路由参数以 Promise 形式传递，需 use() 解包 */
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, load, clear } = useDeviceLogs(chipId);

  // 组件挂载时加载日志（不自动轮询，日志数据量大）
  useEffect(() => {
    void load();
  }, [load]);

  async function handleClear() {
    try {
      await clear();
      message.success('日志已清空');
      await load();
    } catch (err: unknown) {
      console.error('[Watering] 清空日志失败:', { chipId, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      message.error(err instanceof Error ? err.message : String(err) || '清空日志失败');
    }
  }

  return (
    <div>
      {/* 页面内顶栏 — 匹配 iot-wfm LogsView header extra */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          marginBottom: 16,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => { router.back(); }}>
          返回
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => { void load(); }} loading={loading}>
            刷新
          </Button>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- antd Popconfirm onConfirm 内部支持 Promise 返回以显示 loading 状态 */}
          <Popconfirm title="确认清空日志？" onConfirm={handleClear}>
            <Button icon={<DeleteOutlined />} danger>
              清空
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* 设备名 — 匹配 LogsView 的 device-name */}
      <div style={{ padding: '0 16px', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>设备: {chipId}</h3>
      </div>

      {/* 日志内容 */}
      <div style={{ padding: '0 16px' }}>
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : (
          <LogViewer logs={logs} />
        )}
      </div>
    </div>
  );
}
