/**
 * 设备详情/配置页
 *
 * 展示单个设备的完整配置编辑器，顶栏提供保存/删除/返回操作。
 * 通过 saveRef 模式将保存函数从 DeviceEditor 传递到 Header 按钮。
 */

'use client';

import { ArrowLeftOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { Spin, Button, Popconfirm, message } from 'antd';
import { useRouter } from 'next/navigation';
import { use, useRef } from 'react';

import { DeviceEditor } from '../../components/device-editor';
import { useDeviceConfig } from '../../hooks/use-device-config';

/** 设备详情页 */
export default function DeviceDetailPage({
  params,
}: {
  /** Next.js 15 将动态路由参数以 Promise 形式传递，需 use() 解包 */
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { config, gpio, loading, save, remove } = useDeviceConfig(chipId);

  // DeviceEditor 将 handleSave 注册到此 ref，Header 保存按钮通过它触发保存
  const saveRef = useRef<() => Promise<void>>(async () => {});

  async function handleRemove() {
    try {
      await remove();
      message.success('设备已删除');
      router.push('/watering');
    } catch (err: unknown) {
      console.error('[Watering] 删除设备失败:', { chipId, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      message.error(err instanceof Error ? err.message : String(err) || '删除失败');
    }
  }

  if (loading || !config) {
    return (
      <div className="py-12 text-center">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      {/* 页面内顶栏操作按钮 — 匹配 iot-wfm EditView header extra */}
      <div
        className="flex items-center justify-between border-0 border-b border-solid border-gray-100 bg-white px-3 py-3"
      >
        <h3 className="m-0 text-base">{config.name || '设备配置'}</h3>
        <div className="flex gap-2">
          <Button
            icon={<SaveOutlined />}
            type="primary"
            onClick={() => { void saveRef.current(); }}
          >
            保存
          </Button>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- antd 支持 Promise */}
          <Popconfirm title="确认删除设备？不可恢复。" onConfirm={handleRemove}>
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button icon={<ArrowLeftOutlined />} onClick={() => { router.back(); }}>
            返回
          </Button>
        </div>
      </div>

      <DeviceEditor
        config={config}
        gpio={gpio}
        saveRef={saveRef}
        onRemove={handleRemove}
        onSave={async (data) => {
          try {
            await save(data);
            message.success('配置已保存');
          } catch (err: unknown) {
            // 错误已在 useDeviceConfig 中记日志，此处仅提示用户
            message.error(err instanceof Error ? err.message : String(err) || '保存失败');
          }
        }}
      />
    </div>
  );
}
