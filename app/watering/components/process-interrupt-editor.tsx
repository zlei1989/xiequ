"use client";

import { Input, InputNumber, Switch, Select } from "antd";
import type { Interrupt } from "../types";

const SENSOR_OPTIONS = [
  { value: "sensor_0", label: "sensor_0" },
  { value: "sensor_1", label: "sensor_1" },
  { value: "sensor_2", label: "sensor_2" },
];

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          中断名称
        </label>
        <Input
          value={interrupt.name}
          onChange={(e) => onChange({ ...interrupt, name: e.target.value })}
          placeholder="输入中断名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          传感器
        </label>
        <Select
          value={interrupt.component}
          onChange={(v) => onChange({ ...interrupt, component: v })}
          options={SENSOR_OPTIONS}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          触发状态
        </label>
        <Switch
          checked={interrupt.state === 1 || interrupt.state === true}
          onChange={(checked) =>
            onChange({ ...interrupt, state: checked ? 1 : 0 })
          }
          checkedChildren="触发 (1)"
          unCheckedChildren="未触发 (0)"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          屏蔽抖动间隔（毫秒）
        </label>
        <InputNumber
          value={interrupt.intercept}
          onChange={(v) => onChange({ ...interrupt, intercept: v ?? 0 })}
          step={100}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          延迟检测（毫秒）
        </label>
        <InputNumber
          value={interrupt.delay}
          onChange={(v) => onChange({ ...interrupt, delay: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          持续时间（毫秒）
        </label>
        <InputNumber
          value={interrupt.duration}
          onChange={(v) => onChange({ ...interrupt, duration: v ?? 0 })}
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
          checked={!interrupt.disabled}
          onChange={(checked) => onChange({ ...interrupt, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
