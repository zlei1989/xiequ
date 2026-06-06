"use client";

import { use, useEffect } from "react";
import { Button, Spin, Popconfirm, message } from "antd";
import { ArrowLeftOutlined, ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useDeviceLogs } from "../../hooks/use-device-logs";
import { LogViewer } from "../../components/log-viewer";

export default function DeviceLogsPage({
  params,
}: {
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, load, clear } = useDeviceLogs(chipId);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    await clear();
    message.success("日志已清空");
    load();
  }

  return (
    <div>
      {/* 页面内顶栏 — 匹配 iot-wfm LogsView header extra */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          marginBottom: 16,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          返回
        </Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <Popconfirm title="确认清空日志？" onConfirm={handleClear}>
            <Button icon={<DeleteOutlined />} danger>
              清空
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* 设备名 — 匹配 LogsView 的 device-name */}
      <div style={{ padding: "0 16px", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>设备: {chipId}</h3>
      </div>

      {/* 日志内容 */}
      <div style={{ padding: "0 16px" }}>
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </div>
        ) : (
          <LogViewer logs={logs} />
        )}
      </div>
    </div>
  );
}
