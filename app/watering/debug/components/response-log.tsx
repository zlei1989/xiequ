/**
 * 模拟器响应日志 — 展示每次请求的请求/响应详情
 *
 * 使用 antd-mobile Card + 自绘标签替换 antd Tag。
 */

'use client';

import { Button, Card } from 'antd-mobile';
import { useState, useCallback } from 'react';

import type { LogEntry } from '../hooks/use-iot-simulator';

/** 方向标签配置 */
const directionMeta: Record<
  LogEntry['direction'],
  { label: string; color: string }
> = {
  request: { label: 'REQ', color: '#1677ff' },
  response: { label: 'RES', color: '#52c41a' },
};

/** URL 最大展示长度，超出则截断 */
const URL_MAX_LENGTH = 80;

export function ResponseLog({
  logs,
  onClear,
}: {
  logs: LogEntry[];
  onClear: () => void;
}) {
  return (
    <Card
      title="请求日志"
      extra={
        <Button size="mini" color="danger" fill="none" onClick={onClear}>
          清空
        </Button>
      }
    >
      <div className="max-h-[400px] overflow-y-auto rounded bg-gray-50 p-2 font-mono text-xs">
        {logs.length === 0 && (
          <div className="py-4 text-center text-gray-400">暂无请求</div>
        )}
        {logs.map((log) => (
          <LogItem key={log.id} log={log} />
        ))}
      </div>
    </Card>
  );
}

/** 单条日志条目 — 含 URL 截断/展开 */
function LogItem({ log }: { log: LogEntry }) {
  const meta = directionMeta[log.direction];
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const urlTruncated =
    log.url.length > URL_MAX_LENGTH && !expanded
      ? log.url.slice(0, URL_MAX_LENGTH) + '…'
      : log.url;
  const canExpand = log.url.length > URL_MAX_LENGTH;

  return (
    <div className="mb-2 border-0 border-b border-solid border-gray-100 pb-2">
      {/* 标签行 */}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block rounded px-1.5 py-px text-[10px] font-medium text-white"
          style={{ background: meta.color }}
        >
          {meta.label}
        </span>
        <span className="text-gray-400">{log.timestamp}</span>
        {log.status !== undefined && (
          <span
            className={`inline-block rounded px-1.5 py-px text-[10px] font-medium text-white ${
              log.status < 400 ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {log.status}
          </span>
        )}
        {log.error && (
          <span className="inline-block rounded bg-red-500 px-1.5 py-px text-[10px] font-medium text-white">
            ERROR
          </span>
        )}
      </div>

      {/* URL（可展开） */}
      <div
        className={`mt-0.5 break-all text-gray-500 ${
          canExpand ? 'cursor-pointer select-none' : ''
        }`}
        onClick={canExpand ? toggleExpand : undefined}
      >
        {urlTruncated}
      </div>

      {/* Body */}
      {log.body && (
        <pre className="mb-0 mt-1 overflow-x-auto text-[11px] text-gray-800">
          {log.body}
        </pre>
      )}

      {/* Error */}
      {log.error && (
        <div className="mt-0.5 text-red-500">{log.error}</div>
      )}
    </div>
  );
}
