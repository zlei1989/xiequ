"use client";

import { useState } from "react";
import { Input, InputNumber, Switch, Button, Tabs, message, Popconfirm } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import type { DeviceConfig } from "../types";
import { ProcessEditor } from "./process-editor";
import { ScheduleEditor } from "./schedule-editor";

export function DeviceEditor({
  config,
  onSave,
  onRemove,
}: {
  config: DeviceConfig;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [form, setForm] = useState<DeviceConfig>(config);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        idleSleep: form.idleSleep,
        idleTimeout: form.idleTimeout,
        bootExec: form.bootExec,
        execDelay: form.execDelay,
        processes: form.processes,
        schedules: form.schedules,
      });
      message.success("保存成功");
    } catch (err: any) {
      message.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function updateProcesses(processes: DeviceConfig["processes"]) {
    setForm({ ...form, processes });
  }

  function addProcess() {
    setForm({ ...form, processes: [...form.processes, { name: "", steps: [] }] });
  }

  function updateProcess(index: number, updated: DeviceConfig["processes"][0]) {
    const newProcesses = [...form.processes];
    newProcesses[index] = updated;
    setForm({ ...form, processes: newProcesses });
  }

  function removeProcess(index: number) {
    setForm({ ...form, processes: form.processes.filter((_, i) => i !== index) });
  }

  const tabItems = [
    {
      key: "basic",
      label: "基本设置",
      children: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
          <Input
            placeholder="设备名称"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>空闲睡眠</span>
            <Switch checked={form.idleSleep} onChange={(v) => setForm({ ...form, idleSleep: v })} />
          </div>
          <InputNumber
            addonBefore="空闲超时(ms)"
            value={form.idleTimeout}
            onChange={(v) => setForm({ ...form, idleTimeout: v ?? 30000 })}
            style={{ width: "100%" }}
          />
          <InputNumber
            addonBefore="开机执行"
            value={form.bootExec}
            onChange={(v) => setForm({ ...form, bootExec: v ?? -1 })}
            style={{ width: "100%" }}
          />
          <InputNumber
            addonBefore="延迟执行(ms)"
            value={form.execDelay}
            onChange={(v) => setForm({ ...form, execDelay: v ?? 0 })}
            style={{ width: "100%" }}
          />
        </div>
      ),
    },
    {
      key: "processes",
      label: "流程设定",
      children: (
        <div>
          {form.processes.map((process, i) => (
            <ProcessEditor
              key={i}
              process={process}
              onChange={(updated) => updateProcess(i, updated)}
              onRemove={() => removeProcess(i)}
            />
          ))}
          <Button type="dashed" onClick={addProcess} block>
            添加流程
          </Button>
        </div>
      ),
    },
    {
      key: "schedules",
      label: "定时任务",
      children: (
        <ScheduleEditor
          schedules={form.schedules}
          processes={form.processes}
          onChange={(schedules) => setForm({ ...form, schedules })}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={saving}>
          保存
        </Button>
        <Popconfirm title="确认删除设备？" onConfirm={onRemove}>
          <Button danger>删除设备</Button>
        </Popconfirm>
      </div>
      <Tabs items={tabItems} />
    </div>
  );
}
