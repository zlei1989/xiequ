"use client";

import { Button, Card, Dialog, ErrorBlock, List, Popup, Space, Toast } from "antd-mobile";
import { UploadImage } from "./upload-image";
import { ActionBar } from "./action-bar";
import { CoverImage } from "./cover-image";
import { Section } from "./section";
import { StatusTag } from "./status-tag";
import type { Location, Moment } from "../types";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function LocationViewPopup({
  location,
  visible,
  onClose,
  moments,
  onEdit,
  onToggle,
  onDelete,
  onAddMoment,
  onEditMoment,
  onDeleteMoment,
}: {
  location: Location | null;
  visible: boolean;
  onClose: () => void;
  moments: Moment[];
  onEdit: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
  onAddMoment: () => void;
  onEditMoment: (moment: Moment) => void;
  onDeleteMoment: (moment: Moment) => Promise<void>;
}) {
  if (!location) return null;

  // 在 null 检查后提取为 const，闭包中可安全使用 Location 类型
  const loc = location;
  const coverUrl = `/travel/api/download?type=cover&id=${loc.id}`;

  async function handleToggle() {
    try {
      await onToggle(loc);
      Toast.show({ icon: "success", content: "更新成功" });
    } catch (err: unknown) {
      Toast.show({ icon: "fail", content: getErrorMessage(err, "更新失败") });
    }
  }

  function handleDelete() {
    Dialog.confirm({
      content: `确认删除「${loc.name}」及备注等信息？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDelete(loc);
          onClose();
        } catch (err: unknown) {
          Toast.show({ icon: "fail", content: getErrorMessage(err, "删除失败") });
        }
      },
    });
  }

  function handleDeleteMoment(moment: Moment) {
    Dialog.confirm({
      content: `确认删除「${moment.date}」的记录？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDeleteMoment(moment);
          Toast.show({ icon: "success", content: "删除成功" });
        } catch (err: unknown) {
          Toast.show({ icon: "fail", content: getErrorMessage(err, "删除失败") });
        }
      },
    });
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      onClose={onClose}
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: "90vh",
        overflow: "auto",
      }}
    >
      <div style={{ position: "relative" }}>
        <CoverImage src={coverUrl} alt={loc.name} height={240} />
        <div style={{ position: "absolute", right: 8, bottom: 8 }}>
          <UploadImage locationId={loc.id} type="cover" />
        </div>
      </div>

      <List>
        <List.Item
          extra={
            <Space align="center">
              <StatusTag checked={loc.checked} />
              <Button size="small" fill="none" color="primary" onClick={() => onEdit(loc)}>
                编辑
              </Button>
            </Space>
          }
        >
          {loc.name}
        </List.Item>
        <List.Item title="地址">{loc.address}</List.Item>
        <List.Item title="坐标">
          {loc.longitude}, {loc.latitude}
        </List.Item>
        {loc.comments && <List.Item title="备注">{loc.comments}</List.Item>}
      </List>

      <Section
        title="精彩瞬间"
        extra={
          <Button size="small" fill="none" color="primary" onClick={onAddMoment}>
            添加
          </Button>
        }
      >
        {moments.length === 0 ? (
          <ErrorBlock status="empty" title="暂无记录" />
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            {moments.map((moment) => (
              <Card
                key={moment.id}
                title={moment.date}
                extra={
                  <Button
                    size="small"
                    fill="none"
                    color="danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteMoment(moment);
                    }}
                  >
                    删除
                  </Button>
                }
                onClick={() => onEditMoment(moment)}
              >
                {moment.text}
              </Card>
            ))}
          </Space>
        )}
      </Section>

      <ActionBar
        actions={[
          { key: "delete", text: "删除", color: "danger", onClick: handleDelete },
          {
            key: "toggle",
            text: loc.checked ? "标记待去" : "标记已去",
            color: loc.checked ? "default" : "primary",
            onClick: handleToggle,
          },
          { key: "close", text: "关闭", color: "primary", fill: "outline", onClick: onClose },
        ]}
      />
    </Popup>
  );
}
