"use client";

import { use } from "react";
import { Spin, Button, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceConfig } from "../../hooks/use-device-config";
import { DeviceEditor } from "../../components/device-editor";

export default function DeviceDetailPage({ params }: { params: Promise<{ chipId: string }> }) {
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
    return <Spin />;
  }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        onClick={() => router.push("/watering")}
        style={{ marginBottom: 16 }}
      >
        返回设备列表
      </Button>
      <DeviceEditor config={config} onSave={save} onRemove={handleRemove} />
    </div>
  );
}
