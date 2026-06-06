"use client";

import { Button, Empty, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useDevices } from "./hooks/use-devices";
import { DeviceCard } from "./components/device-card";

export default function WateringPage() {
  const { devices, loading, refresh } = useDevices();

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
          刷新
        </Button>
      </div>
      {loading && devices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <Empty description="暂无设备，等待 IoT 设备上线" />
      ) : (
        devices.map((device) => (
          <DeviceCard key={device.chipId} device={device} />
        ))
      )}
    </div>
  );
}
