/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

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
      <div>
        <h4 className="m-0 text-lg font-semibold">IoT 设备模拟器</h4>
        <p className="mb-0 mt-1 text-sm text-gray-500">
          模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议
        </p>
      </div>

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
