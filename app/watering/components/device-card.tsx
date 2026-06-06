"use client";

import { Card, Tag, Switch, Button, Space, message } from "antd";
import { EditOutlined, FileTextOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { setDeviceSwitch } from "../actions";
import type { DeviceItem } from "../types";

export function DeviceCard({ device }: { device: DeviceItem }) {
  const router = useRouter();

  async function onSwitchChange(checked: boolean) {
    try {
      await setDeviceSwitch(device.chipId, checked ? "on" : "off");
      message.success(checked ? "已开启" : "已关闭");
    } catch (err: any) {
      message.error(err.message || "操作失败");
    }
  }

  return (
    <Card
      title={device.name}
      extra={
        device.isOnline ? (
          <Tag color="green">在线</Tag>
        ) : (
          <Tag color="default">离线</Tag>
        )
      }
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#666", fontSize: 13 }}>芯片: {device.chipId}</div>
          {device.state?.switch === "on" && (
            <div style={{ color: "#1890ff", fontSize: 13, marginTop: 4 }}>
              运行中: {device.state.process?.name || `流程 #${device.state.index}`}
            </div>
          )}
          {device.state?.message && (
            <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>
              {device.state.message}
            </div>
          )}
        </div>
        <Space align="center">
          <Switch
            checked={device.state?.switch === "on"}
            onChange={onSwitchChange}
            checkedChildren="开"
            unCheckedChildren="关"
          />
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => router.push(`/watering/devices/${device.chipId}`)}
          >
            编辑
          </Button>
          <Button
            icon={<FileTextOutlined />}
            size="small"
            onClick={() => router.push(`/watering/logs/${device.chipId}`)}
          >
            日志
          </Button>
        </Space>
      </div>
    </Card>
  );
}
