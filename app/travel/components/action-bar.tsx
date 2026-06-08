"use client";

import { Button, Footer, Space } from "antd-mobile";

type Action = {
  key: string;
  text: string;
  color?: "default" | "primary" | "success" | "warning" | "danger";
  fill?: "solid" | "outline" | "none";
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function ActionBar({ actions }: { actions: Action[] }) {
  return (
    <Footer
      content={
        <Space wrap>
          {actions.map((action) => (
            <Button
              key={action.key}
              size="small"
              color={action.color}
              fill={action.fill}
              loading={action.loading}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.text}
            </Button>
          ))}
        </Space>
      }
    />
  );
}
