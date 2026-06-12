/**
 * 流程步骤编辑器 — 编辑单个 Step 的名称、负载、参数、超时、中断列表
 */

'use client';

import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { Input, InputNumber, Switch, Button, Select, Table, Empty } from 'antd';

import type { GpioInfo } from '../hooks/use-device-config';
import type { Step, Interrupt } from '../types';

/** 从 GPIO 键名列表生成 Select options（键名已含前缀如 load_0） */
function toOptions(keys: string[] | undefined) {
  if (!keys || keys.length === 0) {
    return [];
  }
  return keys.map((k) => ({ value: k, label: k }));
}

export function ProcessStepEditor({
  step,
  gpio,
  onChange,
  onRemove: _onRemove,
  onEditInterrupt,
  onAddInterrupt,
}: {
  step: Step;
  gpio: GpioInfo;
  onChange: (updated: Step) => void;
  onRemove: () => void;
  onEditInterrupt: (index: number) => void;
  onAddInterrupt: () => void;
}) {
  const loadOptions = toOptions(gpio.loads);
  const interruptColumns = [
    { title: '#', dataIndex: '_idx', width: 40, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '组件', dataIndex: 'component', key: 'component' },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, _record: Interrupt, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => { onEditInterrupt(index); }}
        />
      ),
    },
  ];

  const hasLoad = !!step.component;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          步骤名称
        </label>
        <Input
          value={step.name}
          onChange={(e) => { onChange({ ...step, name: e.target.value }); }}
          placeholder="输入步骤名称"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          负载
        </label>
        {loadOptions.length > 0 ? (
          <Select
            value={step.component ?? undefined}
            onChange={(v) => { onChange({ ...step, component: v }); }}
            options={loadOptions}
            allowClear
            placeholder="选择负载（可选）"
            className="w-full"
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用负载（loads），请等待设备上报 GPIO 状态"
            className="my-2"
          />
        )}
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          启动参数
        </label>
        {/*
         * begin/end 参数仅在选择负载后生效：
         * 负载是 PWM/GPIO 输出，参数控制输出强度（0-255），
         * 无负载时参数无意义，故禁用。
         */}
        <InputNumber
          value={step.value.begin as number}
          onChange={(v) =>
          { onChange({ ...step, value: { ...step.value, begin: v ?? 0 } }); }
          }
          disabled={!hasLoad}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          停止参数
        </label>
        <InputNumber
          value={step.value.end as number}
          onChange={(v) =>
          { onChange({ ...step, value: { ...step.value, end: v ?? 0 } }); }
          }
          disabled={!hasLoad}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          超时限制（毫秒）
        </label>
        <InputNumber
          value={step.timeout}
          onChange={(v) => { onChange({ ...step, timeout: v ?? 600000 }); }}
          step={1000}
          min={0}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          禁用
        </label>
        <Switch
          checked={!step.disabled}
          onChange={(checked) => { onChange({ ...step, disabled: !checked }); }}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>

      <div>
        <label className="mb-1 block text-[13px] text-gray-500">
          中断方式
        </label>
        <Table
          dataSource={step.interrupts || []}
          columns={interruptColumns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddInterrupt}
          block
          className="mt-2"
        >
          添加
        </Button>
      </div>
    </div>
  );
}
