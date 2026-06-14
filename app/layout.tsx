/**
 * 应用根布局
 *
 * 职责：
 * - 注入 Geist 字体 CSS 变量
 * - 检测系统深色模式偏好（通过内联 script 设置 data-prefers-color-scheme）
 * - 包裹 antd-mobile ConfigProvider（中文 locale）+ antd-mobile SSR 兼容层
 * - 注册 PWA Service Worker（通过 PwaRegister 客户端组件）
 * - 暴露 PWA 元数据（manifest、appleWebApp、图标）
 *
 * 注意：suppressHydrationWarning 用于抑制内联 script 修改 DOM 产生的水合警告。
 */

import { ConfigProvider } from 'antd-mobile';
import zhCN from 'antd-mobile/es/locales/zh-CN';
import { Geist, Geist_Mono } from 'next/font/google';

import 'antd-mobile/es/global';
import './globals.css';
import { AntdMobileCompat } from '../components/antd-mobile-compat';
import { PwaRegister } from '../components/pwa-register';

import type { Metadata } from 'next';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '谐趣',
  description: '浇花帮手、旅行计划、台岛遍历',
  // PWA：手机桌面图标 + 全屏启动
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    title: '谐趣',
    statusBarStyle: 'black-translucent',
  },
};

/**
 * 根布局组件
 *
 * 内联 script 在 HTML 解析前执行，通过 matchMedia 检测系统配色方案，
 * 将 dark/light 写入 data-prefers-color-scheme，避免页面闪烁。
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="zh-CN"
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: '!function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme:dark)");function u(e){d.setAttribute("data-prefers-color-scheme",e.matches?"dark":"light")}u(m);m.addEventListener("change",u)}();',
          }}
        />
        <ConfigProvider locale={zhCN}>
          <AntdMobileCompat />
          {children}
          <PwaRegister />
        </ConfigProvider>
      </body>
    </html>
  );
}
