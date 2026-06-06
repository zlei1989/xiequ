"use client";

import { Drawer, Descriptions, Tag, Button, Input, message } from "antd";
import { useState } from "react";
import type { Location } from "../types";

export function LocationDrawer({
  location,
  open,
  onClose,
  onUpdate,
}: {
  location: Location | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Location>) => Promise<Location>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; address: string; comments: string }>({ name: "", address: "", comments: "" });

  if (!location) return null;

  const loc = location;

  function startEdit() {
    setForm({ name: loc.name, address: loc.address, comments: loc.comments });
    setEditing(true);
  }

  async function saveEdit() {
    try {
      await onUpdate(loc.id, form);
      setEditing(false);
      message.success("已保存");
    } catch (err: any) {
      message.error(err.message);
    }
  }

  async function toggleChecked() {
    await onUpdate(loc.id, { checked: !loc.checked });
  }

  return (
    <Drawer title={loc.name} open={open} onClose={onClose} width={400}>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="地址" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input.TextArea placeholder="备注" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} rows={3} />
          <Button type="primary" onClick={saveEdit}>保存</Button>
          <Button onClick={() => setEditing(false)}>取消</Button>
        </div>
      ) : (
        <div>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="名称">{loc.name}</Descriptions.Item>
            <Descriptions.Item label="地址">{loc.address}</Descriptions.Item>
            <Descriptions.Item label="坐标">{loc.longitude.toFixed(6)}, {loc.latitude.toFixed(6)}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {loc.checked ? <Tag color="green">已去</Tag> : <Tag color="blue">待去</Tag>}
            </Descriptions.Item>
            {loc.comments && (
              <Descriptions.Item label="备注">{loc.comments}</Descriptions.Item>
            )}
          </Descriptions>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <Button size="small" onClick={startEdit}>编辑</Button>
            <Button size="small" onClick={toggleChecked}>
              {loc.checked ? "标记为待去" : "标记为已去"}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
