"use client";

import { use } from "react";
import { Spin, Button, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceConfig } from "../../hooks/use-device-config";
import { DeviceEditor } from "../../components/device-editor";

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { config, loading, save, remove } = useDeviceConfig(chipId);

  async function handleRemove() {
    try {
      await remove();
      message.success("设备已删除");
      router.push("/watering");
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  if (loading || !config) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      {/* 页面内顶栏操作按钮 — 匹配 iot-wfm EditView header extra */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>{config.name || "设备配置"}</h3>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          返回
        </Button>
      </div>

      <DeviceEditor
        config={config}
        onSave={async (data) => {
          await save(data);
          message.success("已保存");
        }}
        onRemove={handleRemove}
      />
    </div>
  );
}
