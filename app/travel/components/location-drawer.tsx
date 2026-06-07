"use client";

import { useState, useEffect, useRef } from "react";
import {
  Drawer,
  Descriptions,
  Button,
  Input,
  Popconfirm,
  Timeline,
  Card,
  Space,
  message,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { UploadImage } from "./upload-image";
import { useMoments } from "../hooks/use-moments";
import type { Location } from "../types";

export function LocationDrawer({
  location,
  open,
  onClose,
  onUpdate,
  onRemove,
}: {
  location: Location | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Location>) => Promise<Location>;
  onRemove: (id: string) => Promise<void>;
}) {
  // 模式状态
  const [editable, setEditable] = useState(false);
  const [targetType, setTargetType] = useState<"location" | "moment">("location");

  // 位置编辑表单
  const [locationForm, setLocationForm] = useState({ name: "", address: "", comments: "" });

  // 瞬间编辑表单
  const [momentForm, setMomentForm] = useState({ date: "", text: "" });
  const [editingMomentId, setEditingMomentId] = useState<string>("");

  const [saving, setSaving] = useState(false);

  // 当 drawer 打开时重置状态
  const lastOpenTs = useRef(0);
  useEffect(() => {
    if (open) {
      lastOpenTs.current = Date.now();
      setEditable(false);
    }
  }, [open, location?.id]);

  // 精彩瞬间
  const { moments, add: addMoment, update: updateMoment, remove: removeMoment } = useMoments(
    location?.id || ""
  );

  if (!location) return null;

  const coverUrl = `/travel/api/download?type=cover&id=${location.id}`;

  // ─── 位置编辑 ───

  function startEditLocation() {
    setTargetType("location");
    setLocationForm({
      name: location!.name,
      address: location!.address,
      comments: location!.comments,
    });
    setEditable(true);
  }

  async function saveLocation() {
    setSaving(true);
    try {
      await onUpdate(location!.id, locationForm);
      message.success("保存成功");
      setEditable(false);
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // ─── 瞬间编辑 ───

  function startAddMoment() {
    setTargetType("moment");
    setEditingMomentId("");
    setMomentForm({ date: new Date().toISOString().slice(0, 10), text: "" });
    setEditable(true);
  }

  function startEditMoment(id: string, m: { date: string; text: string }) {
    setTargetType("moment");
    setEditingMomentId(id);
    setMomentForm({ date: m.date, text: m.text });
    setEditable(true);
  }

  async function saveMoment() {
    if (!momentForm.date.trim() || !momentForm.text.trim()) {
      message.warning("请填写日期和内容");
      return;
    }
    setSaving(true);
    try {
      if (editingMomentId) {
        await updateMoment(editingMomentId, momentForm);
        message.success("修改成功");
      } else {
        await addMoment(momentForm);
        message.success("添加成功");
      }
      setEditable(false);
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMoment(id: string) {
    try {
      await removeMoment(id);
      message.success("删除成功");
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  // ─── 位置操作 ───

  async function toggleChecked() {
    setSaving(true);
    try {
      await onUpdate(location!.id, { checked: !location!.checked });
      message.success("更新成功");
    } catch (err: any) {
      message.error(err.message || "更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await onRemove(location!.id);
    onClose();
  }

  function cancelEdit() {
    setEditable(false);
  }

  // 防止刚打开时即关闭（对标参考 onBeforeClose）
  function handleBeforeClose() {
    const now = Date.now();
    if (now - lastOpenTs.current > 500) {
      onClose();
      setEditable(false);
    }
  }

  // ─── 渲染 ───

  return (
    <Drawer
      title={location.name}
      placement="bottom"
      size="large"
      open={open}
      onClose={handleBeforeClose}
      destroyOnClose
      footer={
        editable ? (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={saving}
              onClick={targetType === "location" ? saveLocation : saveMoment}
            >
              保存
            </Button>
            <Button icon={<CloseOutlined />} onClick={cancelEdit}>
              取消
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex" }}>
            <Popconfirm
              title={`确认删除${location.name}及备注等信息？不可恢复。`}
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button icon={<DeleteOutlined />} danger>
                删除
              </Button>
            </Popconfirm>
            <span style={{ flex: 1 }} />
            <Button
              type={location.checked ? "primary" : "default"}
              icon={location.checked ? <CheckOutlined /> : <StarOutlined />}
              loading={saving}
              onClick={toggleChecked}
            >
              {location.checked ? "已去" : "待去"}
            </Button>
            <Button icon={<CloseOutlined />} onClick={onClose} style={{ marginLeft: 8 }}>
              关闭
            </Button>
          </div>
        )
      }
    >
      {!editable ? (
        /* ─── 查看模式 ─── */
        <div>
          <Descriptions
            column={2}
            size="small"
            title={
              <span>
                {location.name}
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={startEditLocation}
                  style={{ marginLeft: 8 }}
                />
              </span>
            }
            extra={<UploadImage locationId={location.id} type="cover" />}
          >
            <Descriptions.Item span={2}>
              <img
                src={coverUrl}
                alt="封面"
                style={{ width: "100%", minHeight: 225, objectFit: "cover", borderRadius: 8 }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="地址" span={2}>
              {location.address}
            </Descriptions.Item>
            <Descriptions.Item label="经度">
              {location.longitude}
            </Descriptions.Item>
            <Descriptions.Item label="纬度">
              {location.latitude}
            </Descriptions.Item>
            {location.comments && (
              <Descriptions.Item label="备注" span={2}>
                {location.comments}
              </Descriptions.Item>
            )}
          </Descriptions>

          {/* 精彩瞬间时间线 */}
          <Timeline style={{ paddingLeft: 0, marginTop: 16 }}>
            {moments.map((moment) => (
              <Timeline.Item key={moment.id}>
                <Card
                  size="small"
                  title={moment.date}
                  extra={
                    <Space>
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => startEditMoment(moment.id, moment)}
                      />
                      <Popconfirm
                        title={`确认删除${moment.date}的精彩瞬间？不可恢复。`}
                        onConfirm={() => handleDeleteMoment(moment.id)}
                      >
                        <Button type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  }
                >
                  {moment.text}
                </Card>
              </Timeline.Item>
            ))}
          </Timeline>
          <Button
            type="link"
            icon={<PlusOutlined />}
            onClick={startAddMoment}
            style={{ marginTop: 8 }}
          >
            添加记录
          </Button>
        </div>
      ) : targetType === "location" ? (
        /* ─── 编辑位置模式 ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              名称
            </label>
            <Input
              value={locationForm.name}
              onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
              placeholder="位置名称"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              地址
            </label>
            <Input
              value={locationForm.address}
              onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
              placeholder="地址"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              备注
            </label>
            <Input.TextArea
              value={locationForm.comments}
              onChange={(e) => setLocationForm({ ...locationForm, comments: e.target.value })}
              placeholder="备注"
              rows={3}
            />
          </div>
        </div>
      ) : (
        /* ─── 编辑瞬间模式 ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              日期
            </label>
            <Input
              value={momentForm.date}
              onChange={(e) => setMomentForm({ ...momentForm, date: e.target.value })}
              placeholder="YYYY-MM-DD"
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              内容
            </label>
            <Input.TextArea
              value={momentForm.text}
              onChange={(e) => setMomentForm({ ...momentForm, text: e.target.value })}
              placeholder="记录这一刻..."
              rows={3}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
