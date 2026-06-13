/**
 * 旅行模块外层 Shell
 *
 * 提供 NavBar + TabBar（地图/收藏） + ActionSheet（概览/筛选/添加）的布局框架。
 * 通过自定义事件 "travel:open-search" 与子页面通信触发搜索。
 */

'use client';

import { ActionSheet, Card, Dialog, Grid, NavBar, ProgressBar, SafeArea, TabBar } from 'antd-mobile';
import { EnvironmentOutline, MoreOutline, StarOutline, AppstoreOutline, TravelOutline } from 'antd-mobile-icons';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { useTravelContext } from '../hooks/use-locations';

import type { Summary } from '../types';

/** 路由路径常量，多处引用避免硬编码字符串 */
const TRAVEL_BASE_PATH = '/travel';
const TRAVEL_FAVOURITES_PATH = '/travel/favourites';
const TRAVEL_ROUTES_PATH = '/travel/routes';

/**
 * 渲染已去/待去/总计三列统计卡片和完成进度条
 *
 * 独立为模块级组件而非内联，避免每次 Shell 渲染时重复创建。
 */
function Stats({ summary }: { summary: Summary }) {
  return (
    <>
      <Grid columns={3} gap={8}>
        <Grid.Item>
          {/** 居中显示标题和数值；数字需转为字符串以便 React 渲染 */}
          <Card bodyClassName="text-center" headerClassName="justify-center" title="已去">{String(summary.checkedCount)}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card bodyClassName="text-center" headerClassName="justify-center" title="待去">{String(summary.uncheckCount)}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card bodyClassName="text-center" headerClassName="justify-center" title="总计">{String(summary.count)}</Card>
        </Grid.Item>
      </Grid>
      <Card
        extra={`${String(summary.checkedPercentage)}%`}
        title="完成进度"
      >
        <ProgressBar percent={summary.checkedPercentage} />
      </Card>
    </>
  );
}

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
      case 'my-location':
        /** 通过 URL 参数触发地图页 GPS 定位居中（地图页 useEffect 已监听该参数） */
        router.replace(`${TRAVEL_BASE_PATH}?center=my-location`);
        break;
    }
  }

  /**
   * 根据当前 tab 决定 ActionSheet 菜单项
   *
   * 地图 tab：增加"我的位置"快捷定位；路线 tab：仅保留概览
   */
  const actions = (() => {
    if (pathname === TRAVEL_ROUTES_PATH) {
      return [{ key: 'overview', text: '概览' }];
    }
    const base = [
      { key: 'overview', text: '概览' },
      { key: 'all', text: '显示全部' },
      { key: 'checked', text: '筛选已去' },
      { key: 'uncheck', text: '筛选待去' },
      { key: 'add', text: '添加位置' },
    ];
    if (pathname === TRAVEL_BASE_PATH) {
      return [...base, { key: 'my-location', text: '我的位置' }];
    }
    return base;
  })();

  return (
    <div className="flex h-screen flex-col">
      <SafeArea position="top" />
      <NavBar
        backIcon={
          <AppstoreOutline />
        }
        right={
          <MoreOutline className="text-2xl" onClick={() => { setActionVisible(true); }} />
        }
        onBack={() => { router.push('/'); }}
      >
        旅行计划
      </NavBar>

      <div className="flex-1 overflow-auto">{children}</div>

      <TabBar safeArea activeKey={pathname} onChange={(key) => { router.push(key); }}>
        <TabBar.Item icon={<EnvironmentOutline />} key={TRAVEL_BASE_PATH} title="地图" />
        <TabBar.Item icon={<StarOutline />} key={TRAVEL_FAVOURITES_PATH} title="收藏" />
        <TabBar.Item icon={<TravelOutline />} key={TRAVEL_ROUTES_PATH} title="路线" />
      </TabBar>

      <SafeArea position="bottom" />

      <ActionSheet
        closeOnAction
        safeArea
        actions={actions}
        visible={actionVisible}
        onAction={handleAction}
        onClose={() => { setActionVisible(false); }}
      />
    </div>
  );
}
