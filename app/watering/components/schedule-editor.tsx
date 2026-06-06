"use client";

import { Select, InputNumber, Switch, TimePicker } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
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
  const schedule = schedules[0];
  if (!schedule) return null;

  function update(updated: Schedule) {
    onChange([updated]);
  }

  // 毫秒值 → dayjs 时刻（仅时间部分）
  const timeValue = dayjs()
    .startOf("day")
    .add(schedule.value || 0, "millisecond");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          类型
        </label>
        <Select
          value={schedule.type}
          onChange={(v) => update({ ...schedule, type: v })}
          options={[
            { value: "day", label: "每天" },
            { value: "minute", label: "每分钟" },
            { value: "week", label: "每周" },
            { value: "month", label: "每月" },
          ]}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          间隔（天）
        </label>
        <InputNumber
          value={schedule.interval}
          onChange={(v) => update({ ...schedule, interval: v ?? 1 })}
          step={1}
          min={1}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          时间
        </label>
        <TimePicker
          value={timeValue}
          onChange={(d: Dayjs | null) => {
            if (d) {
              const ms = d.diff(dayjs().startOf("day"), "millisecond");
              update({ ...schedule, value: ms });
            }
          }}
          format="HH:mm"
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          执行流程
        </label>
        <Select
          value={schedule.process}
          onChange={(v) => update({ ...schedule, process: v })}
          options={processes.map((p, i) => ({
            value: i,
            label: p.name || `流程 ${i}`,
          }))}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          禁用
        </label>
        <Switch
          checked={!schedule.disabled}
          onChange={(checked) => update({ ...schedule, disabled: !checked })}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      </div>
    </div>
  );
}
