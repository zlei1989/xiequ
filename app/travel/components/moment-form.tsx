"use client";

import { useState } from "react";
import { Form, Input, Button, Toast } from "antd-mobile";

export function MomentForm({
  onSubmit,
}: {
  onSubmit: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!date) {
      Toast.show({ icon: "fail", content: "请选择日期" });
      return;
    }
    if (!text.trim()) {
      Toast.show({ icon: "fail", content: "请输入内容" });
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ date, text });
      setDate("");
      setText("");
      Toast.show({ icon: "success", content: "已添加" });
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form layout="horizontal" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <Form.Item label="日期" style={{ flexShrink: 0 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            padding: "6px 8px",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            fontSize: 14,
          }}
        />
      </Form.Item>
      <Form.Item label="内容" style={{ flex: 1, minWidth: 0 }}>
        <Input
          value={text}
          onChange={setText}
          placeholder="记录这一刻..."
        />
      </Form.Item>
      <Form.Item style={{ flexShrink: 0, alignSelf: "flex-end" }}>
        <Button
          color="primary"
          type="submit"
          loading={submitting}
          onClick={handleSubmit}
        >
          添加
        </Button>
      </Form.Item>
    </Form>
  );
}
