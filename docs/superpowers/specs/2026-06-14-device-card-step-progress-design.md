# 设备卡片步骤进度 & antd-mobile 重构 设计文档

**日期:** 2026-06-14
**状态:** 已确认
**范围:** ROM v2 + 服务端 push-state/get-state/set-state + `app/watering/components/device-card.tsx`

---

## 目标

1. 在设备卡片上展示当前执行流程的**步骤进度**（已完成/进行中/等待），使用 antd-mobile Steps 横向步骤条
2. 提供**上一步/下一步**按钮，支持切换 ROM 执行到指定步骤
3. 将 device-card 的 antd 组件（Card/Tag/Button/Row/Col）替换为 antd-mobile 版本，提升移动端操作体验
4. ROM 最小化改动：在 change 推送中补传 `stepIndex`，在 execute 中支持从指定步骤启动

---

## 一、ROM 变更

### 1.1 Process.cpp — change 事件补传 stepIndex

在 `next()` 方法的四处 change 事件推送（`step_begin` / `step_end` / `step_timeout` / `step_interrupt`）中，各加一个字段 `stepIndex`。ROM 通过 `pushState("change", ...)` 以 URL 查询参数形式传给服务端。

**改动位置**：`Process.cpp` 的 `next()` 方法，4 处 change 推送，每处 +1 行伪代码：

```
pushState 参数中追加 "stepIndex=" + String(current.index)
```

### 1.2 Process.cpp — 支持从指定步骤执行

`execute()` 新增重载 `execute(int startStep)`：

- 逻辑同 `execute()`，但 `current.index = startStep` 而非 `0`
- 边界检查：`startStep` 越界时从 `0` 开始（防御性处理）

### 1.3 rom-v2.ino — 解析 stepIndex 参数

`networkStateChangeHandler()` 中，解析 state JSON 的可选 `stepIndex` 字段：

- 若存在且为有效整数 → `process.execute(stepIndex)`
- 否则 → `process.execute()`（保持向后兼容）

**影响面**：纯增量，不改动现有流程逻辑。ROM 总改动约 10 行。

---

## 二、服务端变更

### 2.1 types.ts — DeviceState 新增字段

```ts
/** 当前执行的步骤索引（ROM change 上报，-1 表示未执行到具体步骤） */
stepIndex?: number;
```

### 2.2 push-state/route.ts — change 事件持久化 stepIndex

在 `case 'change'` 分支中，解析 ROM 新增的 `stepIndex` 查询参数，写入 `DeviceState.stepIndex`：

```ts
const stepIndex = searchParams.get('stepIndex');
if (stepIndex !== null) {
  const state = await getDeviceState(chipId);
  if (state) {
    state.stepIndex = parseInt(stepIndex, 10);
    await saveDeviceState(state);
  }
}
```

### 2.3 push-state/route.ts — finish 事件清除 stepIndex

在 `case 'finish'` 分支中，已有 `state.index = undefined` 和 `state.process = undefined`，追加 `state.stepIndex = undefined`。

### 2.4 set-state.ts — setDeviceSwitch 支持 stepIndex 参数

```ts
export async function setDeviceSwitch(
  chipId: string,
  switchState: 'on' | 'off',
  processIndex?: number,
  stepIndex?: number,  // 新增
)
```

`on` 分支中：
```ts
state.stepIndex = stepIndex ?? 0;
```

### 2.5 get-state/route.ts — buildResponse 下发 stepIndex

```ts
if (changed && state?.process) {
  result.process = state.process;
  if (typeof state.stepIndex === 'number') {
    result.stepIndex = state.stepIndex;
  }
}
```

**影响面**：3 个文件（types.ts + 2 个 route + 1 个 action），均为此前已涉及的文件，纯增量追加。

---

## 三、前端变更

### 3.1 组件拆分

当前 `device-card.tsx` 317 行，逻辑密集。拆为 2 个文件：

| 文件 | 职责 |
|------|------|
| `device-card.tsx` | 卡片容器、设备信息行、流程按钮网格、ActionSheet |
| `step-progress.tsx` | 纯展示：接收 steps[] + stepIndex + 导航回调 |

### 3.2 device-card.tsx — antd → antd-mobile 重构

**替换清单：**

| 原组件 (antd) | 新组件 (antd-mobile) | 说明 |
|---------------|---------------------|------|
| `Card` | `Card` | antd-mobile 版本，API 略有差异（`extra` → 用 `headerRight` 或其他方式） |
| `Tag` | `Tag` | 颜色属性值不同（`green` → `success`） |
| `Button` | `Button` | `block` + `size="small"` + `color="primary"/"danger"` |
| `Row` / `Col` | Tailwind grid | `grid grid-cols-2 gap-x-2 gap-y-1` 替代栅格 |

**布局结构：**

卡片分为 3 个区域：

1. **卡片头部**：设备名 + 右侧操作按钮（日志/选项）
2. **信息行**：芯片/电压 | 网卡/状态 → Tailwind 2 列网格
3. **流程按钮区**：流程快捷按钮网格（保持现有偶数/奇数布局算法，改用 antd-mobile Button）
4. **步骤进度区**（仅 `switch='on'` 且有 `state.process` 时显示）：
   - 流程名标注
   - 横向步骤条
   - 上一步/下一步按钮

```
┌──────────────────────────────────────┐
│ 设备名                    日志 ···  │
├──────────────────────────────────────┤
│ 芯片: xxx          电压: 3.30V      │
│ 网卡: aa:bb:cc     状态: ●在线      │
├──────────────────────────────────────┤
│ [流程1] [流程2] [流程3]             │
├──────────────────────────────────────┤  ← 仅 switch='on' 时显示
│ 当前执行：流程名                    │
│                                     │
│  ✓步骤1 → ⟳步骤2 → ○步骤3          │  ← Steps direction="horizontal"
│                                     │
│  [← 上一步]        [下一步 →]      │
└──────────────────────────────────────┘
```

### 3.3 step-progress.tsx — 步骤进度组件

**Props：**

```ts
interface StepProgressProps {
  /** 步骤列表 */
  steps: StepConfig[];
  /** 当前执行的步骤索引，-1 或 undefined 表示未开始 */
  stepIndex?: number;
  /** 设备是否在线 */
  online: boolean;
  /** 上一步回调 */
  onPrev: () => void;
  /** 下一步回调 */
  onNext: () => void;
}
```

**步骤状态判定：**

| 条件 | status |
|------|--------|
| `stepIndex` 为 undefined / < 0 | 所有步骤 `wait` |
| `i < stepIndex` | `finish` |
| `i === stepIndex` | `process` |
| `i > stepIndex` | `wait` |

**导航按钮行为：**

- 上一步：调用 `onPrev()`，由父组件计算 `stepIndex - 1` 并调用 `setDeviceSwitch('on', processIndex, newStepIndex)`
- 下一步：调用 `onNext()`，同理 `stepIndex + 1`
- 禁用条件：`stepIndex <= 0` 时禁用上一步，`stepIndex >= steps.length - 1` 时禁用下一步；设备离线或 `switch='off'` 时两个都禁用

**服务端交互：**

步骤切换走现有 `setDeviceSwitch` 接口，新增 `stepIndex` 参数即可。服务端更新 `stateId` + `stepIndex`，ROM 长轮询到新状态后从指定步骤开始执行。不需要新 API。

### 3.4 流程按钮状态映射（继承现有逻辑，适配 antd-mobile）

| 状态 | 条件 | 按钮颜色 | 文案 |
|------|------|---------|------|
| 执行中 | `switch='on'` 且 `index` 匹配 | `color='danger'` | 停止 |
| 空闲 | 其他 | `color='primary'` | 流程名 |
| 禁用 | 离线 或 idleSleep 模式 | `disabled` | 流程名 |

### 3.5 不变的内容

- 电压计算公式和显示
- `onClickSwitch` 核心逻辑（启动/停止流程）
- ActionSheet 操作菜单（配置设备/清除状态/删除设备）
- `isExec()` 判断逻辑
- 设备离线时流程按钮禁用
- 无流程时不显示按钮区域

---

## 四、测试要点

| 场景 | 预期 |
|------|------|
| 设备在线，有流程，switch='off' | 显示流程按钮，不显示步骤区 |
| 设备在线，switch='on'，process 有效 | 显示横向步骤条，当前步骤标蓝 |
| 全部步骤完成 | 所有步骤标绿 `finish` |
| 点击上一步（stepIndex=1→0） | 调用 setDeviceSwitch，ROM 从步骤 0 执行 |
| stepIndex=0 时点击上一步 | 按钮禁用，无请求 |
| stepIndex=last 时点击下一步 | 按钮禁用，无请求 |
| 设备离线 | 所有流程按钮禁用，步骤导航按钮禁用 |
| ROM 未升级（无 stepIndex） | stepIndex=undefined，所有步骤 `wait`，导航按钮禁用 |

---

## 五、与其他设计文档的关系

- 本设计在 [设备卡片布局与按钮优化](2026-06-08-device-card-layout-and-buttons-design.md) 基础上扩展步骤进度和 antd-mobile 迁移
- ROM 变更与 [ROM v2 数据结构对齐](2026-06-10-rom-v2-data-structure-alignment-design.md) 无冲突，独立追加
