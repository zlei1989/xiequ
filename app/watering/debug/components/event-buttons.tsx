/**
 * 模拟器事件按钮 — 2×2 网格触发 getState / pushBootstrap / pushChange / pushFinish
 *
 * bootstrap 通过 Picker 选择参数后发送，change 通过 Popup 表单单选 + 多行输入。
 */

'use client';

import {
  Button,
  Card,
  Form,
  Grid,
  NavBar,
  Popup,
  Radio,
  Space,
  TextArea,
} from 'antd-mobile';
import { useState, useCallback } from 'react';

import { useBackButton } from '@/lib/back-button';

import type { RadioValue } from 'antd-mobile/es/components/radio';

const CHANGE_TYPES = [
  { label: 'step_ready (步骤就绪)', value: 'step_ready' },
  { label: 'step_begin (步骤开始)', value: 'step_begin' },
  { label: 'step_end (步骤正常结束)', value: 'step_end' },
  { label: 'step_timeout (步骤超时)', value: 'step_timeout' },
  { label: 'step_interrupt (步骤中断)', value: 'step_interrupt' },
];

const CAUSE_OPTIONS = [
  { label: '0 (正常上电)', value: '0' },
  { label: '2 (外部唤醒)', value: '2' },
  { label: '4 (定时器唤醒)', value: '4' },
];

/** 当前弹出的面板类型 */
type PopupType = 'bootstrap' | 'change' | null;

export function EventButtons({
  onGetState,
  onPushBootstrap,
  onPushChange,
  onPushFinish,
  loading,
}: {
  onGetState: () => Promise<void>;
  onPushBootstrap: (cause: string) => Promise<void>;
  onPushChange: (type: string, message: string) => Promise<void>;
  onPushFinish: () => Promise<void>;
  loading: boolean;
}) {
  const [popupType, setPopupType] = useState<PopupType>(null);
  const [changeType, setChangeType] = useState<string>('step_begin');
  const [changeMessage, setChangeMessage] = useState('');
  const [bootstrapCause, setBootstrapCause] = useState<string>('0');

  const closePopup = useCallback(() => {
    setPopupType(null);
  }, []);

  useBackButton(popupType === 'bootstrap', closePopup);
  useBackButton(popupType === 'change', closePopup);

  /** bootstrap 确认：发送并关闭 */
  const handleBootstrapConfirm = useCallback(() => {
    closePopup();
    void onPushBootstrap(bootstrapCause);
  }, [closePopup, onPushBootstrap, bootstrapCause]);

  /** change 确认：发送并关闭 */
  const handleChangeConfirm = useCallback(() => {
    closePopup();
    void onPushChange(changeType, changeMessage);
  }, [closePopup, onPushChange, changeType, changeMessage]);

  return (
    <>
      <Card title="模拟事件">
        <Grid columns={2} gap={8}>
          <Grid.Item>
            <Button
              block
              color="primary"
              loading={loading}
              onClick={() => { setPopupType('bootstrap'); }}
            >
              bootstrap
            </Button>
          </Grid.Item>
          <Grid.Item>
            <Button
              block
              color="primary"
              loading={loading}
              onClick={() => { void onGetState(); }}
            >
              getState
            </Button>
          </Grid.Item>
          <Grid.Item>
            <Button
              block
              color="primary"
              loading={loading}
              onClick={() => { setPopupType('change'); }}
            >
              change
            </Button>
          </Grid.Item>
          <Grid.Item>
            <Button
              block
              color="primary"
              loading={loading}
              onClick={() => { void onPushFinish(); }}
            >
              finish
            </Button>
          </Grid.Item>
        </Grid>
      </Card>

      {/* ---- bootstrap Popup ---- */}
      <Popup
        closeOnMaskClick={true}
        position="bottom"
        visible={popupType === 'bootstrap'}
        onClose={closePopup}
      >
        <NavBar onBack={closePopup}>bootstrap 参数</NavBar>

        <Form
          footer={
            <Button
              block
              color="primary"
              onClick={handleBootstrapConfirm}
            >
              确认发送
            </Button>
          }
          layout="horizontal"
        >
          <Form.Item label="启动原因">
            <Radio.Group
              value={bootstrapCause}
              onChange={(val: RadioValue) => {
                setBootstrapCause(String(val));
              }}
            >
              <Space block direction="vertical">
                {CAUSE_OPTIONS.map((item) => (
                  <Radio block key={item.value} value={item.value}>
                    {item.label}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Popup>

      {/* ---- change Popup ---- */}
      <Popup
        closeOnMaskClick={true}
        position="bottom"
        visible={popupType === 'change'}
        onClose={closePopup}
      >
        <NavBar onBack={closePopup}>change 参数</NavBar>

        <Form
          footer={
            <Button
              block
              color="primary"
              onClick={handleChangeConfirm}
            >
              确认发送
            </Button>
          }
          layout="horizontal"
        >
          <Form.Item label="变更类型">
            <Radio.Group
              value={changeType}
              onChange={(val: RadioValue) => {
                setChangeType(String(val));
              }}
            >
              <Space block direction="vertical">
                {CHANGE_TYPES.map((item) => (
                  <Radio block key={item.value} value={item.value}>
                    {item.label}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="附加消息">
            <TextArea
              placeholder="可选"
              rows={3}
              value={changeMessage}
              onChange={(v) => { setChangeMessage(v); }}
            />
          </Form.Item>
        </Form>
      </Popup>
    </>
  );
}
