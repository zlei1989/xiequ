/**
 * 设备卡片组件 — 展示设备状态、在线信息、操作按钮（开关/配置/日志）
 *
 * 使用 antd-mobile Card/Tag/Button/Toast 替代 antd，
 * 集成 StepProgress 展示当前流程的步骤进度。
 */

'use client';

import { ActionSheet, Button, Card, Dialog, Tag, Toast } from 'antd-mobile';
import { SetOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { removeDevice, setDeviceSwitch } from '../actions';
import { calcSensorReadings } from '../utils/calc-sensor';

import { StepProgress } from './step-progress';

import type { DeviceItem } from '../types';

export function DeviceCard({
  device,
  onRefresh,
}: {
  device: DeviceItem;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [actionVisible, setActionVisible] = useState(false);

  /** ActionSheet 菜单分发 */
  function handleAction(action: { key: string | number }) {
    const key = String(action.key);
    switch (key) {
      case 'config':
        router.push(
          `/watering/devices/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
        );
        break;
      case 'clear':
        void onClickClear();
        break;
      case 'delete':
        void Dialog.confirm({
          title: '确认删除设备？',
          content: '不可恢复。',
          onConfirm: async () => {
            await handleRemove();
          },
        });
        break;
    }
  }

  const actions = [
    { key: 'config', text: '配置设备' },
    { key: 'clear', text: '清除状态' },
    { key: 'delete', text: '删除设备', danger: true },
  ];

  /** 传感器计算值 — 根据配置和原始读数生成展示数据 */
  const sensorReadings =
    device.sensors.length > 0
      ? calcSensorReadings(device.sensors, device.state?.sensors)
      : [];

  const processes = device.processes;

  /**
   * 判断某流程是否正在执行
   *
   * 逻辑：
   * 1. 设备必须处于 on 状态
   * 2. 若设备上报了 state.index（当前执行流程索引），则直接比对
   * 3. 否则对比 bootExec（设备上报的是开机自动执行），用于离线/心跳未携带 index 的场景
   */
  function isExec(index: number): boolean {
    if (device.state?.switch === 'on') {
      if (typeof device.state.index === 'number') {
        return device.state.index === index;
      }
      // 设备未上报 index 时，用 bootExec 作为判断依据
      return device.bootExec === index;
    }
    return false;
  }

  /**
   * 执行或终止指定流程
   *
   * 逻辑：若流程正在执行（isExec 返回 true）则发送 off 终止，
   * 否则发送 on 启动。操作后刷新设备列表以同步前端状态。
   */
  async function onClickSwitch(index: number) {
    try {
      if (isExec(index)) {
        // 关闭
        await setDeviceSwitch(device.chipId, 'off', index);
        Toast.show({
          content: `已终止 ${processes[index]?.name ?? '未知'}`,
          icon: 'success',
        });
      } else {
        // 打开
        await setDeviceSwitch(device.chipId, 'on', index);
        Toast.show({
          content: `已执行 ${processes[index]?.name ?? '未知'}`,
          icon: 'success',
        });
      }
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 切换流程失败 chipId=${device.chipId} process=${String(processes[index]?.name)}`,
        err,
      );
      Toast.show({
        content:
          err instanceof Error ? err.message : String(err) || '操作失败',
        icon: 'fail',
      });
    }
  }

  /** 清除设备状态（发送 off 指令） */
  async function onClickClear() {
    try {
      await setDeviceSwitch(device.chipId, 'off');
      Toast.show({ content: '已清除状态', icon: 'success' });
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 清除设备状态失败 chipId=${device.chipId}`,
        err,
      );
      Toast.show({
        content:
          err instanceof Error ? err.message : String(err) || '清除失败',
        icon: 'fail',
      });
    }
  }

  /** 删除设备（调用 removeDevice action，不可恢复） */
  async function handleRemove() {
    try {
      await removeDevice(device.chipId);
      Toast.show({ content: '设备已删除', icon: 'success' });
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 删除设备失败 chipId=${device.chipId}`,
        err,
      );
      Toast.show({
        content:
          err instanceof Error ? err.message : String(err) || '删除失败',
        icon: 'fail',
      });
    }
  }

  /**
   * 切换当前执行流程的步骤索引
   *
   * 仅在设备在线且 state.index 有效时执行，
   * 通过 setDeviceSwitch 下发 on + 流程索引 + 新步骤索引。
   */
  async function handleStepChange(newStepIndex: number) {
    if (!device.isOnline) return;
    const currentIndex = device.state?.index;
    if (typeof currentIndex !== 'number') return;
    try {
      await setDeviceSwitch(
        device.chipId,
        'on',
        currentIndex,
        newStepIndex,
      );
      Toast.show({
        content: `已切换至步骤 ${newStepIndex + 1}`,
        icon: 'success',
      });
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 步骤切换失败 chipId=${device.chipId} stepIndex=${newStepIndex}`,
        err,
      );
      Toast.show({
        content:
          err instanceof Error ? err.message : String(err) || '切换失败',
        icon: 'fail',
      });
    }
  }

  return (
    <>
      <Card
        extra={
          <div className="flex items-center gap-1">
            <Button
              fill="none"
              size="small"
              onClick={() => {
                router.push(
                  `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
                );
              }}
            >
              日志
            </Button>
            <Button
              fill="none"
              size="small"
              onClick={() => {
                setActionVisible(true);
              }}
            >
              <SetOutline />
              选项
            </Button>
          </div>
        }
        title={device.name || `设备-${device.chipId}`}
      >
        {/* 设备信息 — 1 行 2 列，使用 Tailwind grid 替代 antd Row/Col */}
        <div className="mb-2 grid grid-cols-2 gap-x-2 gap-y-1">
          <div>
            <span className="text-xs text-gray-400">芯片: </span>
            <span className="text-[13px]">{device.chipId}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400">状态: </span>
            {device.isOnline ? (
              <Tag className="m-0" color="success">
                在线
              </Tag>
            ) : (
              <Tag className="m-0" color="default">
                离线
              </Tag>
            )}
          </div>
          <div>
            <span className="text-xs text-gray-400">网卡: </span>
            <span className="text-xs">{device.macAddress}</span>
          </div>
          {/* 传感器展示 — 设备信息区下方 */}
          {sensorReadings.length > 0 &&
            sensorReadings.map((reading, idx) => {
              const config = device.sensors[idx];
              if (!config) return null;

              // 根据类型格式化显示值
              const displayValue = (() => {
                if (config.type === 'digital') {
                  return reading.value > 0 ? '高电平' : '低电平';
                }
                if (config.conversion === 'resistor_divider') {
                  return `${reading.value.toFixed(2)}V`;
                }
                if (config.conversion === 'ntc_10k') {
                  return `${reading.value.toFixed(1)}°C`;
                }
                // 模拟信号无转换 — 显示 ADC 原始值
                return String(reading.value);
              })();

              return (
                <div className="flex items-center" key={`${config.sensor}-${idx}`}>
                  <span className="text-xs text-gray-400">{config.name}:</span>
                  <span className="text-[13px] font-medium">
                    {typeof reading.value === 'number' ? displayValue : '—'}
                  </span>
                </div>
              );
            })}
        </div>

        {/*
         * 流程快捷按钮网格
         *
         * 布局算法：
         * - 偶数个流程：每行 2 列（flex-wrap，各占 50% 宽度）
         * - 奇数个流程：第 1 个占整行（100%），其余每行 2 列
         *
         * 按钮禁用条件：
         * 1. 设备离线 → 所有按钮不可用
         * 2. 设备开启了 idleSleep 且该流程未在执行 → 设备待机省电，不接受实时控制
         */}
        {processes.length > 0 && (
          <div className="mt-2">
            {(() => {
              // 计算每个按钮的栅格宽度
              const items: { idx: number; fullWidth: boolean }[] = [];
              if (processes.length % 2 === 1) {
                items.push({ idx: 0, fullWidth: true });
                for (let i = 1; i < processes.length; i++) {
                  items.push({ idx: i, fullWidth: false });
                }
              } else {
                for (let i = 0; i < processes.length; i++) {
                  items.push({ idx: i, fullWidth: false });
                }
              }
              // 将 items 按行分组：fullWidth 独占一行，否则两个一组
              const rows: { idx: number; fullWidth: boolean }[][] = [];
              let i = 0;
              while (i < items.length) {
                const item = items[i];
                if (!item) break;
                if (item.fullWidth) {
                  rows.push([item]);
                  i++;
                } else {
                  rows.push(items.slice(i, i + 2));
                  i += 2;
                }
              }
              return rows.map((row, rowIdx) => (
                <div className="mb-1 flex gap-2" key={rowIdx}>
                  {row.map(({ idx, fullWidth }) => {
                    const exec = isExec(idx);
                    // idleSleep 模式下仅允许终止正在执行的流程
                    const disabled =
                      !device.isOnline ||
                      (!exec && device.idleSleep);
                    return (
                      <Button
                        block
                        className={fullWidth ? 'flex-[2]' : 'flex-1'}
                        color={exec ? 'danger' : 'primary'}
                        disabled={disabled}
                        key={idx}
                        size="small"
                        onClick={() => {
                          void onClickSwitch(idx);
                        }}
                      >
                        {exec ? '停止' : (processes[idx]?.name ?? '')}
                      </Button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}

        {/* 步骤进度 — 设备运行且当前流程有步骤配置时展示 */}
        {device.state?.switch === 'on' && device.state.process && (
          <StepProgress
            running
            online={!!device.isOnline}
            stepIndex={device.state.stepIndex}
            steps={device.state.process.steps}
            onNext={() => {
              const idx = device.state?.stepIndex;
              if (typeof idx === 'number') {
                void handleStepChange(idx + 1);
              }
            }}
            onPrev={() => {
              const idx = device.state?.stepIndex;
              if (typeof idx === 'number' && idx > 0) {
                void handleStepChange(idx - 1);
              }
            }}
          />
        )}
      </Card>

      <ActionSheet
        closeOnAction
        safeArea
        actions={actions}
        cancelText="取消"
        visible={actionVisible}
        onAction={handleAction}
        onClose={() => {
          setActionVisible(false);
        }}
      />
    </>
  );
}
