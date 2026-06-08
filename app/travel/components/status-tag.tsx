"use client";

import { Tag } from "antd-mobile";

export function StatusTag({ checked }: { checked: boolean }) {
  return (
    <Tag color={checked ? "success" : "primary"} fill="outline">
      {checked ? "已去" : "待去"}
    </Tag>
  );
}
