"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ActionSheet, Button, Dialog, NavBar, SafeArea, TabBar } from "antd-mobile";
import { EnvironmentOutline, MoreOutline, StarOutline } from "antd-mobile-icons";
import { useTravelContext } from "../hooks/use-locations";
import { Stats } from "./stats";

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { summary } = useTravelContext();
  const [actionVisible, setActionVisible] = useState(false);

  function showStats() {
    Dialog.show({
      title: "概览",
      content: <Stats summary={summary} />,
      closeOnAction: true,
      closeOnMaskClick: true,
    });
  }

  function handleAction(action: { key: string | number }) {
    const key = String(action.key);
    switch (key) {
      case "overview":
        showStats();
        break;
      case "all":
        router.replace(pathname);
        break;
      case "checked":
        router.replace(`${pathname}?filter=checked`);
        break;
      case "uncheck":
        router.replace(`${pathname}?filter=uncheck`);
        break;
      case "add":
        window.dispatchEvent(new CustomEvent("travel:open-search"));
        break;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <SafeArea position="top" />
      <NavBar
        backIcon={false}
        right={
          <Button fill="none" onClick={() => setActionVisible(true)}>
            <MoreOutline />
          </Button>
        }
      >
        旅行足迹
      </NavBar>

      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>

      <TabBar activeKey={pathname} onChange={(key) => router.push(key)} safeArea>
        <TabBar.Item key="/travel" icon={<EnvironmentOutline />} title="地图" />
        <TabBar.Item key="/travel/list" icon={<StarOutline />} title="收藏" />
      </TabBar>

      <ActionSheet
        visible={actionVisible}
        actions={[
          { key: "overview", text: "概览" },
          { key: "all", text: "显示全部" },
          { key: "checked", text: "筛选已去" },
          { key: "uncheck", text: "筛选待去" },
          { key: "add", text: "添加位置" },
        ]}
        onAction={handleAction}
        onClose={() => setActionVisible(false)}
        closeOnAction
        safeArea
      />
    </div>
  );
}
