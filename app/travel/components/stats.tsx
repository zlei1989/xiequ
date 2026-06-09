"use client";

import { Card, Grid, ProgressBar } from "antd-mobile";
import type { Summary } from "../types";

export function Stats({ summary }: { summary: Summary }) {
  return (
    <>
      <Grid columns={3} gap={8}>
        <Grid.Item>
          <Card title="已去" headerStyle={{ justifyContent: "center" }} bodyStyle={{ textAlign: "center" }}>{String(summary.checkedCount)}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card title="待去" headerStyle={{ justifyContent: "center" }} bodyStyle={{ textAlign: "center" }}>{String(summary.uncheckCount)}</Card>
        </Grid.Item>
        <Grid.Item>
          <Card title="总计" headerStyle={{ justifyContent: "center" }} bodyStyle={{ textAlign: "center" }}>{String(summary.count)}</Card>
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
