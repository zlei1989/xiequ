"use client";

import { useState, useEffect } from "react";
import { Popup, List, Button, Dialog, Toast } from "antd-mobile";
import { PictureWrongOutline } from "antd-mobile-icons";
import { UploadImage } from "./upload-image";
import type { Location, Moment } from "../types";

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
  const [coverError, setCoverError] = useState(false);

  useEffect(() => {
    setCoverError(false);
  }, [location?.id]);

  if (!location) return null;

  const coverUrl = `/travel/api/download?type=cover&id=${location.id}`;

  async function handleToggle() {
    try {
      await onToggle(location!);
      Toast.show({ icon: "success", content: "更新成功" });
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "更新失败" });
    }
  }

  function handleDelete() {
    Dialog.confirm({
      content: `确认删除「${location!.name}」及备注等信息？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDelete(location!);
          onClose();
        } catch (err: any) {
          Toast.show({ icon: "fail", content: err.message || "删除失败" });
        }
      },
    });
  }

  function handleDeleteMoment(m: Moment) {
    Dialog.confirm({
      content: `确认删除「${m.date}」的记录？不可恢复。`,
      confirmText: "确定",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await onDeleteMoment(m);
          Toast.show({ icon: "success", content: "删除成功" });
        } catch (err: any) {
          Toast.show({ icon: "fail", content: err.message || "删除失败" });
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
      {/* 封面图 */}
      <div style={{ position: "relative" }}>
        {coverError ? (
          <div
            style={{
              width: "100%",
              height: 200,
              background: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PictureWrongOutline style={{ fontSize: 48, color: "#bbb" }} />
          </div>
        ) : (
          <img
            src={coverUrl}
            alt={location.name}
            style={{ width: "100%", maxHeight: 240, objectFit: "cover" }}
            onError={() => setCoverError(true)}
          />
        )}
        <div style={{ position: "absolute", right: 8, bottom: 8 }}>
          <UploadImage locationId={location.id} type="cover" />
        </div>
      </div>

      {/* 信息区 */}
      <List style={{ "--font-size": "14px" } as React.CSSProperties}>
        <List.Item
          extra={
            <span
              onClick={(e) => {
                e.stopPropagation();
                onEdit(location);
              }}
              style={{ fontSize: 13, color: "#1677ff", cursor: "pointer" }}
            >
              编辑
            </span>
          }
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>{location.name}</div>
        </List.Item>
        <List.Item>
          <div style={{ color: "#666", fontSize: 13 }}>{location.address}</div>
        </List.Item>
        <List.Item>
          <div style={{ color: "#999", fontSize: 12 }}>
            坐标: {location.longitude}, {location.latitude}
          </div>
        </List.Item>
        {location.comments && (
          <List.Item>
            <div style={{ color: "#666", fontSize: 13, whiteSpace: "pre-wrap" }}>
              {location.comments}
            </div>
          </List.Item>
        )}
      </List>

      {/* 精彩瞬间 */}
      <div
        style={{
          padding: "12px 16px 4px",
          fontSize: 14,
          fontWeight: 600,
          color: "#333",
        }}
      >
        精彩瞬间
      </div>
      {moments.length === 0 && (
        <div style={{ padding: "8px 16px", color: "#999", fontSize: 13 }}>
          暂无记录
        </div>
      )}
      {moments.map((m) => (
        <List.Item
          key={m.id}
          description={m.date}
          clickable
          onClick={() => onEditMoment(m)}
          extra={
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteMoment(m);
              }}
              style={{ color: "#ff4d4f", fontSize: 13, cursor: "pointer" }}
            >
              删除
            </span>
          }
        >
          <div
            style={{
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {m.text}
          </div>
        </List.Item>
      ))}
      <Button fill="none" onClick={onAddMoment} style={{ margin: "4px 16px" }}>
        + 添加记录
      </Button>

      {/* 底部操作栏 */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderTop: "1px solid #eee",
        }}
      >
        <Button color="danger" size="small" onClick={handleDelete}>
          删除
        </Button>
        <Button
          color={location.checked ? "default" : "primary"}
          size="small"
          onClick={handleToggle}
        >
          {location.checked ? "标记待去" : "标记已去"}
        </Button>
        <Button
          color="primary"
          size="small"
          fill="outline"
          onClick={onClose}
        >
          关闭
        </Button>
      </div>
    </Popup>
  );
}
