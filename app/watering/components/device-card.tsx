/**
 * 设备卡片组件 — 展示设备状态、在线信息、操作按钮（开关/配置/日志）
 */

'use client';

import {
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Card, Tag, Button, Row, Col, message, Popconfirm } from 'antd';
import { useRouter } from 'next/navigation';

import { setDeviceSwitch, removeDevice } from '../actions';

import type { DeviceItem } from '../types';

export function DeviceCard({
  device,
  onRefresh,
}: {
  device: DeviceItem;
  onRefresh: () => void;
}) {
  const router = useRouter();

  /**
   * 电压计算
   *
   * 先从 sensors 中取原始 ADC 读数：
   * - 若配置了 voltage.sensor 则取对应引脚的传感器值
   * - 否则回退到 voltage_0 引脚
   *
   * 分压公式：V_actual = V_sensor × (R1 + R2) / R2
   * 仅在配置了分压电阻且 R1、R2 均 >0 时应用分压比修正；
   * 否则直接使用原始 ADC 读数（假设无分压电路）。
   */
  const rawVoltage = device.voltage?.sensor
    ? (device.state?.sensors?.[device.voltage.sensor])
    : (device.state?.sensors?.voltage_0);

  const voltage =
    typeof rawVoltage === 'number'
      ? device.voltage && device.voltage.r1 > 0 && device.voltage.r2 > 0
        ? rawVoltage * ((device.voltage.r1 + device.voltage.r2) / device.voltage.r2)
        : rawVoltage
      : undefined;

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
        message.success(`已终止 ${processes[index]?.name ?? '未知'}`);
      } else {
        // 打开
        await setDeviceSwitch(device.chipId, 'on', index);
        message.success(`已执行 ${processes[index]?.name ?? '未知'}`);
      }
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 切换流程失败 chipId=${device.chipId} process=${String(processes[index]?.name)}`,
        err,
      );
      message.error(err instanceof Error ? err.message : String(err) || '操作失败');
    }
  }

  /** 清除设备状态（发送 off 指令） */
  async function onClickClear() {
    try {
      await setDeviceSwitch(device.chipId, 'off');
      message.success('已清除状态');
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 清除设备状态失败 chipId=${device.chipId}`,
        err,
      );
      message.error(err instanceof Error ? err.message : String(err) || '清除失败');
    }
  }

  /** 删除设备（调用 removeDevice action，不可恢复） */
  async function handleRemove() {
    try {
      await removeDevice(device.chipId);
      message.success('设备已删除');
      onRefresh();
    } catch (err: unknown) {
      console.error(
        `[DeviceCard] 删除设备失败 chipId=${device.chipId}`,
        err,
      );
      message.error(err instanceof Error ? err.message : String(err) || '删除失败');
    }
  }

  return (
    <Card
      size="small"
      title={device.name || `设备-${device.chipId}`}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() =>
            { router.push(
              `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
            ); }
            }
          >
            日志
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() =>
            { router.push(
              `/watering/devices/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
            ); }
            }
          >
            配置
          </Button>
          {/* eslint-disable @typescript-eslint/no-misused-promises -- antd 支持 Promise */}
          <Popconfirm title="确认清除设备状态？" onConfirm={onClickClear}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
          <Popconfirm title="确认删除设备？不可恢复。" onConfirm={handleRemove}>
            <Button type="text" size="small" danger>
              删除
            </Button>
          </Popconfirm>
          {/* eslint-enable @typescript-eslint/no-misused-promises */}
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      {/* 设备信息 — 1 行 2 列 */}
      <Row gutter={[8, 4]} style={{ marginBottom: 8 }}>
        <Col span={12}>
          <span style={{ color: '#999', fontSize: 12 }}>芯片: </span>
          <span style={{ fontSize: 13 }}>{device.chipId}</span>
        </Col>
        {voltage !== undefined ? (
          <Col span={12}>
            <span style={{ color: '#999', fontSize: 12 }}>电压: </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {voltage.toFixed(2)}V
            </span>
            {device.voltage && (
              <span style={{ fontSize: 10, color: '#bbb', marginLeft: 2 }}>
                (计算)
              </span>
            )}
          </Col>
        ) : (
          <Col span={12} />
        )}
        <Col span={12}>
          <span style={{ color: '#999', fontSize: 12 }}>网卡: </span>
          <span style={{ fontSize: 12 }}>{device.macAddress}</span>
        </Col>
        <Col span={12}>
          <span style={{ color: '#999', fontSize: 12 }}>状态: </span>
          {device.isOnline ? (
            <Tag color="green" style={{ margin: 0 }}>
              在线
            </Tag>
          ) : (
            <Tag color="default" style={{ margin: 0 }}>
              离线
            </Tag>
          )}
        </Col>
      </Row>

      {/*
         * 流程快捷按钮网格
         *
         * 布局算法：
         * - 偶数个流程：每行 2 列（span=12）
         * - 奇数个流程：第 1 个占整行（span=24），其余每行 2 列
         *
         * 按钮禁用条件：
         * 1. 设备离线 → 所有按钮不可用
         * 2. 设备开启了 idleSleep 且该流程未在执行 → 设备待机省电，不接受实时控制
         */}
      {processes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {(() => {
            // 计算每个按钮的栅格宽度
            const items: { idx: number; span: number }[] = [];
            if (processes.length % 2 === 1) {
              items.push({ idx: 0, span: 24 });
              for (let i = 1; i < processes.length; i++) {
                items.push({ idx: i, span: 12 });
              }
            } else {
              for (let i = 0; i < processes.length; i++) {
                items.push({ idx: i, span: 12 });
              }
            }
            // 将 items 按行分组：span=24 独占一行，否则两个一组
            const rows: { idx: number; span: number }[][] = [];
            let i = 0;
            while (i < items.length) {
              const item = items[i];
              if (!item) break;
              if (item.span === 24) {
                rows.push([item]);
                i++;
              } else {
                rows.push(items.slice(i, i + 2));
                i += 2;
              }
            }
            return rows.map((row, rowIdx) => (
              <Row gutter={8} key={rowIdx} style={{ marginBottom: 4 }}>
                {row.map(({ idx, span }) => {
                  const exec = isExec(idx);
                  // idleSleep 模式下仅允许终止正在执行的流程
                  const disabled = !device.isOnline || (!exec && !!device.idleSleep);
                  return (
                    <Col span={span} key={idx}>
                      <Button
                        type="primary"
                        danger={exec}
                        disabled={disabled}
                        block
                        size="small"
                        icon={
                          exec ? (
                            <PauseCircleOutlined />
                          ) : (
                            <ThunderboltOutlined />
                          )
                        }
                        onClick={() => { void onClickSwitch(idx); }}
                      >
                        {exec ? '停止' : processes[idx]?.name ?? ''}
                      </Button>
                    </Col>
                  );
                })}
              </Row>
            ));
          })()}
        </div>
      )}

    </Card>
  );
}
