/**
 * 设备配置表单 — 管理设备基本设置、流程、步骤、中断、定时任务的 CRUD
 *
 * 基本设置区使用 antd-mobile Form layout="vertical" 构建。
 * 传感器配置抽取为 SensorConfigPicker 子组件。
 * 通过 saveRef 将 handleSave 暴露给父组件 Header 的保存按钮。
 * 5 层嵌套 Picker（设备→流程→步骤→中断 + 定时 + 传感器），
 * 各 Picker 内部接入 useBackButton 返回键栈支持。
 */

'use client';

import { arrayMove } from '@dnd-kit/sortable';
import {
  Input,
  Stepper,
  Switch,
  Button,
  List,
  Form,
  Dialog,
  Toast,
  Picker,
  ErrorBlock,
  SwipeAction,
} from 'antd-mobile';
import {
  AddOutline,
} from 'antd-mobile-icons';
import dayjs from 'dayjs';
import { useState, useEffect } from 'react';

import { formatProcessDesc, formatScheduleTitle, formatScheduleDesc, formatSensorDesc } from '../utils/format-desc';

import { InterruptConfigPicker } from './interrupt-config-picker';
import { ProcessConfigPicker } from './process-config-picker';
import { ScheduleConfigPicker } from './schedule-config-picker';
import { defaultSensor, SensorConfigPicker } from './sensor-config-picker';
import { SortableList } from './sortable-list';
import { StepConfigPicker } from './step-config-picker';

import type { GpioInfo } from '../hooks/use-device-config';
import type { DeviceConfig, ProcessConfig, StepConfig, InterruptConfig, ScheduleConfig, SensorConfig } from '../types';

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

export function DeviceConfigForm({
  config,
  gpio,
  onSave,
  saveRef,
}: {
  config: DeviceConfig;
  gpio: GpioInfo;
  onSave: (data: Partial<DeviceConfig>) => Promise<void>;
  onRemove: () => Promise<void>;
  saveRef: React.RefObject<() => Promise<void>>;
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

  const [sensorVisible, setSensorVisible] = useState(false);
  const [sensorEditIndex, setSensorEditIndex] = useState(-1);

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
        sensors: form.sensors,
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
    const todayStart = dayjs().startOf('day').valueOf();
    const item = attachKey<ScheduleConfig>({
      type: 'day',
      startTime: todayStart,
      value: 8 * 3600000,
      interval: 0,
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

  /** 更新传感器配置 — SensorConfigPicker onConfirm 回调 */
  function confirmSensor(s: SensorConfig) {
    const updated = [...form.sensors];
    if (sensorEditIndex >= 0) {
      updated[sensorEditIndex] = s;
    } else {
      updated.push(s);
    }
    setForm({ ...form, sensors: updated });
    setSensorVisible(false);
  }

  /** 从列表中删除指定传感器（SwipeAction 触发） */
  function deleteSensorFromList(index: number) {
    const newSensors = form.sensors.filter((_, i) => i !== index);
    setForm({ ...form, sensors: newSensors });
    if (index === sensorEditIndex) {
      setSensorVisible(false);
      setSensorEditIndex(-1);
    }
  }

  // ---- 确认删除的通用辅助 ----
  function confirmDelete(title: string, onConfirm: () => void) {
    void Dialog.confirm({
      title,
      onConfirm,
    });
  }

  return (
    <>
      {/* ======== 基本设置（List→Form） ======== */}
      <Form layout="vertical">
        <Form.Header>基本设置</Form.Header>

        {/* 设备名称 */}
        <Form.Item label="设备名称">
          <Input
            placeholder="输入设备名称"
            value={form.name}
            onChange={(v) => { setForm({ ...form, name: v }); }}
          />
        </Form.Item>

        {/* 空闲睡眠 */}
        <Form.Item
          help={form.idleSleep ? '设备将不接受实时控制，仅执行计划任务，达到省电目的' : ''}
          label="空闲睡眠"
        >
          <Switch
            checked={form.idleSleep}
            onChange={(checked) => { setForm({ ...form, idleSleep: checked }); }}
          />
        </Form.Item>

        {/* 空闲超时 */}
        {form.idleSleep && (
          <Form.Item label="空闲超时（毫秒）">
            <Stepper
              className="!w-2/5"
              max={86400000}
              min={0}
              step={1000}
              value={form.idleTimeout}
              onChange={(v) => { setForm({ ...form, idleTimeout: v }); }}
            />
          </Form.Item>
        )}

        {/* 开机执行 */}
        <Form.Item
          label="开机执行"
          onClick={() => {
            const options = [
              { label: '无', value: '-1' },
              ...form.processes.map((p, i) => ({ label: p.name, value: String(i) })),
            ];
            void Picker.prompt({
              columns: [options],
              defaultValue: [String(form.bootExec)],
              onConfirm: (val) => {
                if (typeof val[0] === 'string') {
                  setForm({ ...form, bootExec: Number(val[0]) });
                }
              },
            });
          }}
        >
          <span>
            {form.processes[form.bootExec]?.name ?? '无'}
          </span>
        </Form.Item>

        {/* 延迟执行 */}
        <Form.Item label="延迟执行（毫秒）">
          <Stepper
            className="!w-2/5"
            disabled={form.bootExec < 0}
            min={0}
            step={1000}
            value={form.execDelay}
            onChange={(v) => { setForm({ ...form, execDelay: v }); }}
          />
        </Form.Item>

      </Form>

      {/* ======== 传感器列表 ======== */}
      <SortableList
        emptyText="暂无传感器"
        getKey={(s, i) => (s).sensor + String(i)}
        header="传感器"
        items={form.sensors}
        renderItem={(sensor, index) => (
          <SwipeAction
            rightActions={[
              {
                key: 'delete',
                text: '删除',
                color: 'danger',
                onClick: () => {
                  confirmDelete('确认删除此传感器？', () => { deleteSensorFromList(index); });
                },
              },
            ]}
          >
            <List.Item
              clickable
              description={formatSensorDesc(sensor)}
              onClick={() => {
                setSensorEditIndex(index);
                setSensorVisible(true);
              }}
            >
              {sensor.name || '未命名'}
            </List.Item>
          </SwipeAction>
        )}
        onReorder={(from, to) => {
          const newSensors = arrayMove(form.sensors, from, to);
          setForm({ ...form, sensors: newSensors });
        }}
      />
      <div className="p-2">
        <Button block size="small" onClick={() => {
          setSensorEditIndex(-1);
          setSensorVisible(true);
        }}>
          <AddOutline /> 添加传感器
        </Button>
      </div>



      {/* ======== 功能列表 ======== */}
      <SortableList
        emptyText="暂无功能"
        getKey={(proc, index) => (proc as WithKey).key ?? String(index)}
        header="功能"
        items={form.processes}
        renderItem={(proc, index) => (
          <SwipeAction
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
              description={formatProcessDesc(proc)}
              onClick={() => {
                setProcessIndex(index);
                setProcessVisible(true);
              }}
            >
              {proc.name}
            </List.Item>
          </SwipeAction>
        )}
        onReorder={(from, to) => {
          const newProcesses = arrayMove(form.processes, from, to);
          setForm({ ...form, processes: newProcesses });
        }}
      />
      <div className="p-2">
        <Button block size="small" onClick={addProcess}>
          <AddOutline /> 添加
        </Button>
      </div>


      {/* ======== 计划任务列表 ======== */}
      <List header="计划任务">
        {form.schedules.length === 0 ? (
          <ErrorBlock description="" status="empty" title="暂无计划任务" />
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
                description={formatScheduleDesc(sch, form.processes)}
                onClick={() => {
                  setScheduleIndex(index);
                  setScheduleVisible(true);
                }}
              >
                {formatScheduleTitle(sch, form.processes)}
              </List.Item>
            </SwipeAction>
          ))
        )}
        <div className="p-2" >
          <Button
            block
            size="small"
            onClick={addSchedule}
          >
            <AddOutline /> 添加
          </Button>
        </div>
      </List>


      {/* ============================================
          嵌套 Popup 层（原 Drawer 层）
          ============================================ */}

      {/* 流程配置 Picker */}
      <ProcessConfigPicker
        gpio={gpio}
        open={processVisible}
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
          interrupt={
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            form.processes[processIndex]!.steps[stepIndex]!.interrupts[
              interruptIndex
            ]!
            /* eslint-enable @typescript-eslint/no-non-null-assertion */
          }
          open={interruptVisible}
          onClose={() => { setInterruptVisible(false); }}
          onConfirm={(updated) => { updateInterrupt(interruptIndex, updated); }}
          onDelete={deleteInterrupt}
        />
      )}

      {/* 定时任务配置 Picker */}
      <ScheduleConfigPicker
        open={scheduleVisible}
        processes={form.processes}
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        schedule={scheduleIndex > -1 ? form.schedules[scheduleIndex]! : { type: 'day', startTime: dayjs().startOf('day').valueOf(), value: 8 * 3600000, interval: 0, process: 0 }}
        onClose={() => { setScheduleVisible(false); }}
        onConfirm={(updated) => { updateSchedule(scheduleIndex, updated); }}
        onDelete={deleteSchedule}
      />

      {/* 传感器编辑 Picker */}
      <SensorConfigPicker
        editKey={sensorEditIndex}
        gpio={gpio}
        open={sensorVisible}
        sensor={sensorEditIndex >= 0 && sensorEditIndex < form.sensors.length
          ? (form.sensors[sensorEditIndex] ?? defaultSensor(gpio))
          : defaultSensor(gpio)}
        onClose={() => {
          setSensorVisible(false);
          setSensorEditIndex(-1);
        }}
        onConfirm={confirmSensor}
      />
    </>
  );
}
