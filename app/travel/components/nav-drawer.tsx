"use client";

import { Drawer, Menu, Progress, Row, Col } from "antd";
import { EnvironmentOutlined, UnorderedListOutlined, ScheduleOutlined } from "@ant-design/icons";
import { useRouter, usePathname } from "next/navigation";
import type { Summary } from "../types";

export function NavDrawer({
  open,
  onClose,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  summary: Summary;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function onClickMenu(info: { key: string }) {
    router.push(info.key);
    onClose();
  }

  return (
    <Drawer
      title="旅行计划"
      placement="left"
      size="large"
      open={open}
      onClose={onClose}
      destroyOnClose
      footer={
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8} style={{ textAlign: "center" }}>
              <div style={{ color: "#999", fontSize: 12 }}>已去</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.checkedCount}</div>
            </Col>
            <Col span={8} style={{ textAlign: "center" }}>
              <div style={{ color: "#999", fontSize: 12 }}>待去</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.uncheckCount}</div>
            </Col>
            <Col span={8} style={{ textAlign: "center" }}>
              <div style={{ color: "#999", fontSize: 12 }}>总计</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.count}</div>
            </Col>
          </Row>
          <Progress
            percent={summary.checkedPercentage}
            size="small"
            format={() => `${summary.checkedPercentage}%`}
          />
        </div>
      }
    >
      <Menu
        mode="inline"
        selectedKeys={[pathname.startsWith("/travel/list") ? "/travel/list" : "/travel"]}
        onClick={onClickMenu}
        items={[
          {
            key: "/travel",
            icon: <EnvironmentOutlined />,
            label: "地图",
          },
          {
            key: "/travel/list",
            icon: <UnorderedListOutlined />,
            label: "收藏夹",
          },
          {
            key: "trip",
            icon: <ScheduleOutlined />,
            label: "行程",
            disabled: true,
          },
        ]}
        style={{ borderRight: 0 }}
      />
    </Drawer>
  );
}
