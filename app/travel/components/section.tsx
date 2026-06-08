"use client";

import type { ReactNode } from "react";
import { Card } from "antd-mobile";

export function Section({
  title,
  extra,
  children,
}: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title} extra={extra}>
      {children}
    </Card>
  );
}
