"use client";

import { useState, useEffect } from "react";
import { Popup, Form, Input, TextArea, Button, Toast, NavBar } from "antd-mobile";
import type { Location } from "../types";

export function LocationEditPopup({
  location,
  visible,
  onClose,
  onSave,
}: {
  location: Location | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Location>) => Promise<Location>;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && location) {
      setName(location.name);
      setAddress(location.address);
      setComments(location.comments);
    }
  }, [visible, location]);

  async function handleSave() {
    if (!location) return;
    setSaving(true);
    try {
      await onSave(location.id, { name, address, comments });
      Toast.show({ icon: "success", content: "保存成功" });
      onClose();
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message || "保存失败" });
    } finally {
      setSaving(false);
    }
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
        minHeight: "50vh",
        maxHeight: "75vh",
        overflow: "auto",
      }}
    >
      <NavBar
        onBack={onClose}
        right={
          <Button color="primary" size="small" loading={saving} onClick={handleSave}>
            保存
          </Button>
        }
      >
        编辑位置
      </NavBar>
      <Form layout="vertical" style={{ padding: "0 16px" }}>
        <Form.Item label="名称">
          <Input value={name} onChange={setName} placeholder="位置名称" />
        </Form.Item>
        <Form.Item label="地址">
          <Input value={address} onChange={setAddress} placeholder="地址" />
        </Form.Item>
        <Form.Item label="备注">
          <TextArea
            value={comments}
            onChange={setComments}
            placeholder="备注"
            rows={3}
          />
        </Form.Item>
      </Form>
    </Popup>
  );
}
