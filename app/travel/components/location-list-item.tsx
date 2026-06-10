"use client";

import { Dialog, List, SwipeAction, Toast } from "antd-mobile";
import { CoverImage } from "./cover-image";
import { StatusTag } from "./status-tag";
import type { Location } from "../types";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function LocationListItem({
  location,
  hasMoments,
  onClick,
  onToggle,
  onDelete,
}: {
  location: Location;
  hasMoments: boolean;
  onClick: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
}) {
  const iconUrl = `/travel/api/download?type=icon&id=${location.id}`;

  async function handleToggle() {
    try {
      await onToggle(location);
    } catch (err: unknown) {
      Toast.show({ icon: "fail", content: getErrorMessage(err, "操作失败") });
    }
  }

  function handleDelete() {
    Dialog.confirm({
      content: `确认删除「${location.name}」及备注等信息？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDelete(location);
        } catch (err: unknown) {
          Toast.show({ icon: "fail", content: getErrorMessage(err, "删除失败") });
        }
      },
    });
  }

  return (
    <SwipeAction
      rightActions={[
        // 有精彩瞬间时隐藏切换按钮（状态锁定为已去）
        ...(hasMoments ? [] : [{
          key: "toggle",
          text: location.checked ? "标记待去" : "标记已去",
          color: "light" as const,
          onClick: handleToggle,
        }]),
        {
          key: "delete",
          text: "删除",
          color: "danger" as const,
          onClick: handleDelete,
        },
      ]}
    >
      <List.Item
        prefix={
          <CoverImage
            src={iconUrl}
            alt={location.name}
            width={44}
            height={44}
            shape="circle"
          />
        }
        description={location.address}
        extra={<StatusTag checked={location.checked} />}
        onClick={() => onClick(location)}
      >
        {location.name}
      </List.Item>
    </SwipeAction>
  );
}
