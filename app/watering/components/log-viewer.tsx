/**
 * 日志查看器 — 按 stateId 分组展示 IoT 通信日志，支持耗时计算和格式化
 */

'use client';

import { Timeline, Tag, Divider } from 'antd';

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
  bootstrap: 'green',
  execute: 'orange',
  finish: 'orange',
  terminate: 'orange',
  change: 'blue',
  heartbeat: 'default',
  offline: 'gray',
};

export type LogItem = {
  event: string;
  createdTime: string;
  state?: unknown;
  stateId?: string;
  message?: string;
  process?: { name?: string };
  cause?: string;
};

/** 按 stateId 分组，每组按时间排序（倒序：最新的 stateId 组在前，组内正序）*/
function groupByStateId(logs: LogItem[]): Array<{ stateId: string; items: LogItem[] }> {
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
function formatDuration(items: LogItem[]): string {
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

/** 格式化日志消息 — 匹配 iot-wfm formatMessage */
function formatMessage(item: LogItem): string {
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

export function LogViewer({ logs }: { logs: LogItem[] }) {
  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        暂无日志
      </div>
    );
  }

  const groups = groupByStateId(logs);

  return (
    <div>
      {groups.map((group, gi) => (
        <div key={group.stateId}>
          {gi > 0 && <Divider className="my-3" />}
          <Timeline
            items={group.items.map((item, _idx) => ({
              color: eventColors[item.event] || 'gray',
              content: (
                <div className="text-sm">
                  <div
                    className="mb-0.5 flex items-center gap-1.5"
                  >
                    <Tag color={eventColors[item.event]}>
                      {eventLabels[item.event] || item.event}
                    </Tag>
                    <span className="text-xs text-gray-400">
                      {new Date(item.createdTime).toLocaleString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-[13px] text-gray-800">
                    {formatMessage(item)}
                  </div>
                </div>
              ),
            }))}
          />
          {hasExecute(group.items) && (
            <div
              className="ml-6 mt-1 text-xs text-gray-400"
            >
              用时 {formatDuration(group.items)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
