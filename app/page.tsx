import { Row, Col } from "antd";
import { AppCard } from "@/components/ui/app-card";

const apps = [
  {
    title: "浇花助手",
    description: "IoT 设备管理，远程控制浇花",
    href: "/watering",
    icon: "🌱",
  },
  {
    title: "旅行计划",
    description: "地图标注，收藏想去的地方",
    href: "/travel",
    icon: "🗺️",
  },
];

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "0 24px",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 32 }}>个人工具箱</h1>
      <Row gutter={[24, 24]} style={{ maxWidth: 800, width: "100%" }}>
        {apps.map((app) => (
          <Col key={app.href} xs={24} sm={12}>
            <AppCard
              title={app.title}
              description={app.description}
              href={app.href}
              icon={app.icon}
            />
          </Col>
        ))}
      </Row>
    </div>
  );
}
