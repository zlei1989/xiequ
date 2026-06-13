# LogCard 单一职责重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LogCard 从"接收全部日志 → 内部分组循环渲染"重构为"纯单卡片组件"，循环逻辑上提到 page.tsx。

**Architecture:** LogCard 改为接收单个 `LogGroup` 对象，page.tsx 负责调用 `groupByStateId` 并 `.map()` 循环渲染。工具函数全部保留在原文件不动。

**Tech Stack:** Next.js App Router, antd-mobile, TypeScript

---

### Task 1: 重构 LogCard 为单卡片组件

**文件:**
- 修改: `app/watering/components/log-card.tsx`

- [ ] **Step 1: 新增 LogGroup 类型导出，修改组件签名**

在 `log-card.tsx` 中，`LogItem` 类型定义后新增 `LogGroup` 类型导出：

```tsx
/** 按 stateId 分组后的日志组 */
export type LogGroup = { stateId: string; items: LogItem[] };
```

将组件签名从 `{ logs }: { logs: LogItem[] }` 改为 `{ group }: { group: LogGroup }`：

```tsx
export function LogCard({ group }: { group: LogGroup }) {
```

- [ ] **Step 2: 删除组件内部的空状态处理**

删除以下代码块（page.tsx 已处理空数据）：

```tsx
// 删除：
if (logs.length === 0) {
  return (
    <ErrorBlock
      status="empty"
      title="暂无日志"
    />
  );
}
```

同时从 `import` 中移除 `ErrorBlock`：

```tsx
// 变更前：
import { Card, Space, Steps, Tag, ErrorBlock } from 'antd-mobile';
// 变更后：
import { Card, Space, Steps, Tag } from 'antd-mobile';
```

- [ ] **Step 3: 删除组件内部的分组调用和外层循环**

删除 `const groups = groupByStateId(logs);` 行。

将组件返回值从 `groups.map(...)` 包裹的 `<Space>` 改为直接返回单个 `<Card>`：

删除外层 `<Space block direction="vertical">` 和 `{groups.map((group) => {`，以及结尾的 `})}` 和 `</Space>`。

`group` 变量现在直接来自 props，不再来自 map 回调参数。

**变更后的完整组件函数体：**

```tsx
export function LogCard({ group }: { group: LogGroup }) {
  const groupStatus = getGroupStatus(group.items);
  const duration = hasExecute(group.items) ? formatDuration(group.items) : null;

  return (
    <Card
      extra={
        <Tag color={groupStatus.color}>
          {groupStatus.label}
        </Tag>
      }
      key={group.stateId}
      title={`State ID: ${group.stateId}`}
    >
      <Steps direction="vertical">
        {group.items.map((item, idx) => (
          <Steps.Step
            description={
              <span className="text-[13px] text-gray-700">
                {formatMessage(item)}
              </span>
            }
            key={`${group.stateId}-${idx}`}
            status={getStepStatus(item.event)}
            title={
              <Space align="center">
                <Tag color={eventColors[item.event] || 'default'}>
                  {eventLabels[item.event] || item.event}
                </Tag>
                <span className="text-xs text-gray-400">
                  {formatTime(item.createdTime)}
                </span>
              </Space>
            }
          />
        ))}
      </Steps>
      {duration && (
        <div className="mt-2 flex justify-end text-xs text-gray-400">
          用时 {duration}
        </div>
      )}
    </Card>
  );
}
```

注意：`key={group.stateId}` 在 Card 上保留，但外层循环在 page.tsx 中会给 `<LogCard key=...>` 加 key，所以 Card 上的 key 可以保留（无害）或移除。保留以避免视觉差异。

- [ ] **Step 4: 确认工具函数全部保留**

确认以下导出均未删除：
- `groupByStateId`（供 page.tsx 导入）
- `formatDuration`
- `formatMessage`
- `LogItem` 类型
- 新增的 `LogGroup` 类型

---

### Task 2: 修改 page.tsx 循环调用

**文件:**
- 修改: `app/watering/(subpages)/logs/[chipId]/page.tsx`

- [ ] **Step 1: 更新 import**

```tsx
// 变更前：
import { LogCard } from '../../../components/log-card';
// 变更后：
import { LogCard, groupByStateId, type LogGroup } from '../../../components/log-card';
```

- [ ] **Step 2: 修改 renderContent 中有数据分支**

将第108-115行的：

```tsx
    // 有日志数据 — 下拉刷新包裹
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <List>
          <LogCard logs={logs} />
        </List>
      </PullToRefresh>
    );
```

改为：

```tsx
    // 有日志数据 — 下拉刷新包裹
    const groups: LogGroup[] = groupByStateId(logs);
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <List>
          {groups.map((group) => (
            <LogCard key={group.stateId} group={group} />
          ))}
        </List>
      </PullToRefresh>
    );
```

注意：`const groups` 声明需放在 return 之前，即在 `renderContent` 函数体内、return 语句前。

- [ ] **Step 3: 移除 page.tsx 中的空数据 ErrorBlock 重复检查**

实际上 page.tsx 第99-106行已有空数据分支 `if (!loading && logs.length === 0)`，无需改动。只是确认 LogCard 不再重复处理空状态后，这里的逻辑仍然正确。

---

### Task 3: 格式化、检查、测试

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行类型检查和 lint**

```bash
npm run check
```

预期：零错误。如有错误，修复后再继续。

- [ ] **Step 3: 运行现有测试**

```bash
npm run test
```

重点关注 `log-card-utils.test.ts` 全部通过（该测试文件无需任何改动）。

- [ ] **Step 4: 提交**

```bash
git add app/watering/components/log-card.tsx app/watering/\(subpages\)/logs/\[chipId\]/page.tsx
git commit -m "refactor: LogCard 改为单卡片组件，循环逻辑上提到 page.tsx"
```

---

### 验收标准

- `npm run check` 零错误
- `npm run test` 全部通过
- Dev server 中日志页渲染结果与重构前一致
