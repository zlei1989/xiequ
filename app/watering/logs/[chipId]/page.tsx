"use client";

import { use, useEffect } from "react";
import { Button, Space, Spin, Popconfirm, message } from "antd";
import { ArrowLeftOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceLogs } from "../../hooks/use-device-logs";
import { LogViewer } from "../../components/log-viewer";

export default function DeviceLogsPage({ params }: { params: Promise<{ chipId: string }> }) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, load, clear } = useDeviceLogs(chipId);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    await clear();
    message.success("日志已清空");
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => router.push("/watering")}>
          返回设备列表
        </Button>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Popconfirm title="确认清空日志？" onConfirm={handleClear}>
            <Button icon={<DeleteOutlined />} danger>
              清空日志
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <h3>设备: {chipId}</h3>
      {loading && logs.length === 0 ? <Spin /> : <LogViewer logs={logs} />}
    </div>
  );
}
