"use client";

import { Layout, Dropdown, Spin, Button } from "antd";
import {
  UnorderedListOutlined,
  MoreOutlined,
  FilterOutlined,
  AimOutlined,
  PlusOutlined,
  CheckOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import type { ReactNode } from "react";
import { useLocations, TravelContext } from "./hooks/use-locations";
import { NavDrawer } from "./components/nav-drawer";
import type { MenuProps } from "antd";

const { Header, Content } = Layout;

function TravelLayoutInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 从 URL query 读取 filter
  const filterParam = searchParams.get("filter") as "checked" | "uncheck" | null;
  const filter: "all" | "checked" | "uncheck" = filterParam || "all";

  const data = useLocations(filter);

  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  const isMapPage = pathname === "/travel";

  // 下拉菜单项
  type DropdownItem = Required<MenuProps>["items"][number];
  const dropdownItems: DropdownItem[] = [
    ...(isMapPage
      ? [
          {
            key: "my-location",
            icon: <AimOutlined />,
            label: "我的位置",
          } as DropdownItem,
        ]
      : []),
    {
      key: "all",
      icon: <FilterOutlined />,
      label: "显示全部",
    },
    {
      key: "checked",
      icon: <CheckOutlined />,
      label: "筛选已去",
    },
    {
      key: "uncheck",
      icon: <StarOutlined />,
      label: "筛选待去",
    },
    {
      type: "divider",
    } as DropdownItem,
    {
      key: "add",
      icon: <PlusOutlined />,
      label: "添加位置",
    },
  ];

  function onDropdownClick(info: { key: string }) {
    switch (info.key) {
      case "my-location":
        router.replace(pathname + "?center=my-location");
        break;
      case "all":
        router.replace(pathname);
        break;
      case "checked":
        router.replace(pathname + "?filter=checked");
        break;
      case "uncheck":
        router.replace(pathname + "?filter=uncheck");
        break;
      case "add":
        window.dispatchEvent(new CustomEvent("travel:open-search"));
        break;
    }
  }

  return (
    <TravelContext.Provider value={data}>
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
            height: 48,
          }}
        >
          <Button
            type="text"
            icon={<UnorderedListOutlined />}
            onClick={() => setNavDrawerOpen(true)}
            size="small"
          />
          <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>旅行计划</span>
          <Dropdown
            menu={{ items: dropdownItems, onClick: onDropdownClick }}
            trigger={["click"]}
          >
            <Button type="text" icon={<MoreOutlined />} size="small">
              选项
            </Button>
          </Dropdown>
        </Header>

        <NavDrawer
          open={navDrawerOpen}
          onClose={() => setNavDrawerOpen(false)}
          summary={data.summary}
        />

        <Content style={{ background: "#fff", minHeight: "calc(100vh - 48px)" }}>
          {data.loading && data.locations.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48 }}>
              <Spin />
            </div>
          ) : (
            children
          )}
        </Content>
      </Layout>
    </TravelContext.Provider>
  );
}

// 外层 wrapper：useSearchParams 需要 Suspense 边界
export default function TravelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Layout style={{ minHeight: "100vh" }}>
          <Header
            style={{
              background: "#fff",
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
              height: 48,
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 500 }}>旅行计划</span>
          </Header>
          <Content style={{ textAlign: "center", padding: 48 }}>
            <Spin />
          </Content>
        </Layout>
      }
    >
      <TravelLayoutInner>{children}</TravelLayoutInner>
    </Suspense>
  );
}
