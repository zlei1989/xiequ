/**
 * 精彩瞬间表单 — 简单的日期 + 内容录入表单（备用，实际使用 MomentEditPopup）
 */

'use client';

import { Button, Form, Input, Toast } from 'antd-mobile';
import { useState } from 'react';

/**
 * 精彩瞬间表单（备用），简单的日期 + 内容水平表单
 *
 * 提交后自动清空表单字段。
 */
export function MomentForm({
  onSubmit,
}: {
  onSubmit: (data: { date: string; text: string }) => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /**
   * 提交表单新增瞬间 —— 先校验日期和内容非空，调用 onSubmit 持久化，
   * 成功后清空表单并 Toast，失败时打 ERROR 日志并 Toast 提示。
   */
  async function handleSubmit() {
    if (!date) {
      Toast.show({ icon: 'fail', content: '请选择日期' });
      return;
    }
    if (!text.trim()) {
      Toast.show({ icon: 'fail', content: '请输入内容' });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ date, text });
      setDate('');
      setText('');
      Toast.show({ icon: 'success', content: '已添加' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '添加失败';
      console.error('[Travel] 添加瞬间失败:', err);
      if (err instanceof Error && err.stack) console.error(err.stack);
      Toast.show({ icon: 'fail', content: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form layout="horizontal">
      <Form.Item label="日期">
        <Input placeholder="YYYY-MM-DD" value={date} onChange={setDate} />
      </Form.Item>
      <Form.Item label="内容">
        <Input placeholder="记录这一刻..." value={text} onChange={setText} />
      </Form.Item>
      <Form.Item>
        <Button color="primary" loading={submitting} onClick={handleSubmit}>
          添加
        </Button>
      </Form.Item>
    </Form>
  );
}
