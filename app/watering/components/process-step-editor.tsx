"use client";

import { Input, InputNumber, Switch, Button, Select, Table } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Step, Interrupt } from "../types";

const LOAD_OPTIONS = [
  { value: "load_0", label: "load_0" },
  { value: "load_1", label: "load_1" },
  { value: "load_2", label: "load_2" },
  { value: "load_3", label: "load_3" },
];

export function ProcessStepEditor({
  step,
  onChange,
  onRemove,
  onEditInterrupt,
  onAddInterrupt,
}: {
  step: Step;
  onChange: (updated: Step) => void;
  onRemove: () => void;
  onEditInterrupt: (index: number) => void;
  onAddInterrupt: () => void;
}) {
  const interruptColumns = [
    { title: "#", dataIndex: "_idx", width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "组件", dataIndex: "component", key: "component" },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: any, record: Interrupt, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEditInterrupt(index)}
        />
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          步骤名称
        </label>
        <Input
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder="输入步骤名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          负载
        </label>
        <Select
          value={step.component}
          onChange={(v) => onChange({ ...step, component: v })}
          options={LOAD_OPTIONS}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          启动参数
        </label>
        <InputNumber
          value={step.value.begin as number}
          onChange={(v) =>
            onChange({ ...step, value: { ...step.value, begin: v ?? 0 } })
          }
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          停止参数
        </label>
        <InputNumber
          value={step.value.end as number}
          onChange={(v) =>
            onChange({ ...step, value: { ...step.value, end: v ?? 0 } })
          }
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          延迟运行（毫秒）
        </label>
        <InputNumber
          value={step.delay}
          onChange={(v) => onChange({ ...step, delay: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          超时限制（毫秒）
        </label>
        <InputNumber
          value={step.timeout}
          onChange={(v) => onChange({ ...step, timeout: v ?? 600000 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          禁用
        </label>
        <Switch
          checked={!step.disabled}
          onChange={(checked) => onChange({ ...step, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          中断方式
        </label>
        <Table
          dataSource={step.interrupts || []}
          columns={interruptColumns}
          rowKey={(_, index) => String(index)}
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddInterrupt}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
