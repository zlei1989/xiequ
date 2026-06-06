"use client";

import { Input, InputNumber, Switch, Button, Space, Card } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { Interrupt } from "../types";

export function ProcessInterruptEditor({
  interrupt,
  onChange,
  onRemove,
}: {
  interrupt: Interrupt;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Input
            placeholder="中断名称"
            value={interrupt.name}
            onChange={(e) => onChange({ ...interrupt, name: e.target.value })}
            style={{ width: 150 }}
          />
          <Input
            placeholder="传感器组件"
            value={interrupt.component}
            onChange={(e) => onChange({ ...interrupt, component: e.target.value })}
            style={{ width: 150 }}
          />
          <InputNumber
            placeholder="触发状态"
            value={typeof interrupt.state === "number" ? interrupt.state : undefined}
            onChange={(v) => onChange({ ...interrupt, state: v ?? 0 })}
            style={{ width: 100 }}
          />
          <Switch
            checkedChildren="启用"
            unCheckedChildren="禁用"
            checked={!interrupt.disabled}
            onChange={(checked) => onChange({ ...interrupt, disabled: !checked })}
          />
          <Button icon={<DeleteOutlined />} danger onClick={onRemove} />
        </Space>
        <Space>
          <InputNumber
            placeholder="抖动间隔(ms)"
            value={interrupt.intercept}
            onChange={(v) => onChange({ ...interrupt, intercept: v ?? undefined })}
            style={{ width: 140 }}
          />
          <InputNumber
            placeholder="延迟(ms)"
            value={interrupt.delay}
            onChange={(v) => onChange({ ...interrupt, delay: v ?? undefined })}
            style={{ width: 120 }}
          />
          <InputNumber
            placeholder="持续(ms)"
            value={interrupt.duration}
            onChange={(v) => onChange({ ...interrupt, duration: v ?? undefined })}
            style={{ width: 120 }}
          />
        </Space>
      </Space>
    </Card>
  );
}
