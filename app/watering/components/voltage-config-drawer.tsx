"use client";

import { Drawer, Select, InputNumber, Button, Space } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { VoltageConfig } from "../types";

interface VoltageConfigDrawerProps {
  open: boolean;
  voltage: VoltageConfig | undefined;
  sensors: string[];
  onChange: (config: VoltageConfig | undefined) => void;
  onClose: () => void;
}

const DEFAULT_R1 = 30000; // 30kΩ
const DEFAULT_R2 = 10000; // 10kΩ

export function VoltageConfigDrawer({
  open,
  voltage,
  sensors,
  onChange,
  onClose,
}: VoltageConfigDrawerProps) {
  const config = voltage || { sensor: sensors[0] || "sensor_0", r1: DEFAULT_R1, r2: DEFAULT_R2 };

  function update(partial: Partial<VoltageConfig>) {
    onChange({ ...config, ...partial });
  }

  function handleClose() {
    if (!voltage && !sensors.length) {
      onChange(undefined);
    }
    onClose();
  }

  return (
    <Drawer
      title="电压检测配置"
      placement="bottom"
      size="60%"
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button
          icon={<CloseOutlined />}
          onClick={handleClose}
          size="small"
        >
          关闭
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 传感器选择 */}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 4,
              display: "block",
            }}
          >
            电压检测传感器
          </label>
          <Select
            value={config.sensor}
            onChange={(v) => update({ sensor: v })}
            options={sensors.map((s) => ({ value: s, label: s }))}
            placeholder="选择传感器引脚"
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            选择用于电压检测的 ADC 传感器引脚
          </div>
        </div>

        {/* R1 电阻值 */}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 4,
              display: "block",
            }}
          >
            R1 电阻值（Ω）
          </label>
          <Space.Compact style={{ width: "100%" }}>
            <InputNumber
              value={config.r1}
              onChange={(v) => update({ r1: v ?? DEFAULT_R1 })}
              min={0}
              step={1000}
              style={{ flex: 1 }}
              placeholder="默认 30000"
            />
            <Button disabled>Ω</Button>
          </Space.Compact>
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            分压电阻 R1，上拉至被测电压。默认 30kΩ
          </div>
        </div>

        {/* R2 电阻值 */}
        <div>
          <label
            style={{
              fontSize: 13,
              color: "#666",
              marginBottom: 4,
              display: "block",
            }}
          >
            R2 电阻值（Ω）
          </label>
          <Space.Compact style={{ width: "100%" }}>
            <InputNumber
              value={config.r2}
              onChange={(v) => update({ r2: v ?? DEFAULT_R2 })}
              min={0}
              step={1000}
              style={{ flex: 1 }}
              placeholder="默认 10000"
            />
            <Button disabled>Ω</Button>
          </Space.Compact>
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            分压电阻 R2，下拉至 GND。默认 10kΩ
          </div>
        </div>

        {/* 电压计算公式说明 */}
        <div
          style={{
            background: "#f6f8fa",
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            padding: "12px 16px",
            fontSize: 12,
            color: "#666",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>计算公式</div>
          <div>
            V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
          </div>
          <div style={{ marginTop: 4 }}>
            当前分压比:{" "}
            {config.r1 > 0 && config.r2 > 0
              ? `${((config.r1 + config.r2) / config.r2).toFixed(2)}`
              : "—"}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
