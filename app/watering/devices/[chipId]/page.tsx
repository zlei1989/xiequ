"use client";

import { use, useRef } from "react";
import { Spin, Button, Popconfirm, message } from "antd";
import { ArrowLeftOutlined, SaveOutlined, DeleteOutlined } from "@ant-design/icons";
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
  const { config, gpio, loading, save, remove } = useDeviceConfig(chipId);

  // DeviceEditor 将 handleSave 注册到此 ref，Header 保存按钮通过它触发保存
  const saveRef = useRef<() => Promise<void>>(async () => {});

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
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => saveRef.current()}
          >
            保存
          </Button>
          <Popconfirm title="确认删除设备？不可恢复。" onConfirm={handleRemove}>
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
            返回
          </Button>
        </div>
      </div>

      <DeviceEditor
        config={config}
        gpio={gpio}
        onSave={async (data) => {
          await save(data);
        }}
        onRemove={handleRemove}
        saveRef={saveRef}
      />
    </div>
  );
}
