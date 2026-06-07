"use client";

import { Input, InputNumber, Card, Row, Col, Space, Button } from "antd";
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
            <Space.Compact block>
              <Button disabled>chipId</Button>
              <Input
                value={identity.chipId}
                onChange={(e) => onIdentityChange({ ...identity, chipId: e.target.value })}
              />
            </Space.Compact>
          </Col>
          <Col span={8}>
            <Space.Compact block>
              <Button disabled>MAC</Button>
              <Input
                value={identity.macAddress}
                onChange={(e) => onIdentityChange({ ...identity, macAddress: e.target.value })}
              />
            </Space.Compact>
          </Col>
          <Col span={8}>
            <Space.Compact block>
              <Button disabled>stateId</Button>
              <Input
                value={identity.stateId}
                onChange={(e) => onIdentityChange({ ...identity, stateId: e.target.value })}
              />
            </Space.Compact>
          </Col>
        </Row>
      </Card>

      {/* Buttons — sent as sensor:button_x per firmware protocol */}
      <Card title="按钮 (→ sensor:button_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.buttons).map(([key, val]) => (
            <Col span={4} key={key}>
              <Space.Compact block>
                <Button disabled>{key}</Button>
                <InputNumber
                  value={val}
                  min={0}
                  max={1}
                  onChange={(v) =>
                    onGpioChange({
                      ...gpio,
                      buttons: { ...gpio.buttons, [key]: v ?? 0 },
                    })
                  }
                  style={{ flex: 1 }}
                />
              </Space.Compact>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Sensors */}
      <Card title="传感器 (→ sensor:sensor_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.sensors).map(([key, val]) => (
            <Col span={4} key={key}>
              <Space.Compact block>
                <Button disabled>{key}</Button>
                <InputNumber
                  value={val}
                  min={0}
                  max={1023}
                  onChange={(v) =>
                    onGpioChange({
                      ...gpio,
                      sensors: { ...gpio.sensors, [key]: v ?? 0 },
                    })
                  }
                  style={{ flex: 1 }}
                />
              </Space.Compact>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Loads */}
      <Card title="水泵 (→ load:load_x)" size="small">
        <Row gutter={[12, 8]}>
          {Object.entries(gpio.loads).map(([key, val]) => (
            <Col span={6} key={key}>
              <Space.Compact block>
                <Button disabled>{key}</Button>
                <InputNumber
                  value={val}
                  min={0}
                  max={1024}
                  onChange={(v) =>
                    onGpioChange({
                      ...gpio,
                      loads: { ...gpio.loads, [key]: v ?? 0 },
                    })
                  }
                  style={{ flex: 1 }}
                />
              </Space.Compact>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
