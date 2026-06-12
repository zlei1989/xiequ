/**
 * 位置编辑弹窗 — 修改名称、地址、备注
 */

'use client';

import { Popup, Form, Input, TextArea, Button, Toast, NavBar } from 'antd-mobile';
import { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';

import type { Location } from '../types';

/**
 * 位置编辑弹窗，支持修改名称、地址和备注
 *
 * 表单值在 visible 变为 true 时从 location prop 同步初始化。
 * 保存通过父组件传入的 onSave 回调完成，不直接操作数据源。
 */
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
  useBackButton(visible, onClose);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  // 弹窗打开时将 location 数据同步到表单（标准 UI 模式）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible && location) {
      setName(location.name);
      setAddress(location.address);
      setComments(location.comments);
    }
  }, [visible, location]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * 提交编辑表单 —— 调用父组件 onSave 执行 Server Action 持久化，
   * 成功后关闭弹窗，失败时打 ERROR 日志并 Toast 提示。
   */
  async function handleSave() {
    if (!location) return;
    setSaving(true);
    try {
      await onSave(location.id, { name, address, comments });
      Toast.show({ icon: 'success', content: '保存成功' });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存失败';
      console.error('[Travel] 编辑位置失败:', err, { locationId: location.id });
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
        minHeight: '50vh',
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
        编辑位置
      </NavBar>
      <Form layout="vertical" className="px-4">
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
