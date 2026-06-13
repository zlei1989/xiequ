# LogCard 单一职责重构

**日期**：2026-06-14
**状态**：已确认

## 目标

将 `LogCard` 从"接收全部日志 → 内部分组 → 循环渲染多张卡片"的重型组件，拆分为职责单一的"纯卡片组件"，分组与循环逻辑上提到调用方 `page.tsx`。

## 背景

当前 `LogCard` 做了三件事：分组、排序、渲染。组件签名是 `logs: LogItem[]`，内部调用 `groupByStateId` 后用 `groups.map()` 渲染多个 `<Card>`。

这导致：
- 组件职责过重，不易复用（想渲染单个 group 无法直接使用）
- 组件内部混合了数据转换逻辑和 UI 渲染逻辑
- 空状态防御重复（`page.tsx` 已处理空数据，`LogCard` 内部又处理了一次）

## 设计

### 组件签名变更

**log-card.tsx**：

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| Props | `{ logs: LogItem[] }` | `{ group: LogGroup }` |
| 新增导出类型 | — | `export type LogGroup = { stateId: string; items: LogItem[] }` |
| 空状态处理 | 组件内 ErrorBlock | 删除，由 page.tsx 负责 |
| 分组调用 | 组件内调用 `groupByStateId` | 删除，由 page.tsx 调用 |

组件内部只保留：
- 单个 `<Card>` 渲染，包含 `<Steps>` 列表
- `getGroupStatus` / `formatDuration` / `hasExecute` / `formatMessage` 等工具函数调用（不删）
- `groupByStateId` 工具函数保留在文件中（供 page.tsx 导入 + 测试引用）

**page.tsx**：

```tsx
import { LogCard, groupByStateId, type LogGroup } from '../../../components/log-card';

// 有数据分支中：
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

### 不变的部分

- 所有纯工具函数保留在 `log-card.tsx`，不作移动
- 测试文件 `__tests__/watering/log-card-utils.test.ts` 零改动（只测纯函数）
- `useDeviceLogs` hook 零改动
- UI 渲染结果完全一致

## 收益

- **单一职责**：`LogCard` 只管一张卡片的渲染
- **可复用**：将来如需在别处渲染单个日志组，可直接使用
- **可测试**：组件变为纯展示组件，测试只需传入一个 `LogGroup`

## 不涉及

- 不移动工具函数到独立文件
- 不修改测试
- 不改变 UI 外观
