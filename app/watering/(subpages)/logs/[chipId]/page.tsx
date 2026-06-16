/**
 * 设备日志页
 *
 * 展示设备 IoT 通信日志，支持下拉刷新和清空。
 * 使用 antd-mobile NavBar + PullToRefresh + ErrorBlock 构建移动端友好界面。
 * 日志数据由 services/db.ts 存储，不自动轮询。
 */

'use client';

import {
  Button,
  NavBar,
  PullToRefresh,
  DotLoading,
  ErrorBlock,
  Space,
  Dialog,
  Toast,
} from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';

import { BootCard, ProcessCard, groupByProcess, type ProcessGroup } from '../../../components/log-card';
import { useDeviceLogs } from '../../../hooks/use-device-logs';

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

  /**
   * 下拉刷新 / 重试加载 — load 失败时显示 Toast
   *
   * 首次加载失败由 ErrorBlock 处理（见 renderContent），不显示 Toast。
   */
  async function handleRefresh() {
    try {
      await load();
    } catch {
      Toast.show({ icon: 'fail', content: '刷新失败' });
    }
  }

  /** 渲染内容区：按状态分发 */
  function renderContent() {
    // 首次加载中
    if (loading && logs.length === 0) {
      return (<DotLoading />);
    }

    // 首次加载失败
    if (error && logs.length === 0) {
      return (
        <ErrorBlock
          description={error.message}
          status="default"
          title="加载失败"
        >
          <Button color="primary" size="small" onClick={() => { void handleRefresh(); }}>
            点击重试
          </Button>
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

    // 有日志数据 — 下拉刷新包裹，按流程分组后渲染开机卡/流程卡
    const groups: ProcessGroup[] = groupByProcess(logs);
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <Space direction="vertical" block className="px-3 pb-3">
          {groups.map((group) =>
            group.type === 'boot' ? (
              <BootCard
                allLogs={logs}
                group={group}
                key={`boot-${group.bootItem?.createdTime ?? ''}`}
              />
            ) : (
              <ProcessCard
                group={group}
                key={`process-${group.items[0]?.createdTime ?? ''}`}
              />
            ),
          )}
        </Space>
      </PullToRefresh>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-[var(--background)]">
        <NavBar
          right={
            <Button size="small" onClick={() => { void handleClear(); }}>
              <DeleteOutline />
            </Button>
          }
          onBack={() => { router.back(); }}
        >
          设备: {chipId}
        </NavBar>
      </div>
      {renderContent()}
    </>
  );
}
