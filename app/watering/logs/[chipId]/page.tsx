/**
 * 设备日志页
 *
 * 展示设备 IoT 通信日志，支持下拉刷新和清空。
 * 使用 antd-mobile NavBar + PullToRefresh + ErrorBlock 构建移动端友好界面。
 * 日志数据由 services/db.ts 存储，不自动轮询。
 */

'use client';

import {
  NavBar,
  PullToRefresh,
  DotLoading,
  ErrorBlock,
  SafeArea,
  Dialog,
  Toast,
} from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
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
  const { logs, loading, error, load, clear } = useDeviceLogs(chipId);

  // 组件挂载时加载日志
  useEffect(() => {
    void load();
  }, [load]);

  /** 清空日志：弹窗确认 → 执行清空 → Toast 提示 */
  async function handleClear() {
    const confirmed = await Dialog.confirm({
      title: '确认清空日志？',
      content: '操作不可撤销',
    });
    if (!confirmed) return;

    try {
      await clear();
      Toast.show({ icon: 'success', content: '日志已清空' });
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '清空日志失败';
      console.error('[Watering] 清空日志失败:', { chipId, message, stack: err instanceof Error ? err.stack : undefined });
      Toast.show({ icon: 'fail', content: message });
    }
  }

  /** 渲染内容区：按状态分发 */
  function renderContent() {
    // 首次加载中
    if (loading && logs.length === 0) {
      return (
        <div className="flex items-center justify-center py-24">
          <DotLoading />
        </div>
      );
    }

    // 首次加载失败
    if (error && logs.length === 0) {
      return (
        <ErrorBlock
          status="default"
          title="加载失败"
          description={error.message}
        >
          <a onClick={() => { void load(); }}>点击重试</a>
        </ErrorBlock>
      );
    }

    // 空数据
    if (!loading && logs.length === 0) {
      return (
        <ErrorBlock
          status="empty"
          title="暂无日志"
        />
      );
    }

    // 有日志数据 — 下拉刷新包裹
    return (
      <PullToRefresh onRefresh={load}>
        <LogViewer logs={logs} />
      </PullToRefresh>
    );
  }

  return (
    <>
      <SafeArea position="top" />
      <NavBar
        onBack={() => { router.back(); }}
        right={
          <DeleteOutline
            fontSize={22}
            className="text-gray-500"
            onClick={() => { void handleClear(); }}
          />
        }
      >
        设备: {chipId}
      </NavBar>
      {renderContent()}
    </>
  );
}
