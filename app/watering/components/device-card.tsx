"use client";

import { Card, Tag, Button, Row, Col, message, Popconfirm } from "antd";
import {
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { setDeviceSwitch, removeDevice } from "../actions";
import type { DeviceItem } from "../types";

export function DeviceCard({
  device,
  onRefresh,
}: {
  device: DeviceItem;
  onRefresh: () => void;
}) {
  const router = useRouter();

  // 电压计算：使用分压公式 V_actual = V_sensor * (R1 + R2) / R2
  const rawVoltage = device.voltage?.sensor
    ? (device.state?.sensors?.[device.voltage.sensor] as number | undefined)
    : (device.state?.sensors?.voltage_0 as number | undefined);

  const voltage =
    typeof rawVoltage === "number"
      ? device.voltage && device.voltage.r1 > 0 && device.voltage.r2 > 0
        ? rawVoltage * ((device.voltage.r1 + device.voltage.r2) / device.voltage.r2)
        : rawVoltage
      : undefined;

  const processes = device.processes || [];

  /** 判断某流程是否正在执行 */
  function isExec(index: number): boolean {
    if (device.state?.switch === "on") {
      if (typeof device.state.index === "number") {
        return device.state.index === index;
      }
      return device.bootExec === index;
    }
    return false;
  }

  /** 点击执行/终止流程 */
  async function onClickSwitch(index: number) {
    try {
      if (isExec(index)) {
        // 关闭
        await setDeviceSwitch(device.chipId, "off", index);
        message.success(`已终止 ${processes[index].name}`);
      } else {
        // 打开
        await setDeviceSwitch(device.chipId, "on", index);
        message.success(`已执行 ${processes[index].name}`);
      }
      onRefresh();
    } catch (err: any) {
      message.error(err.message || "操作失败");
    }
  }

  /** 清除设备状态 */
  async function onClickClear() {
    try {
      await setDeviceSwitch(device.chipId, "off");
      message.success("已清除状态");
      onRefresh();
    } catch (err: any) {
      message.error(err.message || "清除失败");
    }
  }

  /** 删除设备 */
  async function handleRemove() {
    try {
      await removeDevice(device.chipId);
      message.success("设备已删除");
      onRefresh();
    } catch (err: any) {
      message.error(err.message || "删除失败");
    }
  }

  return (
    <Card
      size="small"
      title={device.name || `设备-${device.chipId}`}
      extra={
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button
            type="text"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() =>
              router.push(
                `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`
              )
            }
          >
            日志
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() =>
              router.push(
                `/watering/devices/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`
              )
            }
          >
            配置
          </Button>
          <Popconfirm title="确认清除设备状态？" onConfirm={onClickClear}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
          <Popconfirm title="确认删除设备？不可恢复。" onConfirm={handleRemove}>
            <Button type="text" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </div>
      }
      style={{ marginBottom: 12 }}
    >
      {/* 设备信息 — 1 行 2 列 */}
      <Row gutter={[8, 4]} style={{ marginBottom: 8 }}>
        <Col span={12}>
          <span style={{ color: "#999", fontSize: 12 }}>芯片: </span>
          <span style={{ fontSize: 13 }}>{device.chipId}</span>
        </Col>
        {voltage !== undefined ? (
          <Col span={12}>
            <span style={{ color: "#999", fontSize: 12 }}>电压: </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {voltage.toFixed(2)}V
            </span>
            {device.voltage && (
              <span style={{ fontSize: 10, color: "#bbb", marginLeft: 2 }}>
                (计算)
              </span>
            )}
          </Col>
        ) : (
          <Col span={12} />
        )}
        <Col span={12}>
          <span style={{ color: "#999", fontSize: 12 }}>网卡: </span>
          <span style={{ fontSize: 12 }}>{device.macAddress}</span>
        </Col>
        <Col span={12}>
          <span style={{ color: "#999", fontSize: 12 }}>状态: </span>
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

      {/* 流程快捷按钮 — 1 行 2 列，奇数个首项占整行 */}
      {processes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {(() => {
            const items: { idx: number; span: number }[] = [];
            if (processes.length % 2 === 1) {
              // 奇数个：第 1 个占整行
              items.push({ idx: 0, span: 24 });
              for (let i = 1; i < processes.length; i++) {
                items.push({ idx: i, span: 12 });
              }
            } else {
              // 偶数个：每行 2 个
              for (let i = 0; i < processes.length; i++) {
                items.push({ idx: i, span: 12 });
              }
            }
            const rows: { idx: number; span: number }[][] = [];
            let i = 0;
            while (i < items.length) {
              if (items[i].span === 24) {
                rows.push([items[i]]);
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
                  // 离线 或 待机（非运行中 + idleSleep）→ 禁用
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
                        onClick={() => onClickSwitch(idx)}
                      >
                        {exec ? "停止" : processes[idx].name}
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
