"use client";

import { Button, Spin, Empty } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useDevices } from "./hooks/use-devices";
import { DeviceCard } from "./components/device-card";

export default function WateringPage() {
  const { devices, loading, refresh } = useDevices(15000);

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* 操作栏 — 匹配 iot-wfm 的 #extra 插槽 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>设备列表</h2>
        <Button
          icon={<ReloadOutlined />}
          onClick={refresh}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      </div>

      {/* 设备卡片列表 */}
      {loading && devices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <Empty description="暂无设备，等待 IoT 设备上线" />
      ) : (
        devices.map((device) => (
          <DeviceCard key={device.chipId} device={device} onRefresh={refresh} />
        ))
      )}
    </div>
  );
}
