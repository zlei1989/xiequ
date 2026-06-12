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
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Button
          type="text"
          icon={<HomeOutlined />}
          onClick={() => { router.push('/'); }}
          size="small"
        />
        <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>浇花帮手</span>
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
      <Content style={{ background: '#f5f5f5', minHeight: 'calc(100vh - 48px)' }}>
        {children}
      </Content>
    </Layout>
  );
}
