"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NavBar, TabBar, ActionSheet, Dialog, ProgressBar, Grid } from "antd-mobile";
import { EnvironmentOutline, StarOutline, MoreOutline } from "antd-mobile-icons";
import { useTravelContext } from "../hooks/use-locations";

export function TravelShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { summary } = useTravelContext();

  const [actionVisible, setActionVisible] = useState(false);

  function showOverview() {
    Dialog.show({
      title: "概览",
      content: (
        <div style={{ padding: "8px 0" }}>
          <Grid columns={3} gap={8} style={{ marginBottom: 16 }}>
            <Grid.Item>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#52c41a" }}>
                  {summary.checkedCount}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>已去</div>
              </div>
            </Grid.Item>
            <Grid.Item>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#fa8c16" }}>
                  {summary.uncheckCount}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>待去</div>
              </div>
            </Grid.Item>
            <Grid.Item>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#1677ff" }}>
                  {summary.count}
                </div>
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>总计</div>
              </div>
            </Grid.Item>
          </Grid>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>完成进度</div>
          <ProgressBar percent={summary.checkedPercentage} />
          <div
            style={{
              fontSize: 12,
              color: "#1677ff",
              textAlign: "right",
              marginTop: 4,
            }}
          >
            {summary.checkedPercentage}%
          </div>
        </div>
      ),
      closeOnAction: true,
      closeOnMaskClick: true,
    });
  }

  function handleAction(action: { key: string | number }) {
    const key = String(action.key);
    switch (key) {
      case "overview":
        showOverview();
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <NavBar
        right={
          <MoreOutline
            style={{ fontSize: 24, cursor: "pointer" }}
            onClick={() => setActionVisible(true)}
          />
        }
      >
        旅行计划
      </NavBar>

      <div style={{ flex: 1, overflow: "auto" }}>{children}</div>

      <TabBar
        activeKey={pathname}
        onChange={(key) => router.push(key)}
        safeArea
      >
        <TabBar.Item
          key="/travel"
          icon={<EnvironmentOutline />}
          title="地图"
        />
        <TabBar.Item
          key="/travel/list"
          icon={<StarOutline />}
          title="收藏"
        />
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
