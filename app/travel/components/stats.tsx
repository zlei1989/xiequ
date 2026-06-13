/**
 * 旅行概览统计组件
 *
 * 展示已去/待去/总计数量和完成进度条。
 */

'use client';

import { Card, Grid, ProgressBar } from 'antd-mobile';

import type { Summary } from '../types';

/**
 * 渲染已去/待去/总计三列统计卡片和完成进度条
 */
export function Stats({ summary }: { summary: Summary }) {
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
