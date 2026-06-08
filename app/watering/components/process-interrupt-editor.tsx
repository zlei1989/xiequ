"use client";

import { Input, InputNumber, Switch, Select, Empty, Radio } from "antd";
import type { Interrupt } from "../types";
import type { GpioInfo } from "../hooks/use-device-config";

export function ProcessInterruptEditor({
  interrupt,
  gpio,
  onChange,
  onRemove,
}: {
  interrupt: Interrupt;
  gpio: GpioInfo;
  onChange: (updated: Interrupt) => void;
  onRemove: () => void;
}) {
  const sensorOptions = (gpio.sensors ?? []).map((k) => ({
    value: k,
    label: k,
  }));

  const signalType = interrupt.signalType ?? "digital";
  const logic = interrupt.logic ?? ">";
  const threshold = interrupt.threshold ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          中断名称
        </label>
        <Input
          value={interrupt.name}
          onChange={(e) => onChange({ ...interrupt, name: e.target.value })}
          placeholder="输入中断名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          传感器
        </label>
        {sensorOptions.length > 0 ? (
          <Select
            value={interrupt.component}
            onChange={(v) => onChange({ ...interrupt, component: v })}
            options={sensorOptions}
            style={{ width: "100%" }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="设备无可用传感器（sensors），请等待设备上报 GPIO 状态"
            style={{ margin: "8px 0" }}
          />
        )}
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          信号类型
        </label>
        <Radio.Group
          value={signalType}
          onChange={(e) =>
            onChange({
              ...interrupt,
              signalType: e.target.value,
            })
          }
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="digital">数字信号</Radio.Button>
          <Radio.Button value="analog">模拟信号</Radio.Button>
        </Radio.Group>
      </div>

      {/* 数字信号：显示触发状态开关 */}
      {signalType === "digital" && (
        <div>
          <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
            触发状态
          </label>
          <Switch
            checked={interrupt.state === 1 || interrupt.state === true}
            onChange={(checked) =>
              onChange({ ...interrupt, state: checked ? 1 : 0 })
            }
            checkedChildren="触发 (1)"
            unCheckedChildren="未触发 (0)"
          />
        </div>
      )}

      {/* 模拟信号：显示逻辑选择 + 触发阈值 */}
      {signalType === "analog" && (
        <>
          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              逻辑
            </label>
            <Radio.Group
              value={logic}
              onChange={(e) =>
                onChange({
                  ...interrupt,
                  logic: e.target.value,
                })
              }
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value=">">大于</Radio.Button>
              <Radio.Button value="<">小于</Radio.Button>
            </Radio.Group>
          </div>

          <div>
            <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
              触发阈值
            </label>
            <InputNumber
              value={threshold}
              onChange={(v) =>
                onChange({ ...interrupt, threshold: v ?? 0 })
              }
              min={0}
              step={1}
              style={{ width: "100%" }}
              placeholder="输入模拟信号触发阈值"
            />
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              当传感器值{logic === ">" ? "大于" : "小于"}阈值时触发中断
            </div>
          </div>
        </>
      )}

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          屏蔽抖动间隔（毫秒）
        </label>
        <InputNumber
          value={interrupt.intercept}
          onChange={(v) => onChange({ ...interrupt, intercept: v ?? 0 })}
          step={100}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          延迟检测（毫秒）
        </label>
        <InputNumber
          value={interrupt.delay}
          onChange={(v) => onChange({ ...interrupt, delay: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          持续时间（毫秒）
        </label>
        <InputNumber
          value={interrupt.duration}
          onChange={(v) => onChange({ ...interrupt, duration: v ?? 0 })}
          step={1000}
          min={0}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          禁用
        </label>
        <Switch
          checked={!interrupt.disabled}
          onChange={(checked) => onChange({ ...interrupt, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
