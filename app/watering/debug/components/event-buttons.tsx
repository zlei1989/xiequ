/**
 * 模拟器事件按钮 — 触发 getState / pushBootstrap / pushChange / pushFinish
 */

'use client';

import { PlayCircleOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Button, Space, Select, Input, Card } from 'antd';
import { useState } from 'react';

const CHANGE_TYPES = [
  { value: 'step_ready', label: 'step_ready (步骤就绪)' },
  { value: 'step_begin', label: 'step_begin (步骤开始)' },
  { value: 'step_end', label: 'step_end (步骤正常结束)' },
  { value: 'step_timeout', label: 'step_timeout (步骤超时)' },
  { value: 'step_interrupt', label: 'step_interrupt (步骤中断)' },
];

const CAUSE_OPTIONS = [
  { value: '0', label: '0 (正常上电)' },
  { value: '2', label: '2 (外部唤醒)' },
  { value: '4', label: '4 (定时器唤醒)' },
];

export function EventButtons({
  onGetState,
  onPushBootstrap,
  onPushChange,
  onPushFinish,
  loading,
}: {
  onGetState: () => Promise<void>;
  onPushBootstrap: (cause: string) => Promise<void>;
  onPushChange: (type: string, message: string) => Promise<void>;
  onPushFinish: () => Promise<void>;
  loading: boolean;
}) {
  const [changeType, setChangeType] = useState('step_begin');
  const [changeMessage, setChangeMessage] = useState('');
  const [bootstrapCause, setBootstrapCause] = useState('0');

  return (
    <Card title="模拟事件" size="small">
      <Space wrap orientation="vertical" style={{ width: '100%' }}>
        <Space wrap>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => onGetState()}
            loading={loading}
          >
            getState (轮询)
          </Button>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => onPushBootstrap(bootstrapCause)}
            loading={loading}
          >
            bootstrap (开机)
          </Button>
          <Select
            value={bootstrapCause}
            onChange={setBootstrapCause}
            options={CAUSE_OPTIONS}
            style={{ width: 160 }}
          />
        </Space>

        <Space wrap>
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => onPushChange(changeType, changeMessage)}
            loading={loading}
          >
            change (步骤变更)
          </Button>
          <Select
            value={changeType}
            onChange={setChangeType}
            options={CHANGE_TYPES}
            style={{ width: 220 }}
          />
          <Input
            placeholder="message (可选)"
            value={changeMessage}
            onChange={(e) => { setChangeMessage(e.target.value); }}
            style={{ width: 200 }}
          />
        </Space>

        <Button
          icon={<PlayCircleOutlined />}
          onClick={() => onPushFinish()}
          loading={loading}
        >
          finish (流程完成)
        </Button>
      </Space>
    </Card>
  );
}
