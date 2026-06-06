"use client";

import { Input, InputNumber, Switch, Button, Select, Table, Empty } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Step, Interrupt } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";

/** 从 GPIO 键名列表生成 Select options，带前缀 */
function toOptions(keys: string[] | undefined, prefix: string) {
  if (!keys || keys.length === 0) {
    return [];
  }
  return keys.map((k) => ({ value: `${prefix}${k}`, label: k }));
}

export function ProcessStepEditor({
  step,
  gpio,
  onChange,
  onRemove,
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
  const loadOptions = toOptions(gpio.loads, "load_");
  const buttonOptions = toOptions(gpio.buttons, "button_");
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
        {loadOptions.length > 0 ? (
          <Select
            value={step.component}
            onChange={(v) => onChange({ ...step, component: v })}
            options={loadOptions}
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用负载（loads），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          触发按钮
        </label>
        {buttonOptions.length > 0 ? (
          <Select
            value={step.trigger ?? undefined}
            onChange={(v) => onChange({ ...step, trigger: v })}
            options={buttonOptions}
            allowClear
            placeholder="选择触发按钮（可选）"
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用按钮（buttons），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
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
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
