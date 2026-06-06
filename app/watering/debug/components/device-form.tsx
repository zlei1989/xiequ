"use client";

import { Input, InputNumber, Card, Row, Col } from "antd";
import type { DeviceIdentity, GpioState } from "../hooks/use-iot-simulator";

export function DeviceForm({
  identity,
  onIdentityChange,
  gpio,
  onGpioChange,
}: {
  identity: DeviceIdentity;
  onIdentityChange: (identity: DeviceIdentity) => void;
  gpio: GpioState;
  onGpioChange: (gpio: GpioState) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Device Identity */}
      <Card title="设备标识" size="small">
        <Row gutter={[12, 8]}>
          <Col span={8}>
            <Input
              addonBefore="chipId"
              value={identity.chipId}
              onChange={(e) => onIdentityChange({ ...identity, chipId: e.target.value })}
            />
          </Col>
          <Col span={8}>
            <Input
              addonBefore="MAC"
              value={identity.macAddress}
              onChange={(e) => onIdentityChange({ ...identity, macAddress: e.target.value })}
            />
          </Col>
          <Col span={8}>
            <Input
              addonBefore="stateId"
              value={identity.stateId}
              onChange={(e) => onIdentityChange({ ...identity, stateId: e.target.value })}
            />
          </Col>
        </Row>
      </Card>

      {/* Buttons — sent as sensor:button_x per firmware protocol */}
      <Card title="按钮 (→ sensor:button_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.buttons).map(([key, val]) => (
            <Col span={4} key={key}>
              <InputNumber
                addonBefore={key}
                value={val}
                min={0}
                max={1}
                onChange={(v) =>
                  onGpioChange({
                    ...gpio,
                    buttons: { ...gpio.buttons, [key]: v ?? 0 },
                  })
                }
                style={{ width: "100%" }}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Sensors */}
      <Card title="传感器 (→ sensor:sensor_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.sensors).map(([key, val]) => (
            <Col span={4} key={key}>
              <InputNumber
                addonBefore={key}
                value={val}
                min={0}
                max={1023}
                onChange={(v) =>
                  onGpioChange({
                    ...gpio,
                    sensors: { ...gpio.sensors, [key]: v ?? 0 },
                  })
                }
                style={{ width: "100%" }}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Loads */}
      <Card title="水泵 (→ load:load_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.loads).map(([key, val]) => (
            <Col span={6} key={key}>
              <InputNumber
                addonBefore={key}
                value={val}
                min={0}
                max={1024}
                onChange={(v) =>
                  onGpioChange({
                    ...gpio,
                    loads: { ...gpio.loads, [key]: v ?? 0 },
                  })
                }
                style={{ width: "100%" }}
              />
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
