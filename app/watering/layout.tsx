/**
 * 浇花帮手布局
 *
 * 使用 antd Layout 组件，顶部固定 Header（含首页返回 + 开发调试入口），
 * 下方 Content 区域渲染子页面。
 * 调试按钮仅在 NODE_ENV=development 时显示。
 */

'use client';

import { HomeOutlined, BugOutlined } from '@ant-design/icons';
import { Layout, Button } from 'antd';
import { useRouter, usePathname } from 'next/navigation';

import type { ReactNode } from 'react';

const { Header, Content } = Layout;

const isDev = process.env.NODE_ENV === 'development';

/** 浇花模块布局 — 顶部导航 + 内容区 */
export default function WateringLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white px-3 flex items-center gap-2 border-0 border-b border-gray-100 border-solid sticky top-0 z-[100]">
        <Button
          type="text"
          icon={<HomeOutlined />}
          onClick={() => { router.push('/'); }}
          size="small"
        />
        <span className="text-base font-medium flex-1">浇花帮手</span>
        {isDev && (
          <Button
            type={pathname.startsWith('/watering/debug') ? 'primary' : 'text'}
            icon={<BugOutlined />}
            onClick={() => { router.push('/watering/debug'); }}
            size="small"
          >
            调试
          </Button>
        )}
      </Header>
      <Content className="bg-gray-100" style={{ minHeight: 'calc(100vh - 48px)' }}>
        {children}
      </Content>
    </Layout>
  );
}
