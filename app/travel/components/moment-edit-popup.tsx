"use client";

import { useState, useEffect } from "react";
import { Popup, Form, TextArea, Button, Toast, NavBar, DatePicker } from "antd-mobile";
import type { Moment } from "../types";
import dayjs from "dayjs";

// 将 "YYYY-MM-DD" 字符串转为 Date 对象
function dateStrToDate(str: string): Date {
  const d = dayjs(str);
  return d.isValid() ? d.toDate() : new Date();
}

// 将 Date 对象转为 "YYYY-MM-DD" 字符串
function dateToStr(d: Date): string {
  return dayjs(d).format("YYYY-MM-DD");
}

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
      Toast.show({ icon: "fail", content: "请选择日期" });
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
        {isEdit ? "编辑瞬间" : "添加瞬间"}
      </NavBar>
      <Form layout="vertical" style={{ padding: "0 16px" }}>
        <Form.Item label="日期">
          <DatePicker
            value={dateStrToDate(date)}
            onConfirm={(val) => {
              if (val) setDate(dateToStr(val));
            }}
            min={new Date(2000, 0, 1)}
            max={new Date()}
          >
            {(value, { open }) => (
              <Button fill="none" onClick={open}>
                {value ? dateToStr(value) : "请选择日期"}
              </Button>
            )}
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
