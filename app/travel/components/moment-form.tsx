"use client";

import { useState } from "react";
import { Form, Input, DatePicker, Button, message } from "antd";
import dayjs from "dayjs";

export function MomentForm({
  onSubmit,
}: {
  onSubmit: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  async function onFinish(values: { date: dayjs.Dayjs; text: string }) {
    setSubmitting(true);
    try {
      await onSubmit({ date: values.date.format("YYYY-MM-DD"), text: values.text });
      form.resetFields();
      message.success("已添加");
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form form={form} onFinish={onFinish} layout="inline">
      <Form.Item name="date" rules={[{ required: true, message: "请选择日期" }]}>
        <DatePicker />
      </Form.Item>
      <Form.Item name="text" style={{ flex: 1 }}>
        <Input placeholder="记录这一刻..." />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={submitting}>添加</Button>
      </Form.Item>
    </Form>
  );
}
