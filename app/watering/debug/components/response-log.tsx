/**
 * 模拟器响应日志 — 展示每次请求的请求/响应详情
 *
 * 使用 antd-mobile 组件，Card 容器 + ErrorBlock 空态 + List 列表 + Tag 标签。
 */

'use client';

import { Button, Card, ErrorBlock, List, Tag } from 'antd-mobile';
import { useState, useCallback } from 'react';

import type { LogEntry } from '../hooks/use-iot-simulator';

/** 方向标签配置 */
const directionMeta: Record<
  LogEntry['direction'],
  { label: string; color: 'primary' | 'success' }
> = {
  request: { label: 'REQ', color: 'primary' },
  response: { label: 'RES', color: 'success' },
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
      {logs.length === 0 ? (
        <ErrorBlock status="empty" />
      ) : (
        <List
          className="max-h-[400px] overflow-y-auto text-xs"
          style={{
            '--border-top': 'none',
          }}
        >
          {logs.map((log) => (
            <LogItem key={log.id} log={log} />
          ))}
        </List>
      )}
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
    <List.Item
      prefix={
        <Tag color={meta.color} fill="solid">
          {meta.label}
        </Tag>
      }
      extra={
        log.status !== undefined ? (
          <Tag color={log.status < 400 ? 'success' : 'danger'}>
            {log.status}
          </Tag>
        ) : log.error ? (
          <Tag color="danger" fill="solid">
            ERROR
          </Tag>
        ) : undefined
      }
      description={
        <span
          onClick={canExpand ? toggleExpand : undefined}
          className={`break-all ${canExpand ? 'cursor-pointer select-none' : ''}`}
        >
          {urlTruncated}
        </span>
      }
      clickable={false}
    >
      <span className="text-[11px] text-gray-400">
        {log.timestamp}
      </span>
      {log.body && (
        <pre className="mb-0 mt-1 overflow-x-auto font-mono text-[11px] text-gray-800">
          {log.body}
        </pre>
      )}
    </List.Item>
  );
}
