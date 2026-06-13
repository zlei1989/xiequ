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
  onRemove: _onRemove,
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
    { title: '#', dataIndex: '_idx', width: 40, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '组件', dataIndex: 'component', key: 'component' },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, _record: Step, index: number) => (
        <Button
          icon={<EditOutlined />}
          size="small"
          type="text"
          onClick={() => { onEditStep(index); }}
        />
      ),
    },
  ];

  const buttonOptions = toOptions(gpio.buttons);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          功能名称
        </label>
        <Input
          placeholder="输入流程名称"
          value={process.name}
          onChange={(e) => { onChange({ ...process, name: e.target.value }); }}
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          触发按钮
        </label>
        {buttonOptions.length > 0 ? (
          <Select
            allowClear
            className="w-full"
            options={buttonOptions}
            placeholder="选择触发按钮（可选）"
            value={process.trigger ?? undefined}
            onChange={(v) => { onChange({ ...process, trigger: v }); }}
          />
        ) : (
          <Empty
            className="my-2"
            description="设备无可用按钮（buttons），请等待设备上报 GPIO 状态"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          步骤
        </label>
        <Table
          bordered
          columns={columns}
          dataSource={process.steps}
          pagination={false}
          rowKey="key"
          size="small"
        />
        <Button
          block
          className="mt-2"
          icon={<PlusOutlined />}
          type="dashed"
          onClick={onAddStep}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
