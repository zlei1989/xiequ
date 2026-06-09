"use client";

import { List, NavBar } from "antd-mobile";
import { EnvironmentOutline } from "antd-mobile-icons";
import { TravelOutline } from "antd-mobile-icons";
import { CompassOutline } from "antd-mobile-icons";
import { useRouter } from "next/navigation";

const iconStyle = { fontSize: 32 };

const apps = [
  {
    title: "浇花帮手",
    description: "IoT 设备管理，远程控制浇花",
    href: "/watering",
    icon: <EnvironmentOutline style={iconStyle} />,
  },
  {
    title: "旅行计划",
    description: "地图标注，收藏想去的地方",
    href: "/travel",
    icon: <TravelOutline style={iconStyle} />,
  },
  {
    title: "台岛遍历",
    description: "将二〇一六年的行迹，悉数检点，妥为收存",
    href: "/taiwan-1.8.4/index.html",
    icon: <CompassOutline style={iconStyle} />,
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
    <>
      <NavBar>谐趣</NavBar>
      <List>
        {apps.map((app) => (
          <List.Item
            key={app.href}
            prefix={app.icon}
            description={app.description}
            clickable
            arrowIcon
            onClick={() => handleClick(app.href)}
          >
            {app.title}
          </List.Item>
        ))}
      </List>
    </>
  );
}
