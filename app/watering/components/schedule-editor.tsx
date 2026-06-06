"use client";

import { Select, InputNumber, Switch, Button, Card, Space } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Schedule } from "../types";

type Process = { name: string };

export function ScheduleEditor({
  schedules,
  processes,
  onChange,
}: {
  schedules: Schedule[];
  processes: Process[];
  onChange: (updated: Schedule[]) => void;
}) {
  function updateSchedule(index: number, updated: Schedule) {
    const newSchedules = [...schedules];
    newSchedules[index] = updated;
    onChange(newSchedules);
  }

  function addSchedule() {
    onChange([...schedules, { type: "day", value: 0, interval: 1, process: 0 }]);
  }

  function removeSchedule(index: number) {
    onChange(schedules.filter((_, i) => i !== index));
  }

  return (
    <div>
      {schedules.map((schedule, i) => (
        <Card size="small" key={i} style={{ marginBottom: 8 }}>
          <Space>
            <Select
              value={schedule.type}
              onChange={(v) => updateSchedule(i, { ...schedule, type: v })}
              style={{ width: 100 }}
              options={[
                { value: "minute", label: "每分钟" },
                { value: "day", label: "每天" },
                { value: "week", label: "每周" },
                { value: "month", label: "每月" },
              ]}
            />
            <InputNumber
              placeholder="时间值"
              value={schedule.value}
              onChange={(v) => updateSchedule(i, { ...schedule, value: v ?? 0 })}
              style={{ width: 120 }}
            />
            <InputNumber
              placeholder="间隔"
              value={schedule.interval}
              onChange={(v) => updateSchedule(i, { ...schedule, interval: v ?? 1 })}
              min={1}
              style={{ width: 80 }}
            />
            <Select
              value={schedule.process}
              onChange={(v) => updateSchedule(i, { ...schedule, process: v })}
              style={{ width: 150 }}
              options={processes.map((p, idx) => ({ value: idx, label: p.name || `流程 ${idx}` }))}
            />
            <Switch
              checkedChildren="启用"
              unCheckedChildren="禁用"
              checked={!schedule.disabled}
              onChange={(checked) => updateSchedule(i, { ...schedule, disabled: !checked })}
            />
            <Button icon={<DeleteOutlined />} danger onClick={() => removeSchedule(i)} />
          </Space>
        </Card>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={addSchedule}>
        添加定时任务
      </Button>
    </div>
  );
}
