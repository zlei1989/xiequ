"use client";

import { Input, InputNumber, Switch, Button, Space, Card } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Step, Interrupt } from "../types";
import { ProcessInterruptEditor } from "./process-interrupt-editor";

export function ProcessStepEditor({
  step,
  onChange,
  onRemove,
}: {
  step: Step;
  onChange: (updated: Step) => void;
  onRemove: () => void;
}) {
  function updateInterrupt(index: number, updated: Interrupt) {
    const newInterrupts = [...(step.interrupts || [])];
    newInterrupts[index] = updated;
    onChange({ ...step, interrupts: newInterrupts });
  }

  function addInterrupt() {
    const newInterrupts = [...(step.interrupts || []), { name: "", component: "", state: 0 }];
    onChange({ ...step, interrupts: newInterrupts });
  }

  function removeInterrupt(index: number) {
    const newInterrupts = (step.interrupts || []).filter((_, i) => i !== index);
    onChange({ ...step, interrupts: newInterrupts });
  }

  return (
    <Card size="small" title={step.name || "步骤"} style={{ marginBottom: 12 }}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Input
            placeholder="步骤名称"
            value={step.name}
            onChange={(e) => onChange({ ...step, name: e.target.value })}
            style={{ width: 150 }}
          />
          <Input
            placeholder="负载组件"
            value={step.component}
            onChange={(e) => onChange({ ...step, component: e.target.value })}
            style={{ width: 150 }}
          />
          <InputNumber
            placeholder="开始值"
            value={step.value.begin as number}
            onChange={(v) => onChange({ ...step, value: { ...step.value, begin: v } })}
            style={{ width: 100 }}
          />
          <InputNumber
            placeholder="结束值"
            value={step.value.end as number}
            onChange={(v) => onChange({ ...step, value: { ...step.value, end: v } })}
            style={{ width: 100 }}
          />
        </Space>
        <Space>
          <InputNumber
            placeholder="延迟(ms)"
            value={step.delay}
            onChange={(v) => onChange({ ...step, delay: v ?? undefined })}
            style={{ width: 120 }}
          />
          <InputNumber
            placeholder="超时(ms)"
            value={step.timeout}
            onChange={(v) => onChange({ ...step, timeout: v ?? undefined })}
            style={{ width: 120 }}
          />
          <Switch
            checkedChildren="启用"
            unCheckedChildren="禁用"
            checked={!step.disabled}
            onChange={(checked) => onChange({ ...step, disabled: !checked })}
          />
          <Button icon={<DeleteOutlined />} danger onClick={onRemove} />
        </Space>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>中断条件：</div>
          {(step.interrupts || []).map((interrupt, i) => (
            <ProcessInterruptEditor
              key={i}
              interrupt={interrupt}
              onChange={(updated) => updateInterrupt(i, updated)}
              onRemove={() => removeInterrupt(i)}
            />
          ))}
          <Button type="dashed" icon={<PlusOutlined />} onClick={addInterrupt} size="small">
            添加中断
          </Button>
        </div>
      </Space>
    </Card>
  );
}
