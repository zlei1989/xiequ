/**
 * 设备编辑器 — 设备配置的完整编辑界面，包含流程/步骤/中断/定时/电压等子编辑器
 *
 * 嵌套 Drawer 编排模式：
 * 设备编辑 → 打开流程 Drawer → 打开步骤 Drawer → 打开中断 Drawer
 * 最内层 Drawer 约 70% 高度，外层依次递增（75%/80%），形成视觉层次。
 * 通过 processIndex / stepIndex / interruptIndex / scheduleIndex 四级索引串联
 * 每一层的操作（增/删/改）向上冒泡到 DeviceEditor 统一修改 form state。
 */

'use client';

import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CloseOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Input,
  InputNumber,
  Switch,
  Button,
  Table,
  Drawer,
  Popconfirm,
  message,
  Space,
} from 'antd';
import { useState, useEffect } from 'react';

import { ProcessEditor } from './process-editor';
import { ProcessInterruptEditor } from './process-interrupt-editor';
import { ProcessStepEditor } from './process-step-editor';
import { ScheduleEditor } from './schedule-editor';
import { VoltageConfigDrawer } from './voltage-config-drawer';

import type { GpioInfo } from '../hooks/use-device-config';
import type { DeviceConfig, Process, Step, Interrupt, Schedule } from '../types';

export function DeviceEditor({
  config,
  gpio,
  onSave,
  onRemove,
  saveRef,
}: {
  config: DeviceConfig;
  gpio: GpioInfo;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
  saveRef: React.MutableRefObject<() => Promise<void>>;
}) {
  const [form, setForm] = useState<DeviceConfig>(config);
  const [saving, setSaving] = useState(false);

  // 将 handleSave 暴露给父组件 Header 的保存按钮
  useEffect(() => {
    saveRef.current = handleSave;
  });

  // ---- 嵌套 Drawer 状态（匹配 IotEditor 的 visible refs）----
  const [processVisible, setProcessVisible] = useState(false);
  const [processIndex, setProcessIndex] = useState(-1);

  const [stepVisible, setStepVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const [interruptVisible, setInterruptVisible] = useState(false);
  const [interruptIndex, setInterruptIndex] = useState(-1);

  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [scheduleIndex, setScheduleIndex] = useState(-1);

  const [voltageVisible, setVoltageConfigVisible] = useState(false);

  // ---- 保存 ----
  /**
   * 提交设备配置变更
   *
   * 仅提交表单中可编辑的字段（name/idleSleep/processes/schedules/voltage 等），
   * 芯片ID/macAddress 等不可变字段由父组件在 onSave 中合并。
   */
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
        voltage: form.voltage,
      });
      message.success('保存成功');
    } catch (err: any) {
      console.error(
        `[DeviceEditor] 保存设备配置失败 chipId=${form.chipId}`,
        err,
      );
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  // ---- 流程操作 ----
  function addProcess() {
    const item: Process = {
      key: crypto.randomUUID(),
      name: '新流程',
      steps: [
        {
          key: crypto.randomUUID(),
          name: '新步骤',
          component: gpio.loads[0] ?? 'load_0',
          value: { begin: 255, end: 0 },
          timeout: 600000,
          interrupts: [],
        },
      ],
    };
    const newProcesses = [...form.processes, item];
    setForm({ ...form, processes: newProcesses });
    // 自动打开编辑
    setProcessIndex(newProcesses.length - 1);
    setProcessVisible(true);
  }

  function updateProcess(index: number, updated: Process) {
    const newProcesses = [...form.processes];
    newProcesses[index] = updated;
    setForm({ ...form, processes: newProcesses });
  }

  function deleteProcess() {
    const newProcesses = form.processes.filter((_, i) => i !== processIndex);
    setForm({ ...form, processes: newProcesses });
    setProcessVisible(false);
    setProcessIndex(-1);
  }

  // ---- 步骤操作 ----
  function addStep() {
    const proc = { ...form.processes[processIndex] };
    const item: Step = {
      key: crypto.randomUUID(),
      name: '新步骤',
      component: gpio.loads[0] ?? 'load_0',
      value: { begin: 0, end: 0 },
      timeout: 600000,
      interrupts: [],
    };
    proc.steps = [...proc.steps, item];
    updateProcess(processIndex, proc);
    setStepIndex(proc.steps.length - 1);
    setStepVisible(true);
  }

  function updateStep(index: number, updated: Step) {
    const proc = { ...form.processes[processIndex] };
    const newSteps = [...proc.steps];
    newSteps[index] = updated;
    proc.steps = newSteps;
    updateProcess(processIndex, proc);
  }

  function deleteStep() {
    const proc = { ...form.processes[processIndex] };
    proc.steps = proc.steps.filter((_, i) => i !== stepIndex);
    updateProcess(processIndex, proc);
    setStepVisible(false);
    setStepIndex(-1);
  }

  // ---- 中断操作 ----
  /**
   * 向当前流程-步骤下新增中断条件
   *
   * 三层嵌套 CRUD（流程→步骤→中断）：先通过 processIndex/stepIndex 定位目标步骤，
   * 克隆修改后向上冒泡至 updateProcess → setForm，避免直接 mutate state。
   */
  function addInterrupt() {
    const item: Interrupt = {
      key: crypto.randomUUID(),
      name: '新中断',
      component: gpio.sensors[0] ?? 'sensor_0',
      state: 0,
      signalType: 'digital',   // 默认数字信号
      logic: '>',              // 默认大于
      threshold: 0,            // 默认阈值 0
      intercept: 100,
      delay: 0,
      duration: 0,
    };
    const proc = { ...form.processes[processIndex] };
    const step = { ...proc.steps[stepIndex] };
    step.interrupts = [...(step.interrupts || []), item];
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
    setInterruptIndex((step.interrupts || []).length - 1);
    setInterruptVisible(true);
  }

  function updateInterrupt(index: number, updated: Interrupt) {
    const proc = { ...form.processes[processIndex] };
    const step = { ...proc.steps[stepIndex] };
    const newInterrupts = [...(step.interrupts || [])];
    newInterrupts[index] = updated;
    step.interrupts = newInterrupts;
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
  }

  function deleteInterrupt() {
    const proc = { ...form.processes[processIndex] };
    const step = { ...proc.steps[stepIndex] };
    step.interrupts = (step.interrupts || []).filter((_, i) => i !== interruptIndex);
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
    setInterruptVisible(false);
    setInterruptIndex(-1);
  }

  // ---- 定时操作 ----
  function addSchedule() {
    const item: Schedule = {
      key: crypto.randomUUID(),
      type: 'day',
      value: 8 * 3600 * 1000,
      interval: 1,
      process: 0,
    };
    const newSchedules = [...form.schedules, item];
    setForm({ ...form, schedules: newSchedules });
    setScheduleIndex(newSchedules.length - 1);
    setScheduleVisible(true);
  }

  function updateSchedule(index: number, updated: Schedule) {
    const newSchedules = [...form.schedules];
    newSchedules[index] = updated;
    setForm({ ...form, schedules: newSchedules });
  }

  function deleteSchedule() {
    const newSchedules = form.schedules.filter((_, i) => i !== scheduleIndex);
    setForm({ ...form, schedules: newSchedules });
    setScheduleVisible(false);
    setScheduleIndex(-1);
  }

  // ---- 流程表格列 ----
  const processColumns = [
    { title: '#', dataIndex: '_idx', width: 40, render: (_: any, __: any, index: number) => index + 1 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, record: Process, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setProcessIndex(index);
            setProcessVisible(true);
          }}
        />
      ),
    },
  ];

  // ---- 定时表格列 ----
  const scheduleColumns = [
    { title: '#', dataIndex: '_idx', width: 40, render: (_: any, __: any, index: number) => index + 1 },
    {
      title: '时间',
      key: 'time',
      render: (_: any, record: Schedule) => {
        if (record.type === 'day') {
          // value 存的是距 00:00 的毫秒数，转为 HH:mm 显示
          const h = Math.floor(record.value / 3600000);
          const m = Math.floor((record.value % 3600000) / 60000);
          return `每天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
        return `${record.type} ${record.value}`;
      },
    },
    { title: '间隔', dataIndex: 'interval', key: 'interval' },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, record: Schedule, index: number) => (
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setScheduleIndex(index);
            setScheduleVisible(true);
          }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '0 16px' }}>
      {/* ---- 基本设置表单（匹配 IeForm）---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
            设备名称
          </label>
          <Input
            value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); }}
            placeholder="输入设备名称"
          />
        </div>

        <div>
          <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
            空闲睡眠
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch
              checked={form.idleSleep}
              onChange={(v) => { setForm({ ...form, idleSleep: v }); }}
            />
            <span style={{ fontSize: 12, color: '#999' }}>
              {form.idleSleep ? '设备将不接受实时控制，仅执行计划任务，达到省电目的' : ''}
            </span>
          </div>
        </div>

        {form.idleSleep && (
          <div>
            <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
              空闲超时（毫秒）
            </label>
            <InputNumber
              value={form.idleTimeout}
              onChange={(v) => { setForm({ ...form, idleTimeout: v ?? 30000 }); }}
              step={1000}
              min={0}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
            开机执行
          </label>
          <select
            value={form.bootExec}
            onChange={(e) =>
            { setForm({ ...form, bootExec: Number(e.target.value) }); }
            }
            style={{ width: '100%', padding: '4px 8px', fontSize: 14, borderRadius: 6, border: '1px solid #d9d9d9' }}
          >
            <option value={-1}>无</option>
            {form.processes.map((p, i) => (
              <option key={i} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
            延迟执行（毫秒）
          </label>
          <InputNumber
            value={form.execDelay}
            onChange={(v) => { setForm({ ...form, execDelay: v ?? 0 }); }}
            step={1000}
            min={0}
            disabled={form.bootExec < 0}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* ---- 电压检测配置 ---- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          padding: '8px 12px',
          background: '#fafafa',
          borderRadius: 6,
          border: '1px solid #f0f0f0',
        }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>电压检测配置</span>
          {form.voltage ? (
            <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
              {form.voltage.sensor} · R1={form.voltage.r1}Ω · R2={form.voltage.r2}Ω
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>
              未配置
            </span>
          )}
        </div>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => { setVoltageConfigVisible(true); }}
        >
          {form.voltage ? '修改' : '配置'}
        </Button>
      </div>

      {/* ---- 流程表格（匹配 IeForm 的流程 el-table）---- */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>功能</h4>
        <Table
          dataSource={form.processes}
          columns={processColumns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addProcess}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>

      {/* ---- 定时表格（匹配 IeForm 的定时 el-table）---- */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>计划任务</h4>
        <Table
          dataSource={form.schedules}
          columns={scheduleColumns}
          rowKey="key"
          pagination={false}
          size="small"
          bordered
        />
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addSchedule}
          block
          style={{ marginTop: 8 }}
        >
          添加
        </Button>
      </div>

      {/* ============================================
          嵌套 Drawer 层（匹配 IotEditor 的嵌套 el-drawer）
          ============================================ */}

      {/* 流程编辑 Drawer (80%) */}
      <Drawer
        title="编辑流程"
        placement="bottom"
        size="80%"
        open={processVisible}
        onClose={() => { setProcessVisible(false); }}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此流程？" onConfirm={deleteProcess}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setProcessVisible(false); }}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {processIndex > -1 && (
          <ProcessEditor
            process={form.processes[processIndex]}
            gpio={gpio}
            onChange={(updated) => { updateProcess(processIndex, updated); }}
            onRemove={deleteProcess}
            onEditStep={(stepIdx) => {
              setStepIndex(stepIdx);
              setStepVisible(true);
            }}
            onAddStep={addStep}
          />
        )}
      </Drawer>

      {/* 步骤编辑 Drawer (75%) */}
      <Drawer
        title="编辑步骤"
        placement="bottom"
        size="75%"
        open={stepVisible}
        onClose={() => { setStepVisible(false); }}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此步骤？" onConfirm={deleteStep}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setStepVisible(false); }}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {stepIndex > -1 && processIndex > -1 && (
          <ProcessStepEditor
            step={form.processes[processIndex].steps[stepIndex]}
            gpio={gpio}
            onChange={(updated) => { updateStep(stepIndex, updated); }}
            onRemove={deleteStep}
            onEditInterrupt={(intIdx) => {
              setInterruptIndex(intIdx);
              setInterruptVisible(true);
            }}
            onAddInterrupt={addInterrupt}
          />
        )}
      </Drawer>

      {/* 中断编辑 Drawer (70%) */}
      <Drawer
        title="编辑中断"
        placement="bottom"
        size="70%"
        open={interruptVisible}
        onClose={() => { setInterruptVisible(false); }}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此中断？" onConfirm={deleteInterrupt}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setInterruptVisible(false); }}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {interruptIndex > -1 &&
          stepIndex > -1 &&
          processIndex > -1 &&
          form.processes[processIndex].steps[stepIndex].interrupts && (
          <ProcessInterruptEditor
            interrupt={
              form.processes[processIndex].steps[stepIndex].interrupts[
                interruptIndex
              ]
            }
            gpio={gpio}
            onChange={(updated) => { updateInterrupt(interruptIndex, updated); }}
            onRemove={deleteInterrupt}
          />
        )}
      </Drawer>

      {/* 定时编辑 Drawer (70%) */}
      <Drawer
        title="编辑定时任务"
        placement="bottom"
        size="70%"
        open={scheduleVisible}
        onClose={() => { setScheduleVisible(false); }}
        destroyOnClose
        extra={
          <Space>
            <Popconfirm title="确认删除此定时任务？" onConfirm={deleteSchedule}>
              <Button icon={<DeleteOutlined />} danger size="small">
                删除
              </Button>
            </Popconfirm>
            <Button
              icon={<CloseOutlined />}
              onClick={() => { setScheduleVisible(false); }}
              size="small"
            >
              关闭
            </Button>
          </Space>
        }
      >
        {scheduleIndex > -1 && (
          <ScheduleEditor
            schedules={[form.schedules[scheduleIndex]]}
            processes={form.processes}
            onChange={(updated) => {
              if (updated.length > 0) {
                updateSchedule(scheduleIndex, updated[0]);
              }
            }}
          />
        )}
      </Drawer>

      {/* 电压检测配置 Drawer (60%) */}
      <VoltageConfigDrawer
        open={voltageVisible}
        voltage={form.voltage}
        sensors={gpio.sensors}
        onChange={(vc) => { setForm({ ...form, voltage: vc }); }}
        onClose={() => { setVoltageConfigVisible(false); }}
      />
    </div>
  );
}
