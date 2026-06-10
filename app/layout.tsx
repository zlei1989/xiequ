import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd-mobile/es/global";
import "./globals.css";
import "normalize.css";
import { AntdMobileCompat } from "../components/antd-mobile-compat";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "谐趣",
  description: "浇花帮手、旅行计划、台岛遍历",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme:dark)");function u(e){d.setAttribute("data-prefers-color-scheme",e.matches?"dark":"light")}u(m);m.addEventListener("change",u)}();`,
          }}
        />
        <ConfigProvider locale={zhCN}>
          <AntdMobileCompat />
          {children}
        </ConfigProvider>
      </body>
    </html>
  );
}
