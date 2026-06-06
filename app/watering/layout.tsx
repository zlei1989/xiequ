"use client";

import { Layout, Menu, Button } from "antd";
import { HomeOutlined, BugOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";

const { Sider, Content, Header } = Layout;

const isDev = process.env.NODE_ENV === "development";

// Ordered longest-first so /watering/debug matches before /watering
const menuItems = [
  ...(isDev ? [{ key: "/watering/debug", label: "调试面板", icon: <BugOutlined /> }] : []),
  { key: "/watering/logs", label: "运行日志", disabled: true },
  { key: "/watering", label: "设备列表" },
];

export default function WateringLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // 根据路径确定当前选中菜单
  const selectedKey = menuItems.find((item) => pathname.startsWith(item.key))?.key || "/watering";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #f0f0f0" }}>
        <Button type="text" icon={<HomeOutlined />} onClick={() => router.push("/")} />
        <span style={{ fontSize: 16, fontWeight: 500 }}>浇花助手</span>
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
