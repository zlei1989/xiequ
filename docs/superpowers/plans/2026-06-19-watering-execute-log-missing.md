# 浇花模块日志缺失修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐界面启动和计划任务触发的持久化日志，在日志页展示触发来源标签

**Architecture:** 在三个服务端路径补上 `writeDeviceLog()` 调用（state 中带 `trigger` 字段），前端 `groupByProcess()` 提取 trigger 传给 `ProcessGroup`，ProcessCard/BootCard 渲染触发来源标签

**Tech Stack:** Next.js App Router (Server Actions + API Routes), SQLite (sql.js), antd-mobile, vitest

---

### Task 1: push-state bootstrap execute 日志补 trigger 字段

**Files:**
- Modify: `app/watering/api/push-state/route.ts:117`

- [ ] **Step 1: 修改 bootstrap 分支的 writeDeviceLog 调用，补 trigger 字段**

将第 117 行的：
```typescript
await writeDeviceLog(chipId, 'execute', macAddress, { index: state.index }, bootstrapReadings, state.stateId);
```
改为：
```typescript
await writeDeviceLog(chipId, 'execute', macAddress, { index: state.index, trigger: 'bootstrap' }, bootstrapReadings, state.stateId);
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/api/push-state/route.ts
git commit -m "feat: bootstrap execute 日志补 trigger 字段"
```

---

### Task 2: set-state 界面启动补 writeDeviceLog

**Files:**
- Modify: `app/watering/actions/set-state.ts`

- [ ] **Step 1: 导入 writeDeviceLog**

在文件顶部的 import 区域（第 14 行 `import { execCallback }` 后），修改 db 导入：

```typescript
import { getDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog } from '../services/db';
```

- [ ] **Step 2: 在 setDeviceSwitch 的 on 分支中，execCallback 之后补写日志**

在第 74 行 `execCallback(chipId);` 之后添加：

```typescript
    // 写入执行日志（trigger 标识界面手动启动，不阻断主流程）
    try {
      await writeDeviceLog(chipId, 'execute', config.macAddress, { index: processIdx, trigger: 'manual' }, undefined, state.stateId);
    } catch (logErr) {
      console.error('[Watering] 写入执行日志失败:', { chipId, switchState }, logErr);
    }
```

注意：此段代码在 `if (switchState === 'on')` 分支内，`execCallback(chipId);` 之后，`state.stateId = newId();` 之前的位置实际是在 state 赋值完成之后。具体插入点在第 74 行 `execCallback(chipId);` 之后。

- [ ] **Step 3: 提交**

```bash
git add app/watering/actions/set-state.ts
git commit -m "feat: 界面手动启动补 writeDeviceLog，trigger=manual"
```

---

### Task 3: get-state 计划任务触发补 writeDeviceLog

**Files:**
- Modify: `app/watering/api/get-state/route.ts`

- [ ] **Step 1: 导入 writeDeviceLog**

在第 19 行的 db 导入中添加 `writeDeviceLog`：

```typescript
import { getDeviceState, getDeviceConfig, updateTick, insertScheduleLog, hasScheduleLog, saveDeviceState, saveDeviceConfig, writeDeviceLog, writeSensorLog, getSensorLogs } from '@/app/watering/services/db';
```

- [ ] **Step 2: checkAndExecuteSchedule 签名新增 macAddress 参数**

将 `checkAndExecuteSchedule` 函数签名从：
```typescript
async function checkAndExecuteSchedule(
  config: DeviceConfig,
  state: DeviceState,
  now: Date,
): Promise<boolean> {
```
改为：
```typescript
async function checkAndExecuteSchedule(
  config: DeviceConfig,
  state: DeviceState,
  now: Date,
  macAddress: string,
): Promise<boolean> {
```

- [ ] **Step 3: checkAndExecuteSchedule 内，saveDeviceState 之后补写日志**

在 `await saveDeviceState(state);` 之后（约第 294 行之后），`if (configNeedsSave)` 之前，添加：

```typescript
      // 写入执行日志（trigger 标识计划任务触发，不阻断主流程）
      try {
        await writeDeviceLog(config.chipId, 'execute', macAddress, { index: schedule.process, trigger: 'schedule' }, undefined, state.stateId);
      } catch (logErr) {
        console.error('[Watering] 写入计划任务执行日志失败:', { chipId: config.chipId, scheduleType: schedule.type }, logErr);
      }
```

- [ ] **Step 4: 更新 GET handler 中的调用点**

将 GET handler 中（约第 480 行）的：
```typescript
      await checkAndExecuteSchedule(config, state, new Date());
```
改为：
```typescript
      await checkAndExecuteSchedule(config, state, new Date(), macAddress);
```

- [ ] **Step 5: 提交**

```bash
git add app/watering/api/get-state/route.ts
git commit -m "feat: 计划任务触发补 writeDeviceLog，trigger=schedule"
```

---

### Task 4: log-card groupByProcess 提取 trigger 字段（TDD）

**Files:**
- Modify: `app/watering/components/log-card.tsx`
- Modify: `__tests__/watering/log-card-utils.test.ts`

- [ ] **Step 1: 写失败测试 — groupByProcess 提取 execute 事件 state.trigger**

在 `__tests__/watering/log-card-utils.test.ts` 的 `groupByProcess` describe 块末尾添加：

```typescript
  it('execute 事件的 state.trigger 提取到 ProcessGroup.trigger', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', state: { trigger: 'manual' } }),
      makeLog({ event: 'change', createdTime: '2026-06-13T10:00:02.000Z' }),
      makeLog({ event: 'finish', createdTime: '2026-06-13T10:00:05.000Z' }),
    ];
    const result = groupByProcess(logs);
    expect(result[0]?.trigger).toBe('manual');
  });

  it('execute 事件无 trigger 时 ProcessGroup.trigger 为 undefined', () => {
    const logs = [
      makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', state: { index: 0 } }),
    ];
    const result = groupByProcess(logs);
    expect(result[0]?.trigger).toBeUndefined();
  });

  it('不同 trigger 值正确提取', () => {
    const logs1 = [makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', state: { trigger: 'schedule' } })];
    const logs2 = [makeLog({ event: 'execute', createdTime: '2026-06-13T10:00:01.000Z', state: { trigger: 'bootstrap' } })];
    expect(groupByProcess(logs1)[0]?.trigger).toBe('schedule');
    expect(groupByProcess(logs2)[0]?.trigger).toBe('bootstrap');
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run __tests__/watering/log-card-utils.test.ts`
Expected: 新增测试 FAIL — `ProcessGroup` 类型无 `trigger` 字段，`groupByProcess` 未赋值

- [ ] **Step 3: ProcessGroup 类型新增 trigger 字段**

在 `app/watering/components/log-card.tsx` 的 `ProcessGroup` 类型定义中添加 `trigger`：

```typescript
export type ProcessGroup = {
  type: 'boot' | 'process';
  bootItem?: LogItem;
  processName?: string;
  items: LogItem[];
  endType?: 'finish' | 'terminate' | 'pending';
  /** 触发来源：manual=界面手动，schedule=计划任务，bootstrap=开机执行 */
  trigger?: string;
};
```

- [ ] **Step 4: groupByProcess 中 execute 分支提取 trigger 赋值**

在 `groupByProcess` 函数的 `case 'execute'` 分支中，从 `log.state` 提取 `trigger` 并赋值给 `ProcessGroup`。

将 execute case 中的 `currentProcess` 赋值从：
```typescript
        currentProcess = {
          type: 'process',
          processName,
          items: [],
          endType: undefined,
        };
```
改为：
```typescript
        const trigger = typeof stateObj?.trigger === 'string' ? stateObj.trigger : undefined;
        currentProcess = {
          type: 'process',
          processName,
          items: [],
          endType: undefined,
          trigger,
        };
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run __tests__/watering/log-card-utils.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add app/watering/components/log-card.tsx __tests__/watering/log-card-utils.test.ts
git commit -m "feat: groupByProcess 提取 execute 事件的 trigger 字段"
```

---

### Task 5: ProcessCard 展示触发来源标签

**Files:**
- Modify: `app/watering/components/log-card.tsx`

- [ ] **Step 1: 新增触发来源映射常量**

在 `log-card.tsx` 的常量区域（`changeTypeColors` 之后）添加：

```typescript
/** 触发来源中文标签 */
export const triggerLabels: Record<string, string> = {
  manual: '手动启动',
  schedule: '定时启动',
  bootstrap: '开机执行',
};

/** 触发来源 Tag 颜色 */
export const triggerColors: Record<string, string> = {
  manual: 'primary',
  schedule: 'warning',
  bootstrap: 'success',
};
```

- [ ] **Step 2: ProcessCard 摘要行展示 trigger 标签**

在 `ProcessCard` 组件中，摘要行渲染之前，提取 trigger 信息：

```typescript
  // 触发来源标签
  const triggerValue = group.trigger;
  const triggerLabel = triggerValue ? triggerLabels[triggerValue] : undefined;
  const triggerColor = triggerValue ? triggerColors[triggerValue] : undefined;
```

然后在摘要行的 JSX 中，在 `summaryText` 之后追加 trigger 标签：

将：
```tsx
      {summaryText && (
        <div className="mb-2 text-xs text-gray-400">{summaryText}</div>
      )}
```
改为：
```tsx
      {(summaryText || triggerLabel) && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
          {summaryText && <span>{summaryText}</span>}
          {triggerLabel && triggerColor && (
            <Tag color={triggerColor} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
              {triggerLabel}
            </Tag>
          )}
        </div>
      )}
```

- [ ] **Step 3: 提交**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: ProcessCard 摘要行展示触发来源标签"
```

---

### Task 6: BootCard 展示开机执行标签

**Files:**
- Modify: `app/watering/components/log-card.tsx`

- [ ] **Step 1: BootCard 中检测 bootstrap 触发的开机执行**

在 `BootCard` 组件中，`descParts` 构建之后、`descText` 生成之前，添加开机执行检测：

在现有代码 `const descText = descParts.join(' · ');` 之前添加：

```typescript
  // 检测是否有开机执行（bootstrap 后紧跟 trigger='bootstrap' 的 execute 日志）
  const hasBootExec = allLogs.some(
    (log) =>
      log.event === 'execute' &&
      (log.state as Record<string, unknown> | undefined)?.trigger === 'bootstrap' &&
      log.createdTime > item.createdTime &&
      new Date(log.createdTime).getTime() - new Date(item.createdTime).getTime() < 5000,
  );
  if (hasBootExec) descParts.push('开机执行');
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/components/log-card.tsx
git commit -m "feat: BootCard 展示开机执行标签"
```

---

### Task 7: 格式化、类型检查、测试验证

**Files:**
- All modified files

- [ ] **Step 1: 运行格式化**

Run: `npm run format`

- [ ] **Step 2: 运行类型检查和 lint**

Run: `npm run check`

- [ ] **Step 3: 修复所有错误（如有）**

根据 check 输出修复类型错误或 lint 问题，然后重新运行 `npm run check` 确认通过。

- [ ] **Step 4: 运行全部测试**

Run: `npm run test`

- [ ] **Step 5: 修复测试失败（如有）并重新运行**

确保所有测试通过。

- [ ] **Step 6: 提交（如有格式化/修复变更）**

```bash
git add -A
git commit -m "chore: 格式化和类型检查修复"
```
