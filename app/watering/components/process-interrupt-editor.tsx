"use client";

import { Input, InputNumber, Switch, Select, Empty } from "antd";
import type { Interrupt } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";

export function ProcessInterruptEditor({
  interrupt,
  gpio,
  onChange,
  onRemove,
}: {
  interrupt: Interrupt;
  gpio: GpioInfo;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
  const sensorOptions = (gpio.sensors ?? []).map((k) => ({
    value: `sensor_${k}`,
    label: k,
  }));
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
        {sensorOptions.length > 0 ? (
          <Select
            value={interrupt.component}
            onChange={(v) => onChange({ ...interrupt, component: v })}
            options={sensorOptions}
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用传感器（sensors），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
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
