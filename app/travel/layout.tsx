"use client";

import { Layout, Menu, Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: "/travel", label: "地图视图" },
  { key: "/travel/list", label: "位置列表" },
];

export default function TravelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const selectedKey = menuItems.find((item) => pathname.startsWith(item.key))?.key || "/travel";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f0f0f0" }}>
        <Button type="text" icon={<HomeOutlined />} onClick={() => router.push("/")} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>旅行计划</span>
      </Header>
      <Layout>
        <Sider width={200} theme="light" style={{ borderRight: "1px solid #f0f0f0" }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => router.push(key)}
            style={{ height: "100%", borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: "#fff" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
