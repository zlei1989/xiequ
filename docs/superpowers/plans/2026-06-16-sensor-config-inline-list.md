# 传感器配置内联列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将传感器配置从弹层式列表改为表单内嵌 SortableList，与"功能"列表同模式，点击弹出编辑层。

**Architecture:** DeviceConfigForm 接管传感器列表（SortableList + SwipeAction + 拖拽排序），SensorConfigPicker 降为纯编辑 Popup。新增 `formatSensorDesc` 增强列表摘要显示电阻值/B 值。

**Tech Stack:** React + antd-mobile (Popup/List/SwipeAction/Form/NavBar/Selector/Stepper/Input/Dialog) + @dnd-kit/sortable

---

## File Map

| 文件 | 职责 | 变更类型 |
|------|------|----------|
| `app/watering/utils/format-desc.ts` | 新增 `formatSensorDesc` 摘要函数 | 新增函数 |
| `app/watering/components/sensor-config-picker.tsx` | 降为纯编辑 Popup，导出 `defaultSensor` | 重写 |
| `app/watering/components/device-config-form.tsx` | 接管传感器列表展示和 CRUD | 新增列表区 + 操作函数 |

---

### Task 1: 新增 `formatSensorDesc` 摘要函数

**Files:**
- Modify: `app/watering/utils/format-desc.ts`

- [ ] **Step 1: 在文件末尾添加 `formatSensorDesc` 函数**

在 `formatProcessDesc` 之后添加：

```ts
/**
 * 生成传感器列表描述
 * 格式按类型/转换：
 * - 数字信号：sensor_0 · 数字
 * - 模拟信号无转换：sensor_1 · 模拟 · ADC
 * - 分压：sensor_0 · 模拟 · 分压 · R1=30kΩ R2=10kΩ
 * - 温感：sensor_1 · 模拟 · 温感 · B=3435
 */
export function formatSensorDesc(s: SensorConfig): string {
  const typeLabels: Record<string, string> = {
    digital: '数字',
    analog: '模拟',
  };
  const conversionLabels: Record<string, string> = {
    resistor_divider: '分压',
    ntc_10k: '温感',
  };

  const parts = [s.sensor, typeLabels[s.type] ?? s.type];

  if (s.type === 'analog') {
    if (s.conversion === 'resistor_divider') {
      const r1 = (s.r1 ?? 30000) / 1000;
      const r2 = (s.r2 ?? 10000) / 1000;
      parts.push('分压', `R1=${r1}kΩ R2=${r2}kΩ`);
    } else if (s.conversion === 'ntc_10k') {
      parts.push('温感', `B=${s.bValue ?? 3435}`);
    } else {
      parts.push('ADC');
    }
  }

  return parts.join(' · ');
}
```

需要在该文件顶部 import 中加入 `SensorConfig`：

```ts
import type { ProcessConfig, StepConfig, InterruptConfig, ScheduleConfig, SensorConfig } from '../types';
```

- [ ] **Step 2: 运行检查**

```bash
npm run check
```

确保无类型错误。

- [ ] **Step 3: Commit**

```bash
git add app/watering/utils/format-desc.ts
git commit -m "feat: add formatSensorDesc for sensor list summary"
```

---

### Task 2: 重构 SensorConfigPicker 为纯编辑 Popup

**Files:**
- Modify: `app/watering/components/sensor-config-picker.tsx`（重写整个文件）

- [ ] **Step 1: 重写 sensor-config-picker.tsx**

完整替换文件内容为：

```tsx
/**
 * 传感器配置编辑 Popup — 单个传感器的编辑表单
 *
 * 仅包含编辑层 Popup（60vh），列表层已移至 DeviceConfigForm。
 * 导出 defaultSensor 供 DeviceConfigForm 添加传感器时使用。
 */

'use client';

import {
  Popup,
  NavBar,
  Selector,
  Stepper,
  Form,
  Card,
  ErrorBlock,
  Button,
  Input,
} from 'antd-mobile';
import { useEffect, useState } from 'react';

import type { GpioInfo } from '@/app/watering/hooks/use-device-config';
import { useBackButton } from '@/lib/back-button';

import type { SensorConfig } from '../types';

interface SensorConfigPickerProps {
  /** 编辑层显隐 */
  open: boolean;
  /** 当前编辑的传感器 */
  sensor: SensorConfig;
  /** GPIO 信息（提供传感器引脚选项） */
  gpio: GpioInfo;
  /** 确认回调，传回修改后的传感器配置 */
  onConfirm: (s: SensorConfig) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/** 默认传感器配置 */
export function defaultSensor(gpio: GpioInfo): SensorConfig {
  return {
    name: '',
    sensor: gpio.sensors[0] ?? 'sensor_0',
    type: 'analog',
  };
}

/** 转换类型中文标签映射 */
const conversionLabels: Record<string, string> = {
  resistor_divider: '分压',
  ntc_10k: '温感',
};

export function SensorConfigPicker({
  open,
  sensor,
  gpio,
  onConfirm,
  onClose,
}: SensorConfigPickerProps) {
  const [editConfig, setEditConfig] = useState<SensorConfig>(sensor);

  /** open 时同步外部 sensor 到内部编辑状态 */
  useEffect(() => {
    if (open) setEditConfig({ ...sensor });
  }, [open, sensor]);

  useBackButton(open, onClose);

  /** 局部更新编辑中的传感器 */
  function updateEdit(partial: Partial<SensorConfig>) {
    setEditConfig({ ...editConfig, ...partial });
  }

  const sensorOptions = gpio.sensors.map((k) => ({ label: k, value: k }));

  return (
    <Popup
      bodyStyle={{ height: '60vh' }}
      closeOnMaskClick={false}
      position="bottom"
      visible={open}
      onClose={onClose}
    >
      <NavBar onBack={onClose}>
        {sensor.name ? '编辑传感器' : '添加传感器'}
      </NavBar>
      <div style={{ overflowY: 'auto', height: 'calc(60vh - 45px)' }}>
        <Form layout="vertical">
          {/* 感应名称 */}
          <Form.Item label="感应名称">
            <Input
              placeholder="如：电池电压"
              value={editConfig.name}
              onChange={(v) => { updateEdit({ name: v }); }}
            />
          </Form.Item>

          {/* 传感器引脚 */}
          <Form.Item label="传感器引脚">
            {sensorOptions.length > 0 ? (
              <Selector
                options={sensorOptions}
                value={[editConfig.sensor]}
                onChange={(vals) => {
                  const val = vals[0];
                  if (val) updateEdit({ sensor: val });
                }}
              />
            ) : (
              <ErrorBlock description="请等待设备上报 GPIO 状态" status="empty" title="无可用传感器" />
            )}
          </Form.Item>

          {/* 信号类型 */}
          <Form.Item label="信号类型">
            <Selector
              options={[
                { label: '数字信号', value: 'digital' },
                { label: '模拟信号', value: 'analog' },
              ]}
              value={[editConfig.type]}
              onChange={(vals) => {
                if (vals.length > 0) {
                  const type = vals[0] as SensorConfig['type'];
                  const partial: Partial<SensorConfig> = { type };
                  if (type === 'digital') {
                    partial.conversion = undefined;
                    partial.r1 = undefined;
                    partial.r2 = undefined;
                    partial.bValue = undefined;
                  }
                  updateEdit(partial);
                }
              }}
            />
          </Form.Item>

          {/* 转换类型（仅模拟信号） */}
          {editConfig.type === 'analog' && (
            <>
              <Form.Item label="转换">
                <Selector
                  options={[
                    { label: '无', value: '' },
                    { label: '电阻分压器', value: 'resistor_divider' },
                    { label: '温感电阻10K', value: 'ntc_10k' },
                  ]}
                  value={[editConfig.conversion ?? '']}
                  onChange={(vals) => {
                    if (vals.length > 0) {
                      const conversion = (vals[0] || undefined);
                      updateEdit({ conversion });
                    }
                  }}
                />
              </Form.Item>

              {/* 公式 help — 电阻分压器 */}
              {editConfig.conversion === 'resistor_divider' && (
                <Card title="计算公式">
                  <div className="text-xs text-gray-500">
                    <div>
                      V<sub>实际</sub> = V<sub>传感器</sub> × (R1 + R2) / R2
                    </div>
                    <div className="mt-1">
                      V<sub>传感器</sub> = ADC / 4095 × 3.3V
                    </div>
                    <div className="mt-1">
                      分压比:{' '}
                      {(editConfig.r1 ?? 30000) > 0 && (editConfig.r2 ?? 10000) > 0
                        ? (
                          ((editConfig.r1 ?? 30000) + (editConfig.r2 ?? 10000))
                          / (editConfig.r2 ?? 10000)
                        ).toFixed(2)
                        : '—'}
                    </div>
                  </div>
                </Card>
              )}

              {/* 公式 help — NTC */}
              {editConfig.conversion === 'ntc_10k' && (
                <Card title="计算公式">
                  <div className="text-xs text-gray-500">
                    <div>
                      R<sub>NTC</sub> = 10KΩ × V<sub>ADC</sub> / (3.3V - V<sub>ADC</sub>)
                    </div>
                    <div className="mt-1">
                      T(K) = 1 / (1/298.15 + ln(R<sub>NTC</sub>/10000)/B)
                    </div>
                    <div className="mt-1">
                      T(°C) = T(K) - 273.15
                    </div>
                  </div>
                </Card>
              )}

              {/* R1 / R2（仅电阻分压器） */}
              {editConfig.conversion === 'resistor_divider' && (
                <>
                  <Form.Item help="上拉电阻 R1，上拉至被测电压。默认 30kΩ" label="R1 电阻值 (Ω)">
                    <Stepper
                      min={0}
                      step={1000}
                      value={editConfig.r1 ?? 30000}
                      onChange={(v) => { updateEdit({ r1: v }); }}
                    />
                  </Form.Item>

                  <Form.Item help="下拉电阻 R2，下拉至 GND。默认 10kΩ" label="R2 电阻值 (Ω)">
                    <Stepper
                      min={0}
                      step={1000}
                      value={editConfig.r2 ?? 10000}
                      onChange={(v) => { updateEdit({ r2: v }); }}
                    />
                  </Form.Item>
                </>
              )}

              {/* B 值（仅温感电阻） */}
              {editConfig.conversion === 'ntc_10k' && (
                <Form.Item
                  help="NTC 热敏电阻 B 值常数。常用值 3435/3950"
                  label="B 值"
                >
                  <Selector
                    options={[
                      { label: '3435', value: 3435 },
                      { label: '3950', value: 3950 },
                    ]}
                    value={[editConfig.bValue ?? 3435]}
                    onChange={(vals) => {
                      if (vals.length > 0) updateEdit({ bValue: vals[0] });
                    }}
                  />
                </Form.Item>
              )}
            </>
          )}
        </Form>

        {/* 确认按钮 */}
        <div className="p-4">
          <Button block color="primary" onClick={() => { onConfirm(editConfig); }}>
            确认
          </Button>
        </div>
      </div>
    </Popup>
  );
}
```

- [ ] **Step 2: 运行检查**

```bash
npm run check
```

确保无类型错误和无用 import。

- [ ] **Step 3: Commit**

```bash
git add app/watering/components/sensor-config-picker.tsx
git commit -m "refactor: simplify SensorConfigPicker to edit-only Popup, export defaultSensor"
```

---

### Task 3: DeviceConfigForm 接管传感器列表

**Files:**
- Modify: `app/watering/components/device-config-form.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部已有的 `SensorConfigPicker` import 后，追加需要的新 import。找到 `import { formatProcessDesc, formatScheduleDesc }` 行，在其后添加 `formatSensorDesc`：

```ts
import { formatProcessDesc, formatScheduleDesc, formatSensorDesc } from '../utils/format-desc';
```

找到 `import { SensorConfigPicker } from './sensor-config-picker';` 行，改为同时导入 `defaultSensor`：

```ts
import { SensorConfigPicker, defaultSensor } from './sensor-config-picker';
```

在 antd-mobile import 中添加 `Card`（如果尚未导入的话——检查后确认已有 `Dialog`，无需添加 `Card`，列表项用 `List.Item`）。

> 实际上 `Card` 已在 antd-mobile import 中不存在，确认无需添加。SortableList 已导入，SwipeAction 已导入，Dialog 已导入，List 已导入，Button 已导入，AddOutline 已导入，ErrorBlock 已导入。所有必要组件均已存在。

- [ ] **Step 2: 添加传感器编辑状态**

在现有状态声明区域（`const [sensorVisible, setSensorVisible] = useState(false);` 附近）找到：

```ts
const [sensorVisible, setSensorVisible] = useState(false);
```

替换为：

```ts
/** 传感器编辑 Popup 显隐 */
const [sensorEditVisible, setSensorEditVisible] = useState(false);
/** 当前编辑的传感器索引，-1 表示新增 */
const [sensorEditIndex, setSensorEditIndex] = useState(-1);
```

- [ ] **Step 3: 添加传感器操作函数**

在 `updateSensors` 函数附近找到：

```ts
/** 更新传感器配置 — SensorConfigPicker onChange 回调 */
function updateSensors(configs: SensorConfig[]) {
  setForm({ ...form, sensors: configs });
}
```

替换为：

```ts
// ---- 传感器操作 ----

/** 更新传感器 — 编辑确认后按索引替换或追加 */
function updateSensor(index: number, config: SensorConfig) {
  if (index >= 0) {
    const newSensors = [...form.sensors];
    newSensors[index] = config;
    setForm({ ...form, sensors: newSensors });
  } else {
    setForm({ ...form, sensors: [...form.sensors, config] });
  }
}

/** 从列表中删除指定传感器（SwipeAction 触发） */
function deleteSensorFromList(index: number) {
  const newSensors = form.sensors.filter((_, i) => i !== index);
  setForm({ ...form, sensors: newSensors });
  // 若删除的是当前打开的传感器，关闭 Popup
  if (index === sensorEditIndex) {
    setSensorEditVisible(false);
    setSensorEditIndex(-1);
  }
}
```

`updateSensors` 函数原样保留或用上面的替换——实际上 `updateSensors` 目前只在 `SensorConfigPicker` 的 `onChange` 中被使用。由于 SensorConfigPicker 不再接受 `onChange`，可以删除 `updateSensors` 函数。用上面的两个函数替换即可。

> 需要同步删除 `updateSensors` 的引用——检查 `DeviceConfigForm` 中是否有其他地方调用 `updateSensors`。当前只有 `SensorConfigPicker onChange` 调用。SensorConfigPicker 改为 `onConfirm` 后不再需要 `updateSensors`。

- [ ] **Step 4: 替换传感器摘要行为列表区域**

找到传感器摘要行（`<Form.Item label="传感器配置" ...>`）并删除：

```tsx
{/* ======== 传感器配置摘要栏 ======== */}
<Form.Item label="传感器配置" onClick={() => { setSensorVisible(true); }}>
  <span>
    {form.sensors.length > 0 ? `已配置 ${form.sensors.length} 项` : '未配置'}
  </span>
</Form.Item>
```

在该位置插入传感器列表区域：

```tsx
{/* ======== 传感器列表 ======== */}
<SortableList
  emptyText="暂无传感器"
  getKey={(s, i) => (s.sensor) + String(i)}
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
          setSensorEditVisible(true);
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
    setSensorEditVisible(true);
  }}>
    <AddOutline /> 添加传感器
  </Button>
</div>
```

- [ ] **Step 5: 替换底部 SensorConfigPicker 调用**

找到底部：

```tsx
{/* 传感器配置 Picker */}
<SensorConfigPicker
  gpio={gpio}
  open={sensorVisible}
  sensors={form.sensors}
  onChange={updateSensors}
  onClose={() => { setSensorVisible(false); }}
/>
```

替换为：

```tsx
{/* 传感器编辑 Picker */}
<SensorConfigPicker
  gpio={gpio}
  open={sensorEditVisible}
  sensor={sensorEditIndex >= 0 ? (form.sensors[sensorEditIndex] ?? defaultSensor(gpio)) : defaultSensor(gpio)}
  onClose={() => {
    setSensorEditVisible(false);
    setSensorEditIndex(-1);
  }}
  onConfirm={(config) => {
    updateSensor(sensorEditIndex, config);
    setSensorEditVisible(false);
    setSensorEditIndex(-1);
  }}
/>
```

- [ ] **Step 6: 运行格式化和检查**

```bash
npm run format
npm run check
```

修复所有 ESLint 和 TypeScript 错误。

- [ ] **Step 7: Commit**

```bash
git add app/watering/components/device-config-form.tsx
git commit -m "feat: move sensor list into DeviceConfigForm with SortableList"
```

---

### Task 4: 端到端验证

**Files:** 无（手动验证）

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 验证传感器列表展示**

打开浏览器访问 `http://localhost:3000/watering`，进入某个设备的配置页，确认：
- 传感器列表直接显示在基本设置区下方
- 无传感器时显示"暂无传感器"空状态
- 摘要正确显示引脚、类型、电阻值/B 值
- 可点击列表项打开编辑 Popup

- [ ] **Step 3: 验证 CRUD 操作**

- 点击"添加传感器"→ 填写表单 → 确认 → 列表新增一项
- 点击已有项 → 修改 → 确认 → 列表更新
- 右划 → 点击删除 → 确认 → 列表移除
- 拖拽重排顺序

- [ ] **Step 4: 验证保存**

点击右上角保存按钮，确认配置保存成功。返回列表页再进入，确认传感器列表维持。

- [ ] **Step 5: 最终检查**

```bash
npm run format && npm run check
```

无错误后提交：

```bash
git add -A && git commit -m "chore: final cleanup after sensor list refactor"
```
