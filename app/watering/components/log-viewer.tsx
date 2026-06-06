"use client";

import { Timeline, Tag } from "antd";

const eventColors: Record<string, string> = {
  bootstrap: "green",
  execute: "blue",
  finish: "orange",
  terminate: "red",
  heartbeat: "default",
};

export function LogViewer({ logs }: { logs: any[] }) {
  if (logs.length === 0) {
    return <div style={{ color: "#999" }}>暂无日志</div>;
  }

  return (
    <Timeline
      items={logs.map((log) => ({
        color: eventColors[log.event] || "gray",
        children: (
          <div>
            <Tag color={eventColors[log.event]}>{log.event}</Tag>
            <span style={{ color: "#999", fontSize: 12 }}>
              {new Date(log.createdTime).toLocaleString("zh-CN")}
            </span>
            {log.state && (
              <pre style={{ fontSize: 12, color: "#666", margin: "4px 0" }}>
                {JSON.stringify(typeof log.state === "string" ? JSON.parse(log.state) : log.state, null, 2)}
              </pre>
            )}
          </div>
        ),
      }))}
    />
  );
}
