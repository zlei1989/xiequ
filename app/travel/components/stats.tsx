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
          <Card title="已去" headerStyle={{ justifyContent: 'center' }} bodyStyle={{ textAlign: 'center' }}>{String(summary.checkedCount)}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card title="待去" headerStyle={{ justifyContent: 'center' }} bodyStyle={{ textAlign: 'center' }}>{String(summary.uncheckCount)}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card title="总计" headerStyle={{ justifyContent: 'center' }} bodyStyle={{ textAlign: 'center' }}>{String(summary.count)}</Card>
        </Grid.Item>
      </Grid>
      <Card
        title="完成进度"
        extra={`${summary.checkedPercentage}%`}
      >
        <ProgressBar percent={summary.checkedPercentage} />
      </Card>
    </>
  );
}
