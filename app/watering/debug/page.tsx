/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

import { NavBar, NoticeBar } from 'antd-mobile';
import { useRouter } from 'next/navigation';

import { DeviceForm } from './components/device-form';
import { EventButtons } from './components/event-buttons';
import { LoadDisplay } from './components/load-display';
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
  const router = useRouter();

  return (
    <>
      <NavBar
        onBack={() => { router.back(); }}
      >
        调试服务
      </NavBar>
      <DeviceForm
        gpio={gpio}
        identity={identity}
        onGpioChange={setGpio}
        onIdentityChange={setIdentity}
      />
      <div className="flex flex-col gap-4 p-4">
        <LoadDisplay loads={gpio.loads} />
        <EventButtons
          loading={loading}
          onGetState={getState}
          onPushBootstrap={pushBootstrap}
          onPushChange={pushChange}
          onPushFinish={pushFinish}
        />
        <ResponseLog logs={logs} onClear={clearLogs} />
      </div>
    </>
  );
}
