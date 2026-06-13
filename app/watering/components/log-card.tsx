/**
 * 日志查看器 — 用 antd-mobile Steps + Card + Space 展示 IoT 通信日志
 *
 * 每个 stateId 组为一个 Card，组内每条事件为一个 Steps.Step。
 * 保留原有的分组、排序、格式化逻辑。
 */

'use client';

import { Card, Space, Steps, Tag, ErrorBlock } from 'antd-mobile';

/** ── 常量 ── */

const eventLabels: Record<string, string> = {
  bootstrap: '开机',
  execute: '执行',
  finish: '完成',
  terminate: '终止',
  change: '变更',
  heartbeat: '心跳',
  offline: '离线',
};

const eventColors: Record<string, string> = {
  bootstrap: 'success',
  execute: 'warning',
  finish: 'success',
  terminate: 'danger',
  change: 'primary',
  heartbeat: 'default',
  offline: 'default',
};

/** ── 类型 ── */

export type LogItem = {
  event: string;
  createdTime: string;
  state?: unknown;
  stateId?: string;
  message?: string;
  process?: { name?: string };
  cause?: string;
};

/** ── 工具函数 ── */

/**
 * 按 stateId 分组，每组按时间排序
 * 组内按时间正序，组间按最新一条时间倒序（最新的组在前）
 */
export function groupByStateId(logs: LogItem[]): Array<{ stateId: string; items: LogItem[] }> {
  const map: Record<string, LogItem[]> = {};
  for (const log of logs) {
    const key = log.stateId || '_unknown';
    if (!map[key]) map[key] = [];
    map[key].push(log);
  }
  // 组内按时间正序
  for (const key of Object.keys(map)) {
    const bucket = map[key];
    if (bucket) {
      bucket.sort(
        (a, b) =>
          new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
      );
    }
  }
  // 组间按最新一条时间倒序（最新的组在前）
  return Object.entries(map)
    .map(([stateId, items]) => ({ stateId, items }))
    .sort((a, b) => {
      const lastA = new Date(a.items[a.items.length - 1]?.createdTime ?? 0).getTime();
      const lastB = new Date(b.items[b.items.length - 1]?.createdTime ?? 0).getTime();
      return lastB - lastA;
    });
}

/** 计算用时 */
export function formatDuration(items: LogItem[]): string {
  if (items.length < 2) return '';
  const begin = new Date(items[0]?.createdTime ?? 0).getTime();
  const end = new Date(items[items.length - 1]?.createdTime ?? 0).getTime();
  const seconds = Math.round((end - begin) / 1000);
  if (seconds > 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h)}时${String(m)}分${String(s)}秒`;
  }
  if (seconds > 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m)}分${String(s)}秒`;
  }
  return `${String(seconds)}秒`;
}

/** 判断是否包含执行事件 */
function hasExecute(items: LogItem[]): boolean {
  return items.some((item) => item.event === 'execute' || item.event === 'change');
}

/**
 * 格式化日志消息
 * 优先使用 item.message，否则根据事件类型生成中文描述
 */
export function formatMessage(item: LogItem): string {
  if (item.message) return item.message;
  switch (item.event) {
    case 'bootstrap':
      return `设备${item.cause ? `(原因:${item.cause})` : ''}开机`;
    case 'execute':
      return `执行流程${item.process?.name ? `: ${item.process.name}` : ''}`;
    case 'terminate':
      return '终止流程';
    case 'finish':
      return '完成流程';
    case 'offline':
      return '设备离线';
    default:
      return item.event;
  }
}

/**
 * 判定事件对应的 Step status
 *
 * - 正常结束类事件 → finish
 * - 异常中断类事件 → error
 * - 心跳等持续类事件 → wait
 */
function getStepStatus(event: string): 'wait' | 'finish' | 'error' {
  switch (event) {
    case 'bootstrap':
    case 'execute':
    case 'finish':
    case 'change':
      return 'finish';
    case 'terminate':
    case 'offline':
      return 'error';
    case 'heartbeat':
      return 'wait';
    default:
      return 'finish';
  }
}

/**
 * 判定组的整体状态
 *
 * 包含 finish 且不含 offline/terminate → 已完成
 * execute 仅表示流程触发，不代表完成，不作为「已完成」的判定依据
 */
function getGroupStatus(items: LogItem[]): { label: string; color: string } {
  const hasFinish = items.some((i) => i.event === 'finish');
  const hasAbnormal = items.some((i) => i.event === 'offline' || i.event === 'terminate');
  if (hasFinish && !hasAbnormal) {
    return { label: '已完成', color: 'success' };
  }
  return { label: '异常', color: 'danger' };
}

/** 格式化时间为 HH:MM:SS */
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** ── 组件 ── */

export function LogCard({ logs }: { logs: LogItem[] }) {
  // 防御性空检查 — page.tsx 虽然已经拦截了空数组，
  // 但保留此检查确保 LogViewer 独立使用时仍有正确的空态展示。
  if (logs.length === 0) {
    return (
      <ErrorBlock
        status="empty"
        title="暂无日志"
      />
    );
  }

  const groups = groupByStateId(logs);

  return (
    <Space block direction="vertical">
      {groups.map((group) => {
        const groupStatus = getGroupStatus(group.items);
        const duration = hasExecute(group.items) ? formatDuration(group.items) : null;

        return (
          <Card
            key={group.stateId}
            title={`State ID: ${group.stateId}`}
            extra={
              <Tag color={groupStatus.color} fill="solid">
                {groupStatus.label}
              </Tag>
            }
          >
            <Steps direction="vertical">
              {group.items.map((item, idx) => (
                <Steps.Step
                  description={
                    <span className="text-[13px] text-gray-700">
                      {formatMessage(item)}
                    </span>
                  }
                  key={`${group.stateId}-${idx}`}
                  status={getStepStatus(item.event)}
                  title={
                    <Space align="center">
                      <Tag color={eventColors[item.event] || 'default'} fill="solid">
                        {eventLabels[item.event] || item.event}
                      </Tag>
                      <span className="text-xs text-gray-400">
                        {formatTime(item.createdTime)}
                      </span>
                    </Space>
                  }
                />
              ))}
            </Steps>
            {duration && (
              <div className="mt-2 flex justify-end text-xs text-gray-400">
                用时 {duration}
              </div>
            )}
          </Card>
        );
      })}
    </Space>
  );
}
