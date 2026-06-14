'use client';

import { ConfigProvider } from 'antd-mobile';
import zhCN from 'antd-mobile/es/locales/zh-CN';

import { AntdMobileCompat } from './antd-mobile-compat';

/**
 * 客户端布局提供器
 *
 * 将 antd-mobile ConfigProvider（依赖 createContext）和 React 19 兼容层
 * 封装为客户端组件，供 Server Component 布局使用。
 *
 * 注意：ConfigProvider 和 AntdMobileCompat 都只能在客户端运行，
 * 因此必须在此处添加 "use client" 指令。
 */
export function ClientLayoutProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider locale={zhCN}>
      <AntdMobileCompat />
      {children}
    </ConfigProvider>
  );
}
