/**
 * 模拟器响应日志 — 展示每次请求的请求/响应详情
 */

'use client';

import { ClearOutlined } from '@ant-design/icons';
import { Card, Button, Tag } from 'antd';

import type { LogEntry } from '../hooks/use-iot-simulator';

const directionTag = {
  request: { color: 'blue' as const, label: 'REQ' },
  response: { color: 'green' as const, label: 'RES' },
};

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
      size="small"
      extra={
        <Button icon={<ClearOutlined />} size="small" onClick={onClear}>
          清空
        </Button>
      }
    >
      <div
        className="max-h-[400px] overflow-y-auto rounded bg-gray-50 p-2 font-mono text-xs"
      >
        {logs.length === 0 && <div className="text-gray-400">暂无请求</div>}
        {logs.map((log) => {
          const tag = directionTag[log.direction];
          return (
            <div
              key={log.id}
              className="mb-2 border-0 border-b border-solid border-gray-100 pb-2"
            >
              <div className="flex items-center gap-1.5">
                <Tag color={tag.color} className="m-0">
                  {tag.label}
                </Tag>
                <span className="text-gray-400">{log.timestamp}</span>
                {log.status !== undefined && (
                  <Tag color={log.status < 400 ? 'green' : 'red'}>
                    {log.status}
                  </Tag>
                )}
                {log.error && <Tag color="red">ERROR</Tag>}
              </div>
              <div className="mt-0.5 break-all text-gray-500">
                {log.url}
              </div>
              {log.body && (
                <pre className="mb-0 mt-1 text-[11px] text-gray-800">
                  {log.body}
                </pre>
              )}
              {log.error && (
                <div className="mt-0.5 text-red-500">{log.error}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
