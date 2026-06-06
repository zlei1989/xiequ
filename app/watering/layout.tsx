"use client";

import { Layout, Button } from "antd";
import { HomeOutlined, BugOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const { Header, Content } = Layout;

const isDev = process.env.NODE_ENV === "development";

export default function WateringLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: "#fff",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #f0f0f0",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Button
          type="text"
          icon={<HomeOutlined />}
          onClick={() => router.push("/")}
          size="small"
        />
        <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>浇花助手</span>
        {isDev && (
          <Button
            type={pathname.startsWith("/watering/debug") ? "primary" : "text"}
            icon={<BugOutlined />}
            onClick={() => router.push("/watering/debug")}
            size="small"
          >
            调试
          </Button>
        )}
      </Header>
      <Content style={{ background: "#f5f5f5", minHeight: "calc(100vh - 48px)" }}>
        {children}
      </Content>
    </Layout>
  );
}
