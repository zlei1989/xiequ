/**
 * 模拟器事件按钮 — 2×2 网格触发 getState / pushBootstrap / pushChange / pushFinish
 *
 * bootstrap 和 change 通过底部 Popup 选择参数后发送。
 */

'use client';

import { Button, Card, Input, Picker, Popup } from 'antd-mobile';
import { useState, useCallback } from 'react';

import type { PickerValue } from 'antd-mobile/es/components/picker';

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
  const [changeType, setChangeType] = useState<PickerValue[]>(['step_begin']);
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
    void onPushChange(String(changeType[0]), changeMessage);
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
          <div className="mb-2 text-sm text-gray-500">变更类型 (type)</div>
          <div className="flex flex-col gap-1">
            {CHANGE_TYPES.map((item) => (
              <div
                key={item.value}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
                  changeType[0] === item.value
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 active:bg-gray-50'
                }`}
                onClick={() => {
                  setChangeType([item.value]);
                }}
              >
                {item.label}
              </div>
            ))}
          </div>
          <div className="mb-2 mt-4 text-sm text-gray-500">
            附加消息 (message)
          </div>
          <Input
            placeholder="可选"
            value={changeMessage}
            onChange={(v) => { setChangeMessage(v); }}
          />
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
