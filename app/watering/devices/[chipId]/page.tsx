/**
 * 设备详情/配置页
 *
 * 使用 antd-mobile NavBar 替代自定义顶栏，统一移动端交互。
 * 通过 saveRef 模式将保存函数从 DeviceConfigForm 传递到 Header 按钮。
 */

'use client';

import { NavBar, Button, DotLoading, Dialog, Toast, Space } from 'antd-mobile';
import { CheckOutline, DeleteOutline } from 'antd-mobile-icons';
import { useRouter, useParams } from 'next/navigation';
import { useRef } from 'react';

import { DeviceConfigForm } from '../../components/device-config-form';
import { useDeviceConfig } from '../../hooks/use-device-config';

export default function DeviceDetailPage() {
  const { chipId } = useParams<{ chipId: string }>();
  const router = useRouter();
  const { config, gpio, loading, save, remove } = useDeviceConfig(chipId);

  const saveRef = useRef<() => Promise<void>>(async () => { });

  /** 删除设备：Dialog 确认 → remove → Toast → 返回 */
  async function handleRemove() {
    const confirmed = await Dialog.confirm({
      title: '确认删除设备？',
      content: '不可恢复',
    });
    if (!confirmed) return;

    try {
      await remove();
      Toast.show({ icon: 'success', content: '设备已删除' });
      router.push('/watering');
    } catch (err: unknown) {
      console.error('[Watering] 删除设备失败:', {
        chipId,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      Toast.show({
        icon: 'fail',
        content: err instanceof Error ? err.message : String(err) || '删除失败',
      });
    }
  }

  /** 保存设备：通过 saveRef 调用 DeviceConfigForm 的 handleSave */
  async function handleSave() {
    await saveRef.current();
  }

  if (loading || !config) {
    return (
      <div className="py-12 text-center">
        <DotLoading />
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-[var(--background)]">
        <NavBar
          right={
            <Button size="small" onClick={() => { void handleSave(); }} >
              <CheckOutline />
            </Button>
          }
          onBack={() => { router.back(); }}
        >
          {config.name || '设备配置'}
        </NavBar>
      </div>

      <DeviceConfigForm
        config={config}
        gpio={gpio}
        saveRef={saveRef}
        onRemove={handleRemove}
        onSave={async (data) => {
          try {
            await save(data);
            Toast.show({ icon: 'success', content: '配置已保存' });
          } catch (err: unknown) {
            Toast.show({
              icon: 'fail',
              content: err instanceof Error ? err.message : String(err) || '保存失败',
            });
          }
        }}
      />
    </div>
  );
}
