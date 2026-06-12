/**
 * 首页 — 应用门户
 *
 * 三个应用入口：浇花帮手（/watering）、旅行计划（/travel）、台岛遍历（静态页）。
 * 台岛遍历为独立静态页面，使用 window.open 跳转而非 Next.js 路由。
 */

'use client';

import { List } from 'antd-mobile';
import { EnvironmentOutline } from 'antd-mobile-icons';
import { TravelOutline } from 'antd-mobile-icons';
import { CompassOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';

/** 应用入口配置列表 */
const apps = [
  {
    title: '浇花帮手',
    description: '每片松鳞张开的角度，都精确得像一本写给风的密信',
    href: '/watering',
    icon: <EnvironmentOutline className="text-[32px]" />,
  },
  {
    title: '旅行计划',
    description: ' 曾踏破千山明月，方知酒浊胜仙浆',
    href: '/travel',
    icon: <TravelOutline className="text-[32px]" />,
  },
  {
    title: '台岛遍历',
    description: '将二〇一六年的行迹，悉数检点，妥为收存',
    href: '/taiwan-1.8.4/index.html',
    icon: <CompassOutline className="text-[32px]" />,
  },
];

/** 首页组件 — 展示三个应用入口的列表 */
export default function Home() {
  const router = useRouter();

  /** 处理点击：台岛遍历用 window.open，其他用 Next.js 路由 */
  function handleClick(href: string) {
    if (href.startsWith('/taiwan')) {
      // 静态页面不在 Next.js 路由范围内，用浏览器原生跳转
      window.open(href, '_self');
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
            onClick={() => { handleClick(app.href); }}
          >
            {app.title}
          </List.Item>
        ))}
      </List>
    </>
  );
}
