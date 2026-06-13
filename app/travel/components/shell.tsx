/**
 * 旅行模块外层 Shell
 *
 * 提供 NavBar + TabBar（地图/收藏） + ActionSheet（概览/筛选/添加）的布局框架。
 * 通过自定义事件 "travel:open-search" 与子页面通信触发搜索。
 */

'use client';

import { ActionSheet, Dialog, NavBar, SafeArea, TabBar } from 'antd-mobile';
import { EnvironmentOutline, MoreOutline, StarOutline, AppstoreOutline, TravelOutline } from 'antd-mobile-icons';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { useTravelContext } from '../hooks/use-locations';

import { Stats } from './stats';

/**
 * 旅行模块外层布局，组合 NavBar + TabBar + ActionSheet
 *
 * 通过自定义事件 "travel:open-search" 与子页面通信触发 POI 搜索弹窗。
 * ActionSheet 提供概览、筛选（全部/已去/待去）、添加位置等快捷操作。
 */
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { summary } = useTravelContext();
  const [actionVisible, setActionVisible] = useState(false);

  /** 弹出统计概览 Dialog，复用 Stats 组件渲染汇总数据 */
  function showStats() {
    Dialog.show({
      title: '概览',
      content: <Stats summary={summary} />,
      closeOnAction: true,
      closeOnMaskClick: true,
    });
  }

  /**
   * ActionSheet 菜单分发 —— 根据 key 路由到概览弹窗、列表筛选或触发搜索事件
   */
  function handleAction(action: { key: string | number }) {
    const key = String(action.key);
    switch (key) {
      case 'overview':
        showStats();
        break;
      case 'all':
        router.replace(pathname);
        break;
      case 'checked':
        router.replace(`${pathname}?filter=checked`);
        break;
      case 'uncheck':
        router.replace(`${pathname}?filter=uncheck`);
        break;
      case 'add':
        window.dispatchEvent(new CustomEvent('travel:open-search'));
        break;
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <SafeArea position="top" />
      <NavBar
        backIcon={<AppstoreOutline />}
        onBack={() => { router.push('/'); }}
        right={
          <span className="flex justify-end text-2xl">
            <MoreOutline onClick={() => { setActionVisible(true); }} />
          </span>
        }
      >
        旅行计划
      </NavBar>

      <div className="flex-1 overflow-auto">{children}</div>

      <TabBar activeKey={pathname} onChange={(key) => { router.push(key); }} safeArea>
        <TabBar.Item key="/travel" icon={<EnvironmentOutline />} title="地图" />
        <TabBar.Item key="/travel/list" icon={<StarOutline />} title="收藏" />
        <TabBar.Item key="/travel/routes" icon={<TravelOutline />} title="路线" />
      </TabBar>

      <SafeArea position="bottom" />

      <ActionSheet
        visible={actionVisible}
        actions={[
          { key: 'overview', text: '概览' },
          { key: 'all', text: '显示全部' },
          { key: 'checked', text: '筛选已去' },
          { key: 'uncheck', text: '筛选待去' },
          { key: 'add', text: '添加位置' },
        ]}
        onAction={handleAction}
        onClose={() => { setActionVisible(false); }}
        closeOnAction
        safeArea
      />
    </div>
  );
}
