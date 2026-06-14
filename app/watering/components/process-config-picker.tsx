/**
 * 流程配置 Picker — 编辑单个 ProcessConfig 的名称、触发按钮、步骤列表
 *
 * 使用 antd-mobile Form 替代 List，vertical 布局适合移动端表单。
 * 提供声明式组件 + 静态 .prompt() 双 API。
 */

'use client';

import { Input, ErrorBlock, Selector, Button, List, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
import { renderToBody } from 'antd-mobile/es/utils/render-to-body';
import { AddOutline, DeleteOutline } from 'antd-mobile-icons';
import React, { useState, useEffect } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import type { ProcessConfig } from '../types';

interface ProcessConfigPickerProps {
  open: boolean;
  process: ProcessConfig;
  gpio: GpioInfo;
  onConfirm: (result: ProcessConfig) => void;
  onClose: () => void;
  onDelete?: () => void;
  onAddStep?: () => void;
  onEditStep?: (index: number) => void;
  afterClose?: () => void;
}

interface ProcessConfigPromptProps {
  process: ProcessConfig;
  gpio: GpioInfo;
  onConfirm?: (result: ProcessConfig) => void;
  onDelete?: () => void;
}

export function ProcessConfigPicker({
  open,
  process,
  gpio,
  onConfirm,
  onClose,
  onDelete,
  onAddStep,
  onEditStep,
  afterClose,
}: ProcessConfigPickerProps) {
  const [draft, setDraft] = useState(process);

  /* eslint-disable react-hooks/set-state-in-effect -- ID-based stale closure prevention */
  useEffect(() => {
    setDraft(process);
  }, [open, process]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useBackButton(open, onClose);

  function update(partial: Partial<ProcessConfig>) {
    const updated = { ...draft, ...partial };
    setDraft(updated);
    onConfirm(updated);
  }

  const buttonOptions = gpio.buttons.map((k) => ({ label: k, value: k }));

  function confirmDelete() {
    void Dialog.confirm({
      title: '确认删除此流程？',
      onConfirm: () => { onDelete?.(); },
    });
  }

  return (
    <Popup
      afterClose={afterClose}
      bodyStyle={{ height: '80vh' }}
      closeOnMaskClick={true}
      position="bottom"
      visible={open}
      onClose={onClose}
      onMaskClick={onClose}
    >
      <NavBar
        right={onDelete ? (
          <Button size="small" onClick={confirmDelete}>
            <DeleteOutline />
          </Button>
        ) : null}
        onBack={onClose}
      >
        编辑流程
      </NavBar>

      <div style={{ overflowY: 'auto', height: 'calc(80vh - 45px)' }}>
        <Form layout="vertical">
          <Form.Item label="功能名称">
            <Input
              placeholder="输入流程名称"
              value={draft.name}
              onChange={(v) => { update({ name: v }); }}
            />
          </Form.Item>

          <Form.Item label="触发按钮">
            {buttonOptions.length > 0 ? (
              <Selector
                options={buttonOptions}
                value={draft.trigger ? [draft.trigger] : []}
                onChange={(vals) => { update({ trigger: vals.length > 0 ? vals[0] : undefined }); }}
              />
            ) : (
              <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用按钮" />
            )}
          </Form.Item>
        </Form>

        <List header="步骤">
          {draft.steps.map((s, idx) => (
            <SwipeAction
              key={idx}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    void Dialog.confirm({
                      title: '确认删除此步骤？',
                      onConfirm: () => {
                        const newSteps = draft.steps.filter((_, i) => i !== idx);
                        update({ steps: newSteps });
                      },
                    });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                description={s.component}
                onClick={() => { onEditStep?.(idx); }}
              >
                {s.name}
              </List.Item>
            </SwipeAction>
          ))}
          <div className='p-2'>
            <Button block size='small' onClick={onAddStep}>
              <AddOutline /> 添加步骤
            </Button>
          </div>
        </List>

      </div>
    </Popup>
  );
}

ProcessConfigPicker.prompt = (props: ProcessConfigPromptProps): Promise<ProcessConfig | null> => {
  return new Promise((resolve) => {
    const Wrapper = () => {
      const [visible, setVisible] = useState(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renderToBody 初始化模式
      useEffect(() => { setVisible(true); }, []);
      return React.createElement(ProcessConfigPicker, {
        open: visible,
        process: props.process,
        gpio: props.gpio,
        onConfirm: (result: ProcessConfig) => {
          props.onConfirm?.(result);
          resolve(result);
        },
        onClose: () => {
          setVisible(false);
          resolve(null);
        },
        onDelete: props.onDelete,
        afterClose: () => { unmount(); },
      });
    };
    const unmount = renderToBody(React.createElement(Wrapper));
  });
};
