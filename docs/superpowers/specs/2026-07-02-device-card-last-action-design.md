# 设备卡片最后执行信息 — 设计文档

## 目标

浇花模块首页设备卡片底部，显示最后一次进程执行完成的信息。

**格式：** `3小时前 · 浇水 · 用1小时`

## 显示规则

- 无执行记录 → 不显示该行
- 最后一次完成时间距今超过 3 天（259200 秒）→ 不显示
- 否则显示：相对时间 · 动作名称 · 耗时

## 数据来源

数据存储在 `watering_device_state` 表，每次 `finish` 事件时写入。

### 新增列

| 列名 | 类型 | 说明 |
|------|------|------|
| `last_action_name` | TEXT | 最后完成的进程名（`current_process.name`） |
| `last_action_duration` | INTEGER | 进程执行耗时（毫秒），= `finished_at - started_at` |
| `last_action_started_at` | INTEGER | 进程开始时间戳（毫秒），持久保留不删除 |
| `last_action_finished_at` | INTEGER | 进程完成时间戳（毫秒） |

### 写入时机

| 时机 | 写入字段 | 说明 |
|------|----------|------|
| 进程启动（execute/bootstrap/set-state/schedule） | `last_action_started_at` = Date.now() | 标记开始时间 |
| 进程完成（finish） | 写入 3 个 `last_action_*` 字段，清除执行上下文 | 保留 `last_action_started_at` 不删除 |

### 进程启动的所有路径

1. `api/push-state/route.ts` — `execute` 事件（设备按钮触发）
2. `api/push-state/route.ts` — `bootstrap` 触发 bootExec
3. `api/get-state/route.ts` — schedule 计划任务触发
4. `actions/set-state.ts` — 用户从 UI 点击按钮启动

以上 4 个路径都需要写入 `last_action_started_at`。

## 类型扩展

```typescript
// DeviceState 新增：
lastActionName?: string;
lastActionDuration?: number;
lastActionStartedAt?: number;
lastActionFinishedAt?: number;

// DeviceItem 新增：
lastFinish?: {
  actionName: string;
  duration: number;    // ms
  finishedAt: number;  // ms timestamp
};
```

## 时间工具函数

新建 `app/watering/utils/format-time.ts`：

| 函数 | 输入 | 输出示例 | 来源 |
|------|------|----------|------|
| `formatSimpleDuration(seconds)` | 秒数 | `"刚刚"`, `"3分钟"`, `"5小时"` | 从 `log-card.tsx` 抽取 |
| `formatRelativeTime(msAgo)` | 距今毫秒 | `"刚刚"`, `"3分钟前"`, `"5小时前"` | 新增 |
| `formatActionDuration(ms)` | 毫秒 | `""`, `"用刚刚"`, `"用5小时"` | 新增 |

`log-card.tsx` 中 `formatSimpleDuration`、`formatDuration`、`formatSeconds` 改为从新文件导入，保持行为不变。

## 组件渲染

在 `device-card.tsx` 流程按钮下方、步骤进度上方：

```tsx
{device.lastFinish && (Date.now() - device.lastFinish.finishedAt) < 3 * 24 * 60 * 60 * 1000 && (
  <div className="mt-2 text-xs text-gray-400">
    {formatRelativeTime(Date.now() - device.lastFinish.finishedAt)}
    {' · '}
    {device.lastFinish.actionName}
    {' · '}
    {formatActionDuration(device.lastFinish.duration)}
  </div>
)}
```

## 改动文件清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `services/db.ts` | `initDb` 加 4 列、`saveDeviceState` upsert 新字段、`getAllDevices` 返回新字段 |
| 2 | `types.ts` | `DeviceState` 加 4 个可选字段、`DeviceItem` 加 `lastFinish?` |
| 3 | `api/push-state/route.ts` | execute/bootstrap/finish 写入对应字段 |
| 4 | `actions/set-state.ts` | 写入 `last_action_started_at` |
| 5 | `api/get-state/route.ts` | schedule 触发时写入 `last_action_started_at` |
| 6 | `utils/format-time.ts` | 新建，从 `log-card.tsx` 抽取 + 新增函数 |
| 7 | `components/log-card.tsx` | 改为从 `utils/format-time.ts` 导入 |
| 8 | `components/device-card.tsx` | 卡片底部渲染最后执行信息行 |
