/**
 * 设备编辑器 — 主编辑器，管理设备基本设置、流程、步骤、中断、定时任务的 CRUD
 *
 * 使用 antd-mobile Popup + NavBar + List 构建移动端界面。
 * 通过 saveRef 将 handleSave 暴露给父组件 Header 的保存按钮。
 * 5 层嵌套 Popup（设备→流程→步骤→中断 + 定时 + 电压），
 * 均接入 useBackButton 返回键栈支持。
 */

'use client';

import {
  Input,
  Stepper,
  Switch,
  Button,
  List,
  Popup,
  NavBar,
  Dialog,
  Toast,
  Picker,
  Selector,
  ErrorBlock,
  SwipeAction,
} from 'antd-mobile';
import {
  AddOutline,
  DeleteOutline,
} from 'antd-mobile-icons';
import { useState, useEffect } from 'react';

import { useBackButton } from '@/lib/back-button';

import { InterruptConfigPicker } from './interrupt-config-picker';
import { ProcessConfigPicker } from './process-config-picker';
import { ScheduleEditor } from './schedule-editor';
import { StepConfigPicker } from './step-config-picker';

import type { GpioInfo } from '../hooks/use-device-config';
import type { DeviceConfig, ProcessConfig, StepConfig, InterruptConfig, ScheduleConfig, VoltageConfig } from '../types';

/** 带 key 的扩展类型（运行时由 crypto.randomUUID() 生成，不存入数据库，仅供 antd Table rowKey 使用） */
interface WithKey { key?: string; }

/**
 * 为对象附加运行时 key
 *
 * ProcessConfig/StepConfig/InterruptConfig/ScheduleConfig 类型定义不含 key 字段，
 * 但子编辑器中的 antd Table 需要 rowKey=key。
 * 通过此辅助函数在不改变类型定义的前提下附加 key。
 */
function attachKey<T>(obj: T): T & WithKey {
  return Object.assign(obj as Record<string, unknown>, { key: crypto.randomUUID() }) as T & WithKey;
}

/** 电压检测配置默认值 */
const DEFAULT_R1 = 30000; // 30kΩ
const DEFAULT_R2 = 10000; // 10kΩ

export function DeviceEditor({
  config,
  gpio,
  onSave,
  saveRef,
}: {
  config: DeviceConfig;
  gpio: GpioInfo;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
  saveRef: React.MutableRefObject<() => Promise<void>>;
}) {
  const [form, setForm] = useState<DeviceConfig>(config);
  // onRemove 由父组件 Header 的删除按钮调用，当前编辑器内部不直接使用

  // ---- 嵌套 Popup 状态（原 Drawer 的 visible refs）----
  const [processVisible, setProcessVisible] = useState(false);
  const [processIndex, setProcessIndex] = useState(-1);

  const [stepVisible, setStepVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  const [interruptVisible, setInterruptVisible] = useState(false);
  const [interruptIndex, setInterruptIndex] = useState(-1);

  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [scheduleIndex, setScheduleIndex] = useState(-1);

  const [voltageVisible, setVoltageConfigVisible] = useState(false);

  // ---- 返回键栈接入 ----

  useBackButton(scheduleVisible, () => { setScheduleVisible(false); });
  useBackButton(voltageVisible, () => { setVoltageConfigVisible(false); });

  // ---- 保存（声明在前，供 useEffect 引用）----
  async function handleSave() {
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
      Toast.show({ icon: 'success', content: '保存成功' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      Toast.show({ icon: 'fail', content: msg });
    }
  }

  // ---- 将 handleSave 暴露给父组件 Header 的保存按钮 ----
  useEffect(() => {
    saveRef.current = handleSave;
  });

  // ---- 流程操作 ----
  function addProcess() {
    const item = attachKey<ProcessConfig>({
      name: '新流程',
      steps: [
        attachKey<StepConfig>({
          name: '新步骤',
          component: gpio.loads[0] ?? 'load_0',
          value: { begin: 255, end: 0 },
          timeout: 600000,
          interrupts: [],
        }),
      ],
    });
    const newProcesses = [...form.processes, item];
    setForm({ ...form, processes: newProcesses });
    // 自动打开编辑
    setProcessIndex(newProcesses.length - 1);
    setProcessVisible(true);
  }

  function updateProcess(index: number, updated: ProcessConfig) {
    const newProcesses = [...form.processes];
    newProcesses[index] = updated;
    setForm({ ...form, processes: newProcesses });
  }

  /** 从列表中删除指定流程（SwipeAction 触发） */
  function deleteProcessFromList(index: number) {
    const newProcesses = form.processes.filter((_, i) => i !== index);
    setForm({ ...form, processes: newProcesses });
    // 若删除的是当前打开的流程，关闭 Popup
    if (index === processIndex) {
      setProcessVisible(false);
      setProcessIndex(-1);
    }
  }

  /** 从 Popup 中删除当前打开的流程 */
  function deleteProcess() {
    const newProcesses = form.processes.filter((_, i) => i !== processIndex);
    setForm({ ...form, processes: newProcesses });
    setProcessVisible(false);
    setProcessIndex(-1);
  }

  // ---- 步骤操作 ----
  function addStep() {
    const source = form.processes[processIndex];
    if (!source) return;
    const proc = { ...source };
    const item = attachKey<StepConfig>({
      name: '新步骤',
      component: gpio.loads[0] ?? 'load_0',
      value: { begin: 0, end: 0 },
      timeout: 600000,
      interrupts: [],
    });
    proc.steps = [...proc.steps, item];
    updateProcess(processIndex, proc);
    setStepIndex(proc.steps.length - 1);
    setStepVisible(true);
  }

  function updateStep(index: number, updated: StepConfig) {
    const source = form.processes[processIndex];
    if (!source) return;
    const proc = { ...source };
    const newSteps = [...proc.steps];
    newSteps[index] = updated;
    proc.steps = newSteps;
    updateProcess(processIndex, proc);
  }

  function deleteStep() {
    const source = form.processes[processIndex];
    if (!source) return;
    const proc = { ...source };
    proc.steps = proc.steps.filter((_, i) => i !== stepIndex);
    updateProcess(processIndex, proc);
    setStepVisible(false);
    setStepIndex(-1);
  }

  // ---- 中断操作 ----
  function addInterrupt() {
    const item = attachKey<InterruptConfig>({
      name: '新中断',
      component: gpio.sensors[0] ?? 'sensor_0',
      state: 0,
      signalType: 'digital',   // 默认数字信号
      logic: '>',              // 默认大于
      threshold: 0,            // 默认阈值 0
      intercept: 100,
      delay: 0,
      duration: 0,
    });
    const procSource = form.processes[processIndex];
    if (!procSource) return;
    const proc = { ...procSource };
    const stepSource = proc.steps[stepIndex];
    if (!stepSource) return;
    const step = { ...stepSource };
    step.interrupts = [...(step.interrupts || []), item];
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
    setInterruptIndex(step.interrupts.length - 1);
    setInterruptVisible(true);
  }

  function updateInterrupt(index: number, updated: InterruptConfig) {
    const procSource = form.processes[processIndex];
    if (!procSource) return;
    const proc = { ...procSource };
    const stepSource = proc.steps[stepIndex];
    if (!stepSource) return;
    const step = { ...stepSource };
    const newInterrupts = [...(step.interrupts || [])];
    newInterrupts[index] = updated;
    step.interrupts = newInterrupts;
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
  }

  function deleteInterrupt() {
    const procSource = form.processes[processIndex];
    if (!procSource) return;
    const proc = { ...procSource };
    const stepSource = proc.steps[stepIndex];
    if (!stepSource) return;
    const step = { ...stepSource };
    step.interrupts = (step.interrupts || []).filter((_, i) => i !== interruptIndex);
    proc.steps[stepIndex] = step;
    updateProcess(processIndex, proc);
    setInterruptVisible(false);
    setInterruptIndex(-1);
  }

  // ---- 定时操作 ----
  function addSchedule() {
    const item = attachKey<ScheduleConfig>({
      type: 'day',
      value: 8 * 3600 * 1000,
      interval: 1,
      process: 0,
    });
    const newSchedules = [...form.schedules, item];
    setForm({ ...form, schedules: newSchedules });
    setScheduleIndex(newSchedules.length - 1);
    setScheduleVisible(true);
  }

  function updateSchedule(index: number, updated: ScheduleConfig) {
    const newSchedules = [...form.schedules];
    newSchedules[index] = updated;
    setForm({ ...form, schedules: newSchedules });
  }

  /** 从列表中删除指定定时任务（SwipeAction 触发） */
  function deleteScheduleFromList(index: number) {
    const newSchedules = form.schedules.filter((_, i) => i !== index);
    setForm({ ...form, schedules: newSchedules });
    // 若删除的是当前打开的定时任务，关闭 Popup
    if (index === scheduleIndex) {
      setScheduleVisible(false);
      setScheduleIndex(-1);
    }
  }

  /** 从 Popup 中删除当前打开的定时任务 */
  function deleteSchedule() {
    const newSchedules = form.schedules.filter((_, i) => i !== scheduleIndex);
    setForm({ ...form, schedules: newSchedules });
    setScheduleVisible(false);
    setScheduleIndex(-1);
  }

  // ---- 定时时间格式化 ----
  function formatScheduleTime(record: ScheduleConfig): string {
    if (record.type === 'day') {
      const h = Math.floor(record.value / 3600000);
      const m = Math.floor((record.value % 3600000) / 60000);
      return `每天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return `${record.type} ${record.value}`;
  }

  // ---- 电压检测配置 Popup 状态 ----
  const voltageConfig = form.voltage || { sensor: gpio.sensors[0] || 'sensor_0', r1: DEFAULT_R1, r2: DEFAULT_R2 };

  function updateVoltage(partial: Partial<VoltageConfig>) {
    const merged = { ...voltageConfig, ...partial };
    setForm({ ...form, voltage: merged });
  }

  // ---- 确认删除的通用辅助 ----
  function confirmDelete(title: string, onConfirm: () => void) {
    Dialog.confirm({
      title,
      onConfirm,
    });
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* ======== 基本设置 ======== */}
      <List header="基本设置">
        {/* 设备名称 */}
        <List.Item title="设备名称">
          <Input
            placeholder="输入设备名称"
            value={form.name}
            onChange={(v) => { setForm({ ...form, name: v }); }}
          />
        </List.Item>

        {/* 空闲睡眠 */}
        <List.Item
          description={form.idleSleep ? '设备将不接受实时控制，仅执行计划任务，达到省电目的' : ''}
          title="空闲睡眠"
        >
          <Switch
            checked={form.idleSleep}
            onChange={(checked) => { setForm({ ...form, idleSleep: checked }); }}
          />
        </List.Item>

        {/* 空闲超时 */}
        {form.idleSleep && (
          <List.Item title="空闲超时（毫秒）">
            <Stepper
              max={86400000}
              min={0}
              step={1000}
              value={form.idleTimeout}
              onChange={(v) => { setForm({ ...form, idleTimeout: v }); }}
            />
          </List.Item>
        )}

        {/* 开机执行 */}
        <List.Item
          clickable
          extra={form.bootExec >= 0 ? (form.processes[form.bootExec]?.name ?? '无') : '无'}
          title="开机执行"
          onClick={() => {
            const options = [
              { label: '无', value: '-1' },
              ...form.processes.map((p, i) => ({ label: p.name, value: String(i) })),
            ];
            Picker.prompt({
              columns: [options],
              defaultValue: [String(form.bootExec)],
              onConfirm: (val) => {
                if (val && val.length > 0 && typeof val[0] === 'string') {
                  setForm({ ...form, bootExec: Number(val[0]) });
                }
              },
            });
          }}
        />

        {/* 延迟执行 */}
        <List.Item title="延迟执行（毫秒）">
          <Stepper
            disabled={form.bootExec < 0}
            min={0}
            step={1000}
            value={form.execDelay}
            onChange={(v) => { setForm({ ...form, execDelay: v }); }}
          />
        </List.Item>
      </List>

      {/* ======== 电压检测配置摘要栏 ======== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '12px 0',
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
          fill="none"
          size="small"
          onClick={() => { setVoltageConfigVisible(true); }}
        >
          {form.voltage ? '修改' : '配置'}
        </Button>
      </div>

      {/* ======== 功能列表 ======== */}
      <List header="功能">
        {form.processes.length === 0 ? (
          <ErrorBlock description="点击下方按钮添加功能流程" status="empty" title="暂无功能" />
        ) : (
          form.processes.map((proc, index) => (
            <SwipeAction
              key={(proc as WithKey).key ?? index}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    confirmDelete('确认删除此流程？', () => { deleteProcessFromList(index); });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                prefix={`${index + 1}.`}
                onClick={() => {
                  setProcessIndex(index);
                  setProcessVisible(true);
                }}
              >
                {proc.name}
              </List.Item>
            </SwipeAction>
          ))
        )}
      </List>
      <Button
        block
        style={{ margin: '8px 0 16px' }}
        onClick={addProcess}
      >
        <AddOutline style={{ marginRight: 4 }} /> 添加
      </Button>

      {/* ======== 计划任务列表 ======== */}
      <List header="计划任务">
        {form.schedules.length === 0 ? (
          <ErrorBlock description="点击下方按钮添加定时任务" status="empty" title="暂无计划任务" />
        ) : (
          form.schedules.map((sch, index) => (
            <SwipeAction
              key={(sch as WithKey).key ?? index}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    confirmDelete('确认删除此定时任务？', () => { deleteScheduleFromList(index); });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                description={`间隔 ${sch.interval} 天`}
                extra={sch.process < form.processes.length ? form.processes[sch.process]?.name ?? '' : ''}
                prefix={`${index + 1}.`}
                onClick={() => {
                  setScheduleIndex(index);
                  setScheduleVisible(true);
                }}
              >
                {formatScheduleTime(sch)}
              </List.Item>
            </SwipeAction>
          ))
        )}
      </List>
      <Button
        block
        style={{ margin: '8px 0 16px' }}
        onClick={addSchedule}
      >
        <AddOutline style={{ marginRight: 4 }} /> 添加
      </Button>

      {/* ============================================
          嵌套 Popup 层（原 Drawer 层）
          ============================================ */}

      {/* 流程配置 Picker */}
      <ProcessConfigPicker
        gpio={gpio}
        open={processVisible}
        process={processIndex > -1 ? form.processes[processIndex]! : { name: '', steps: [] }}
        onAddStep={addStep}
        onClose={() => { setProcessVisible(false); }}
        onConfirm={(updated) => { updateProcess(processIndex, updated); }}
        onDelete={deleteProcess}
        onEditStep={(idx) => {
          setStepIndex(idx);
          setStepVisible(true);
        }}
      />

      {/* 步骤配置 Picker (75vh) */}
      <StepConfigPicker
        gpio={gpio}
        open={stepVisible}
        step={stepIndex > -1 && processIndex > -1 ? form.processes[processIndex]!.steps[stepIndex]! : { name: '', component: '', value: { begin: 0, end: 0 }, timeout: 0, interrupts: [] }}
        onAddInterrupt={addInterrupt}
        onClose={() => { setStepVisible(false); }}
        onConfirm={(updated) => { updateStep(stepIndex, updated); }}
        onDelete={deleteStep}
        onEditInterrupt={(idx) => { setInterruptIndex(idx); setInterruptVisible(true); }}
      />

      {/* 中断编辑 Picker (70vh) */}
      {interruptIndex > -1 &&
        stepIndex > -1 &&
        processIndex > -1 &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        form.processes[processIndex]!.steps[stepIndex]!.interrupts && (
        <InterruptConfigPicker
          gpio={gpio}
          onClose={() => { setInterruptVisible(false); }}
          onConfirm={(updated) => { updateInterrupt(interruptIndex, updated); }}
          onDelete={deleteInterrupt}
          open={interruptVisible}
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          interrupt={
            form.processes[processIndex]!.steps[stepIndex]!.interrupts![
              interruptIndex
            ]!
          }
        />
      )}

      {/* 定时编辑 Popup (70vh) */}
      <Popup
        bodyStyle={{ height: '70vh' }}
        position="bottom"
        visible={scheduleVisible}
        onClose={() => { setScheduleVisible(false); }}
      >
        <NavBar
          right={
            <DeleteOutline
              style={{ fontSize: 20, cursor: 'pointer' }}
              onClick={() => {
                confirmDelete('确认删除此定时任务？', deleteSchedule);
              }}
            />
          }
          onBack={() => { setScheduleVisible(false); }}
        >
          编辑定时任务
        </NavBar>
        <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(70vh - 45px)' }}>
          {scheduleIndex > -1 && (
            <ScheduleEditor
              processes={form.processes}
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              schedules={[form.schedules[scheduleIndex]!]}
              onChange={(updated) => {
                if (updated.length > 0) {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  updateSchedule(scheduleIndex, updated[0]!);
                }
              }}
            />
          )}
        </div>
      </Popup>

      {/* 电压检测配置 Popup (60vh) */}
      <Popup
        bodyStyle={{ height: '60vh' }}
        position="bottom"
        visible={voltageVisible}
        onClose={() => { setVoltageConfigVisible(false); }}
      >
        <NavBar onBack={() => { setVoltageConfigVisible(false); }}>
          电压检测配置
        </NavBar>
        <div style={{ padding: '0 16px', overflowY: 'auto', height: 'calc(60vh - 45px)' }}>
          <List>
            {/* 传感器选择 */}
            <List.Item title="电压检测传感器">
              {gpio.sensors.length > 0 ? (
                <Selector
                  options={gpio.sensors.map((s) => ({ label: s, value: s }))}
                  value={[voltageConfig.sensor]}
                  onChange={(vals) => {
                    if (vals.length > 0) {
                      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                      updateVoltage({ sensor: vals[0]! });
                    }
                  }}
                />
              ) : (
                <ErrorBlock
                  description="请等待设备上报 GPIO 状态"
                  status="empty"
                  title="无可用传感器"
                />
              )}
            </List.Item>
            <List.Item
              description="选择用于电压检测的 ADC 传感器引脚"
              title="电压检测传感器"
            >
              {/* 说明由 description 承载 */}
              <span />
            </List.Item>

            {/* R1 电阻值 */}
            <List.Item description="分压电阻 R1，上拉至被测电压。默认 30kΩ" title="R1 电阻值（Ω）">
              <Stepper
                min={0}
                step={1000}
                value={voltageConfig.r1}
                onChange={(v) => { updateVoltage({ r1: v }); }}
              />
            </List.Item>

            {/* R2 电阻值 */}
            <List.Item description="分压电阻 R2，下拉至 GND。默认 10kΩ" title="R2 电阻值（Ω）">
              <Stepper
                min={0}
                step={1000}
                value={voltageConfig.r2}
                onChange={(v) => { updateVoltage({ r2: v }); }}
              />
            </List.Item>

            {/* 电压计算公式说明 */}
            <List.Item>
              <div
                style={{
                  background: '#f6f8fa',
                  border: '1px solid #e8e8e8',
                  borderRadius: 6,
                  padding: '12px 16px',
                  fontSize: 12,
                  color: '#666',
                  width: '100%',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>计算公式</div>
                <div>
                  V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
                </div>
                <div style={{ marginTop: 4 }}>
                  当前分压比:{' '}
                  {voltageConfig.r1 > 0 && voltageConfig.r2 > 0
                    ? ((voltageConfig.r1 + voltageConfig.r2) / voltageConfig.r2).toFixed(2)
                    : '—'}
                </div>
              </div>
            </List.Item>
          </List>
        </div>
      </Popup>
    </div>
  );
}
