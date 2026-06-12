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
        style={{
          maxHeight: 400,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          background: '#fafafa',
          padding: 8,
          borderRadius: 4,
        }}
      >
        {logs.length === 0 && <div style={{ color: '#999' }}>暂无请求</div>}
        {logs.map((log) => {
          const tag = directionTag[log.direction];
          return (
            <div
              key={log.id}
              style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag color={tag.color} style={{ margin: 0 }}>
                  {tag.label}
                </Tag>
                <span style={{ color: '#999' }}>{log.timestamp}</span>
                {log.status !== undefined && (
                  <Tag color={log.status < 400 ? 'green' : 'red'}>
                    {log.status}
                  </Tag>
                )}
                {log.error && <Tag color="red">ERROR</Tag>}
              </div>
              <div style={{ color: '#666', wordBreak: 'break-all', marginTop: 2 }}>
                {log.url}
              </div>
              {log.body && (
                <pre style={{ margin: '4px 0 0', color: '#333', fontSize: 11 }}>
                  {log.body}
                </pre>
              )}
              {log.error && (
                <div style={{ color: '#ff4d4f', marginTop: 2 }}>{log.error}</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
