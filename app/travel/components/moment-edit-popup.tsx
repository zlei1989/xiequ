"use client";

import { useState, useEffect } from "react";
import { Popup, Form, Input, TextArea, Button, Toast, NavBar } from "antd-mobile";
import type { Moment } from "../types";

export function MomentEditPopup({
  moment,
  visible,
  onClose,
  onSave,
  onAdd,
}: {
  moment: Moment | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, data: { date: string; text: string }) => Promise<void>;
  onAdd: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!moment;

  useEffect(() => {
    if (visible) {
      if (moment) {
        setDate(moment.date);
        setText(moment.text);
      } else {
        setDate(new Date().toISOString().slice(0, 10));
        setText("");
      }
    }
  }, [visible, moment]);

  async function handleSave() {
    if (!date.trim()) {
      Toast.show({ icon: "fail", content: "请填写日期" });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && moment) {
        await onSave(moment.id, { date, text });
        Toast.show({ icon: "success", content: "修改成功" });
      } else {
        await onAdd({ date, text });
        Toast.show({ icon: "success", content: "添加成功" });
      }
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
        minHeight: "40vh",
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
        {isEdit ? "编辑记录" : "添加记录"}
      </NavBar>
      <Form layout="vertical" style={{ padding: "0 16px" }}>
        <Form.Item label="日期">
          <Input value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="内容">
          <TextArea
            value={text}
            onChange={setText}
            placeholder="记录这一刻..."
            rows={3}
          />
        </Form.Item>
      </Form>
    </Popup>
  );
}
