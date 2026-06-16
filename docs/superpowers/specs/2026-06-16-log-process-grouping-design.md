# 日志页面流程分组优化

**日期**：2026-06-16
**状态**：已确认

## 目标

将日志分组从"按 stateId"改为"按流程"，解决同一次运行被 stateId 拆散的问题；同时美化负载展示格式。

## 背景

当前 `groupByStateId` 按 `stateId` 分组，但 `stateId` 在 finish 事件写入日志前就已刷新（push-state 第 151 行），导致同一次运行（bootstrap → execute → change → finish）的 finish 事件与其他事件落在不同 stateId 组中，用户看到的日志卡片被拆散，开始和结束不在同一张卡片中。

## 设计

### 一、后端：日志查询加时间限制

**文件**：`app/watering/services/db.ts`

`getDeviceLogs` 加 `WHERE created_time > ?`，参数为 7 天前的 ISO 字符串。`LOG_RETENTION_DAYS = 7` 提取为常量。

`clearDeviceLogs` 不变（清全部）。

### 二、前端：分组算法 `groupByProcess`

**替代** `groupByStateId`。

**输入**：`LogItem[]`（已过滤 heartbeat，已按 `created_time` 正序）

**边界规则**：

| 事件 | 处理 |
|------|------|
| `bootstrap` | 产出独立开机记录（`type: 'boot'`） |
| `execute` | 切割新流程组起点 |
| `change` | 归入当前流程组 |
| `finish` | 归入当前流程组，标记 `endType: 'finish'` |
| `terminate` | 归入当前流程组，标记 `endType: 'terminate'` |

**扫描后**：有流程组无结束事件 → `endType: 'pending'`。

bootstrap 和 execute 永远独立成卡片，不做合并。这样规则最简单、最统一。

**输出类型**：

```typescript
type ProcessGroup = {
  type: 'boot' | 'process';
  /** 开机信息（type='boot' 时必有） */
  bootItem?: LogItem;
  /** 流程名（从 execute 事件 state.process.name 或 change 的 processName 提取） */
  processName?: string;
  /** 流程内的事件（change + finish/terminate），正序 */
  items: LogItem[];
  /** 结束类型 */
  endType?: 'finish' | 'terminate' | 'pending';
};
```

**排序**：卡片倒序（最新流程/开机记录在最前），卡片内部正序（时间从早到晚）。

### 三、组件设计

所有组件使用 antd-mobile（Card、Steps、Tag、Space）。

#### 3.1 `BootCard` — 开机记录卡片

纯信息展示，不使用 Steps。

```
┌─ Card ──────────────────────────────────┐
│ ⚡ 开机记录                    14:30:22  │
│ 定时唤醒 · 休眠 18小时                    │
│ 电压: 3.55V · 温度: 25°C · 负载: 48     │
└──────────────────────────────────────────┘
```

#### 3.2 `ProcessCard` — 流程卡片

Card + Steps，每步一个 `Steps.Step`，末尾点缀结束标记。

```
┌─ Card ──────────────────────────────────┐
│ 🌊 浇花                        [已完成]  │
│ 14:30:23 ~ 15:02:45 · 2个步骤 · 32分钟  │
│ ─────────────────────────────────────── │
│ ● 执行中  注水池壹  load_0(0)  14:30:23 │
│   超时 15分 · 传感器: 水位满检测(禁用)    │
│ ● 已结束  等待  load_0(0)      14:45:23 │
│   超时 10分                              │
│ ─────────────────────────────────────── │
│ 流程完成 · 15:02:45                      │
└──────────────────────────────────────────┘
```

**步骤内信息**：步骤名（从 message 提取）、`load_X(目标值)`、超时（formatSeconds 格式化）、传感器中断状态。

**结束标记**：
- `finish` → 绿色"完成"标签 + "流程执行完毕 · HH:MM:SS"
- `terminate` → 黄色"已终止"标签 + "手动终止 · HH:MM:SS"
- `pending` → 黄色"进行中"标签 + 底部提示"缺少完成事件（设备可能断电或离线）"

**pending 状态差异**：
- 时间区间显示为 `15:10:00 ~ ???`
- 用时改为"已运行 X分钟"（用最后一条事件时间到当前时间的差）

#### 3.3 page.tsx 调用

```tsx
const groups = groupByProcess(logs);
groups.map(g => g.type === 'boot'
  ? <BootCard group={g} key={...} />
  : <ProcessCard group={g} key={...} />
)
```

### 四、内容美化

#### 4.1 负载值格式化

```typescript
export function formatLoadValue(component: string, value: unknown): string {
  if (value === null || value === undefined) return `${component}(空)`;
  return `${component}(${String(value)})`;
}
```

只展示 end（目标值），不展示 begin。`load_1: 192` → `load_1(192)`。

#### 4.2 message 占位符中的负载

`parseLogMessage` 不变——`{componentKey:load_0}` 等占位符保持原样高亮。

### 五、边界情况

| 场景 | 处理 |
|------|------|
| 无 execute 事件（仅 bootstrap） | 独立开机卡片，注明"未触发流程执行，自动休眠" |
| 有 execute 无 finish/terminate | pending 状态（黄色），结束时间 ???，底部提示原因 |
| 有 execute 有 terminate | "已终止"（黄色），步骤链完整，末尾"手动终止" |
| 多条 execute 连续出现 | 前一个自动闭合为 pending，后一个正常开始 |
| change 事件无 message | 步骤标题用 state.type 映射，描述显示组件和负载值 |
| state.loads 为空 | 摘要行不显示负载读数 |
| 全部为 heartbeat | 不产生卡片，显示空状态 |
| 无传感器读数 | 开机卡片仅显示时间/唤醒原因/休眠时长 |

### 六、文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `app/watering/services/db.ts` | 改 | `getDeviceLogs` 加 7 天过滤 |
| `app/watering/components/log-card.tsx` | 改 | 新增 `ProcessGroup`、`groupByProcess`、`formatLoadValue`、`BootCard`、`ProcessCard`；删除 `groupByStateId`、`LogGroup`、`LogCard`、`getGroupStatus`；保留其余工具函数 |
| `app/watering/(subpages)/logs/[chipId]/page.tsx` | 改 | 导入改为新函数和新组件 |
| `__tests__/watering/log-card-utils.test.ts` | 改 | `groupByStateId` 测试替换为 `groupByProcess`；新增 `formatLoadValue` 测试 |

### 七、不变

- `useDeviceLogs` hook
- `get-logs` / `clear-logs` / `push-state` / `get-state`
- `writeDeviceLog` 签名和实现
- 数据库表结构
- 其余工具函数（`formatDuration`、`formatCause`、`calcSleepDuration`、`formatSeconds`、`parseLogMessage`、`formatMessage`、`extractProcessNames`、`countSteps` 等）
- ROM 固件代码
