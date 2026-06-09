"use client";

import { AutoCenter, Card, Space } from "antd-mobile";
import { useRouter } from "next/navigation";

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
  {
    title: "台岛遍历",
    description: "将二〇一六年的行迹，悉数检点，妥为收存",
    href: "/taiwan-1.8.4/index.html",
    icon: "🚲",
  },
];

export default function Home() {
  const router = useRouter();

  function handleClick(href: string) {
    if (href.startsWith("/taiwan")) {
      window.open(href, "_self");
    } else {
      router.push(href);
    }
  }

  return (
    <Space direction="vertical" block>
      <AutoCenter>
        <h1>个人工具箱</h1>
      </AutoCenter>
      {apps.map((app) => (
        <Card
          key={app.href}
          icon={app.icon}
          title={app.title}
          onClick={() => handleClick(app.href)}
        >
          {app.description}
        </Card>
      ))}
    </Space>
  );
}
