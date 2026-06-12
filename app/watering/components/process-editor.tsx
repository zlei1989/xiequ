/**
 * 流程编辑器 — 编辑单个 Process 的名称、触发按钮、步骤列表
 */

'use client';

import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { Input, Button, Table, Select, Empty } from 'antd';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Process, Step } from '../types';

/** 从 GPIO 键名列表生成 Select options */
function toOptions(keys: string[] | undefined) {
  if (!keys || keys.length === 0) {
    return [];
  }
  return keys.map((k) => ({ value: k, label: k }));
}

export function ProcessEditor({
  process,
  gpio,
  onChange,
  onRemove,
  onEditStep,
  onAddStep,
}: {
  process: Process;
  gpio: GpioInfo;
  onChange: (updated: Process) => void;
  onRemove: () => void;
  onEditStep: (index: number) => void;
  onAddStep: () => void;
}) {
  const columns = [
    { title: '#', dataIndex: '_idx', width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '组件', dataIndex: 'component', key: 'component' },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, record: Step, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => { onEditStep(index); }}
        />
      ),
    },
  ];

  const buttonOptions = toOptions(gpio.buttons);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          功能名称
        </label>
        <Input
          value={process.name}
          onChange={(e) => { onChange({ ...process, name: e.target.value }); }}
          placeholder="输入流程名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          触发按钮
        </label>
        {buttonOptions.length > 0 ? (
          <Select
            value={process.trigger ?? undefined}
            onChange={(v) => { onChange({ ...process, trigger: v }); }}
            options={buttonOptions}
            allowClear
            placeholder="选择触发按钮（可选）"
            style={{ width: '100%' }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用按钮（buttons），请等待设备上报 GPIO 状态"
            style={{ margin: '8px 0' }}
          />
        )}
      </div>

      <div>
        <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
          步骤
        </label>
        <Table
          dataSource={process.steps}
          columns={columns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddStep}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
