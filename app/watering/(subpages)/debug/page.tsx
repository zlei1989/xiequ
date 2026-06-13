/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

import { NavBar } from 'antd-mobile';
import { useRouter } from 'next/navigation';

import { DebugButtonCard } from '../../components/debug-button-card';
import { DebugForm } from '../../components/debug-form';
import { DebugLoadCard } from '../../components/debug-load-card';
import { DebugResponseList } from '../../components/debug-response-list';
import { useIotSimulator } from '../../hooks/use-iot-simulator';

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
      <div className="sticky top-0 z-10">
        <NavBar
          onBack={() => { router.back(); }}
        >
          调试服务
        </NavBar>
      </div>
      <DebugForm
        gpio={gpio}
        identity={identity}
        onGpioChange={setGpio}
        onIdentityChange={setIdentity}
      />
      <div className="flex flex-col gap-3 p-3">
        <DebugLoadCard loads={gpio.loads} />
        <DebugButtonCard
          loading={loading}
          onGetState={getState}
          onPushBootstrap={pushBootstrap}
          onPushChange={pushChange}
          onPushFinish={pushFinish}
        />
        <DebugResponseList logs={logs} onClear={clearLogs} />
      </div>
    </>
  );
}
