# 浇花模块日志缺失修复设计

## 问题

三个关键路径未写入 `writeDeviceLog()`，导致日志页（`/watering/logs/[chipId]`）查不到记录：

1. **界面手动启动**：`set-state.ts` 中 `setDeviceSwitch('on')` 只用了 `console.log`，未写入持久化日志。更严重的是，缺少 `execute` 日志导致 `groupByProcess()` 无法创建流程分组，后续 ROM 上报的 `change` 事件被静默丢弃
2. **计划任务触发**：`get-state/route.ts` 中 `checkAndExecuteSchedule()` 成功触发后未写入日志
3. **开机执行**：`push-state/route.ts` 中 bootstrap 分支已有 `execute` 日志，但缺少 `trigger` 字段，无法区分触发来源

## 设计

### 数据层：补 writeDeviceLog 调用

在三个路径补上 `writeDeviceLog()` 调用，state 对象中新增 `trigger` 字段。

**trigger 字段值域**：`'manual' | 'schedule' | 'bootstrap'`

#### 1. set-state.ts — 界面手动启动

在 `saveDeviceState` + `execCallback` 之后补写日志：

```typescript
await writeDeviceLog(
  chipId, 'execute', config.macAddress,
  { index: processIdx, trigger: 'manual' },
  undefined,  // 无传感器读数
  state.stateId,
);
```

- `macAddress` 取自已查询的 `config.macAddress`
- 日志写入失败不应阻断主流程，用 try/catch 包裹并 console.error

#### 2. get-state/route.ts — 计划任务触发

`checkAndExecuteSchedule()` 签名新增 `macAddress: string` 参数，从外层 GET handler 传入。在 `saveDeviceState` 之后写入：

```typescript
await writeDeviceLog(
  config.chipId, 'execute', macAddress,
  { index: schedule.process, trigger: 'schedule' },
  undefined,
  state.stateId,
);
```

- 日志写入失败不阻断，try/catch + console.error

#### 3. push-state/route.ts — 开机执行（已有，补字段）

bootstrap 分支的 `writeDeviceLog` 调用已存在，只需在 state 对象中补 `trigger` 字段：

```typescript
// 原来：{ index: state.index }
// 改为：
{ index: state.index, trigger: 'bootstrap' }
```

### UI 层：ProcessCard / BootCard 展示触发来源

#### ProcessCard 改动

从流程组的第一条 `execute` 日志的 `state.trigger` 提取触发来源，在摘要行展示标签。

展示效果：`2026-06-18 · 手动启动 · 共3步 · 用5分钟`

| trigger | 标签文字 | Tag color |
|---------|---------|-----------|
| `manual` | 手动启动 | `primary` |
| `schedule` | 定时启动 | `warning` |
| `bootstrap` | 开机执行 | `success` |
| 缺失/未知 | 不显示 | — |

实现：

- `ProcessGroup` 类型新增 `trigger?: string` 字段
- `groupByProcess()` 解析 `execute` 事件的 `state.trigger` 赋值给 `ProcessGroup`
- ProcessCard 渲染时读取 `trigger`，查映射表展示标签

#### BootCard 改动

如果 bootstrap 触发了开机执行（`trigger: 'bootstrap'` 的 execute 日志紧随 bootstrap 之后），在开机卡描述行追加标签。

展示效果：`正常上电 · 休眠2小时 · 开机执行`

实现：BootCard 从 `allLogs` 中查找同一 bootstrap 后是否存在 `trigger: 'bootstrap'` 的 execute 日志，有则展示。

#### 类型定义

在 `log-card.tsx` 中新增触发来源映射：

```typescript
const triggerLabels: Record<string, string> = {
  manual: '手动启动',
  schedule: '定时启动',
  bootstrap: '开机执行',
};

const triggerColors: Record<string, string> = {
  manual: 'primary',
  schedule: 'warning',
  bootstrap: 'success',
};
```

## 不在范围内

- `groupByProcess()` 对孤立 `change` 事件的兜底处理（历史数据保持现状）
- 服务端控制台日志补齐（本设计聚焦日志页展示）
