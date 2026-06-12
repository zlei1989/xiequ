/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

import { Typography } from 'antd';

import { DeviceForm } from './components/device-form';
import { EventButtons } from './components/event-buttons';
import { ResponseLog } from './components/response-log';
import { useIotSimulator } from './hooks/use-iot-simulator';


const { Title, Paragraph } = Typography;

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
        <Title level={4} className="m-0">
          IoT 设备模拟器
        </Title>
        <Paragraph type="secondary" className="mb-0 mt-1">
          模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议
        </Paragraph>
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
