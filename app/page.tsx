"use client";

import { List } from "antd-mobile";
import { EnvironmentOutline } from "antd-mobile-icons";
import { TravelOutline } from "antd-mobile-icons";
import { CompassOutline } from "antd-mobile-icons";
import { useRouter } from "next/navigation";

const iconStyle = { fontSize: 32 };

const apps = [
  {
    title: "栽松偶书",
    description: "每片松鳞张开的角度，都精确得像一本写给风的密信",
    href: "/watering",
    icon: <EnvironmentOutline style={iconStyle} />,
  },
  {
    title: "逆旅烟云",
    description: " 曾踏破千山明月，方知酒浊胜仙浆",
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
