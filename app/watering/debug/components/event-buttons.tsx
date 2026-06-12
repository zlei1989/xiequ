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
  Picker,
  Popup,
  Radio,
  Space,
  TextArea,
} from 'antd-mobile';
import { useState, useCallback } from 'react';

import type { PickerValue } from 'antd-mobile/es/components/picker';
import type { RadioValue } from 'antd-mobile/es/components/radio';

const CHANGE_TYPES = [
  { label: 'step_ready (步骤就绪)', value: 'step_ready' },
  { label: 'step_begin (步骤开始)', value: 'step_begin' },
  { label: 'step_end (步骤正常结束)', value: 'step_end' },
  { label: 'step_timeout (步骤超时)', value: 'step_timeout' },
  { label: 'step_interrupt (步骤中断)', value: 'step_interrupt' },
];

const CAUSE_COLUMNS = [
  [
    { label: '0 (正常上电)', value: '0' },
    { label: '2 (外部唤醒)', value: '2' },
    { label: '4 (定时器唤醒)', value: '4' },
  ],
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
  const [bootstrapCause, setBootstrapCause] = useState<PickerValue[]>(['0']);

  const closePopup = useCallback(() => {
    setPopupType(null);
  }, []);

  /** bootstrap 确认：发送并关闭 */
  const handleBootstrapConfirm = useCallback(
    (val: PickerValue[]) => {
      setBootstrapCause(val);
      closePopup();
      void onPushBootstrap(String(val[0]));
    },
    [closePopup, onPushBootstrap],
  );

  /** change 确认：发送并关闭 */
  const handleChangeConfirm = useCallback(() => {
    closePopup();
    void onPushChange(changeType, changeMessage);
  }, [closePopup, onPushChange, changeType, changeMessage]);

  return (
    <>
      <Card title="模拟事件">
        <div className="grid grid-cols-2 gap-2 px-2 pb-1">
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { setPopupType('bootstrap'); }}
          >
            bootstrap
          </Button>
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { void onGetState(); }}
          >
            getState
          </Button>
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { setPopupType('change'); }}
          >
            change
          </Button>
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => { void onPushFinish(); }}
          >
            finish
          </Button>
        </div>
      </Card>

      {/* ---- bootstrap Picker（自弹层，不套 Popup） ---- */}
      <Picker
        columns={CAUSE_COLUMNS}
        visible={popupType === 'bootstrap'}
        value={bootstrapCause}
        onConfirm={handleBootstrapConfirm}
        onClose={closePopup}
        title="启动原因 (cause)"
      />

      {/* ---- change Popup ---- */}
      <Popup
        visible={popupType === 'change'}
        onClose={closePopup}
        position="bottom"
        bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      >
        <div className="px-3 pb-6 pt-4">
          <h3 className="mb-3 text-center text-base font-medium">
            change 参数
          </h3>

          <Form layout="horizontal">
            <Form.Item label="变更类型">
              <Radio.Group
                value={changeType}
                onChange={(val: RadioValue) => {
                  setChangeType(String(val));
                }}
              >
                <Space direction="vertical" block>
                  {CHANGE_TYPES.map((item) => (
                    <Radio key={item.value} value={item.value} block>
                      {item.label}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            </Form.Item>

            <Form.Item label="附加消息">
              <TextArea
                placeholder="可选"
                value={changeMessage}
                onChange={(v) => { setChangeMessage(v); }}
                rows={3}
              />
            </Form.Item>
          </Form>

          <Button
            block
            color="primary"
            className="mt-4"
            onClick={handleChangeConfirm}
          >
            确认发送
          </Button>
        </div>
      </Popup>
    </>
  );
}
