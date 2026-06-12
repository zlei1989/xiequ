/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

import { NavBar, NoticeBar } from 'antd-mobile';

import { DeviceForm } from './components/device-form';
import { EventButtons } from './components/event-buttons';
import { ResponseLog } from './components/response-log';
import { useIotSimulator } from './hooks/use-iot-simulator';

export default function DebugPage() {
  const {
    identity,
    setIdentity,
    gpio,
    setGpio,
    logs,
    loading,
    getState,
    pushBootstrap,
    pushChange,
    pushFinish,
    clearLogs,
  } = useIotSimulator();

  return (
    <div className="flex flex-col gap-4">
      <NavBar back={null}>
        IoT 设备模拟器
      </NavBar>
      <NoticeBar
        content="模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议"
        color="default"
      />

      <DeviceForm
        identity={identity}
        onIdentityChange={setIdentity}
        gpio={gpio}
        onGpioChange={setGpio}
      />

      <EventButtons
        onGetState={getState}
        onPushBootstrap={pushBootstrap}
        onPushChange={pushChange}
        onPushFinish={pushFinish}
        loading={loading}
      />

      <ResponseLog logs={logs} onClear={clearLogs} />
    </div>
  );
}
