"use client";

import { Card, Grid, ProgressBar, Space } from "antd-mobile";
import type { Summary } from "../types";

export function Stats({ summary }: { summary: Summary }) {
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Grid columns={3} gap={8}>
        <Grid.Item>
          <Card title="已去">{summary.checkedCount}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card title="待去">{summary.uncheckCount}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card title="总计">{summary.count}</Card>
        </Grid.Item>
      </Grid>
      <Card title="完成进度">
        <ProgressBar percent={summary.checkedPercentage} />
        {summary.checkedPercentage}%
      </Card>
    </Space>
  );
}
