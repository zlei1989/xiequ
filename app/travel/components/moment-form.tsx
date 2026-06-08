"use client";

import { Button, Form, Input, Toast } from "antd-mobile";
import { useState } from "react";

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "添加失败";
      Toast.show({ icon: "fail", content: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form layout="horizontal">
      <Form.Item label="日期">
        <Input value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
      </Form.Item>
      <Form.Item label="内容">
        <Input value={text} onChange={setText} placeholder="记录这一刻..." />
      </Form.Item>
      <Form.Item>
        <Button color="primary" loading={submitting} onClick={handleSubmit}>
          添加
        </Button>
      </Form.Item>
    </Form>
  );
}
