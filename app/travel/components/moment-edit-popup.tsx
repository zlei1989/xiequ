/**
 * 精彩瞬间编辑弹窗 — 日期选择 + 文字内容，添加/编辑复用同一组件
 */

'use client';

import { Popup, Form, TextArea, Button, Toast, NavBar, DatePicker } from 'antd-mobile';
import dayjs from 'dayjs';
import { useState, useEffect } from 'react';

import type { Moment } from '../types';


// 将 "YYYY-MM-DD" 字符串转为 Date 对象
function dateStrToDate(str: string): Date {
  const d = dayjs(str);
  return d.isValid() ? d.toDate() : new Date();
}

// 将 Date 对象转为 "YYYY-MM-DD" 字符串
function dateToStr(d: Date): string {
  return dayjs(d).format('YYYY-MM-DD');
}

/**
 * 精彩瞬间编辑弹窗，添加/编辑复用同一组件
 *
 * 通过 moment prop 是否非空判断编辑模式。日期使用 antd-mobile DatePicker，
 * 值与 dayjs 互转。保存时分 add/save 两条路径。
 */
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
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const isEdit = !!moment;

  // 弹窗打开时同步 moment 数据或重置为默认值（标准 UI 模式）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      if (moment) {
        setDate(moment.date);
        setText(moment.text);
      } else {
        setDate(new Date().toISOString().slice(0, 10));
        setText('');
      }
    }
  }, [visible, moment]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * 提交瞬间表单 —— 根据 isEdit 判断走 onSave（编辑）或 onAdd（新增）路径，
   * 先校验日期非空，成功后关闭弹窗，失败时打 ERROR 日志并 Toast 提示。
   */
  async function handleSave() {
    if (!date.trim()) {
      Toast.show({ icon: 'fail', content: '请选择日期' });
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await onSave(moment.id, { date, text });
        Toast.show({ icon: 'success', content: '修改成功' });
      } else {
        await onAdd({ date, text });
        Toast.show({ icon: 'success', content: '添加成功' });
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存失败';
      console.error('[Travel] 保存瞬间失败:', err, { momentId: moment?.id });
      if (err instanceof Error && err.stack) console.error(err.stack);
      Toast.show({ icon: 'fail', content: message });
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
        minHeight: '40vh',
        maxHeight: '75vh',
        overflow: 'auto',
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
        {isEdit ? '编辑瞬间' : '添加瞬间'}
      </NavBar>
      <Form layout="vertical" style={{ padding: '0 16px' }}>
        <Form.Item
          label="日期"
          onClick={() => { setDatePickerVisible(true); }}
        >
          <DatePicker
            visible={datePickerVisible}
            onClose={() => { setDatePickerVisible(false); }}
            value={dateStrToDate(date)}
            onConfirm={(val) => {
              setDate(dateToStr(val));
            }}
            min={new Date(2000, 0, 1)}
            max={new Date()}
          >
            {(value) => (value ? dateToStr(value) : '请选择日期')}
          </DatePicker>
        </Form.Item>
        <Form.Item label="内容">
          <TextArea
            value={text}
            onChange={setText}
            placeholder="记录这一刻..."
            rows={4}
          />
        </Form.Item>
      </Form>
    </Popup>
  );
}
