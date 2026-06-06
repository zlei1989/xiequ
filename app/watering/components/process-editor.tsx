"use client";

import { Input, Button, Table } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import type { Process, Step } from "../types";

export function ProcessEditor({
  process,
  onChange,
  onRemove,
  onEditStep,
  onAddStep,
}: {
  process: Process;
  onChange: (updated: Process) => void;
  onRemove: () => void;
  onEditStep: (index: number) => void;
  onAddStep: () => void;
}) {
  const columns = [
    { title: "#", dataIndex: "_idx", width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "组件", dataIndex: "component", key: "component" },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_: any, record: Step, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEditStep(index)}
        />
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          功能名称
        </label>
        <Input
          value={process.name}
          onChange={(e) => onChange({ ...process, name: e.target.value })}
          placeholder="输入流程名称"
        />
      </div>

      <div>
        <label style={{ fontSize: 13, color: "#666", marginBottom: 4, display: "block" }}>
          步骤
        </label>
        <Table
          dataSource={process.steps}
          columns={columns}
          rowKey={(_, index) => String(index)}
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={onAddStep}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>
    </div>
  );
}
