"use client";

import { Input, Button, Card, Space } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Process, Step } from "../types";
import { ProcessStepEditor } from "./process-step-editor";

export function ProcessEditor({
  process,
  onChange,
  onRemove,
}: {
  process: Process;
  onChange: (updated: Process) => void;
  onRemove: () => void;
}) {
  function updateStep(index: number, updated: Step) {
    const newSteps = [...process.steps];
    newSteps[index] = updated;
    onChange({ ...process, steps: newSteps });
  }

  function addStep() {
    const newSteps = [...process.steps, { name: "", component: "", value: { begin: 0, end: 0 } }];
    onChange({ ...process, steps: newSteps });
  }

  function removeStep(index: number) {
    const newSteps = process.steps.filter((_, i) => i !== index);
    onChange({ ...process, steps: newSteps });
  }

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Input
          placeholder="流程名称"
          value={process.name}
          onChange={(e) => onChange({ ...process, name: e.target.value })}
          style={{ width: 200 }}
        />
        <Button icon={<DeleteOutlined />} danger onClick={onRemove}>
          删除流程
        </Button>
      </Space>
      {process.steps.map((step, i) => (
        <ProcessStepEditor
          key={i}
          step={step}
          onChange={(updated) => updateStep(i, updated)}
          onRemove={() => removeStep(i)}
        />
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addStep} block>
        添加步骤
      </Button>
    </Card>
  );
}
