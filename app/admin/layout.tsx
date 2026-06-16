/**
 * 管理模块布局
 *
 * 提供 NavBar（标题"应用管理"） + SafeArea 的外层框架。
 * 子页面可通过 useAdminLayout() 设置 NavBar 右侧操作区。
 */

'use client';

import { NavBar, SafeArea } from 'antd-mobile';
import { AppstoreOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';

/** 管理布局上下文 — 子页面通过它动态设置 NavBar 右侧操作区 */
const AdminLayoutContext = createContext<{
  navRight: ReactNode;
  setNavRight: (el: ReactNode) => void;
}>({ navRight: null, setNavRight: () => {} });

/** 子页面通过此 hook 设置 NavBar 右侧操作（登录后显示更多菜单等） */
export function useAdminLayout() {
  return useContext(AdminLayoutContext);
}

/** 管理模块布局 — NavBar 标题 + SafeArea，子页面填充内容区 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [navRight, setNavRight] = useState<ReactNode>(null);

  return (
    <AdminLayoutContext.Provider value={{ navRight, setNavRight }}>
      <div className="flex h-screen flex-col">
        <SafeArea position="top" />
        <NavBar
          backIcon={<AppstoreOutline />}
          right={navRight}
          onBack={() => { router.push('/'); }}
        >
          应用管理
        </NavBar>
        <div className="flex-1 overflow-auto">{children}</div>
        <SafeArea position="bottom" />
      </div>
    </AdminLayoutContext.Provider>
  );
}
