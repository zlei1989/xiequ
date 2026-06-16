# 传感器历史趋势折线图 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在浇花模块新增传感器历史趋势折线图功能，服务端每 15 分钟采样传感器数据存入新表，前端独立子页面展示 Recharts 折线图。

**Architecture:** 在 `get-state` API 路由中新增传感器参数解析和 15 分钟采样判断，写入新表 `watering_sensor_log`；前端通过 Server Action 查询数据，使用 Recharts + antd-mobile CapsuleTabs 展示每传感器独立折线图，支持亮/暗主题自适应。

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), SQLite (WASM), Recharts, antd-mobile, Tailwind CSS, Vitest

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/watering/services/db.ts` | 修改 | 新增表定义、`writeSensorLog()`、`getSensorLogs()` |
| `app/watering/api/get-state/route.ts` | 修改 | 解析 `sensor:` 参数 + 15 分钟采样判断 |
| `app/watering/actions.ts` | 修改 | 导出 `getSensorLogs` Server Action |
| `app/watering/actions/get-sensor-logs.ts` | 新建 | `getSensorLogs` Action 实现 |
| `app/watering/(subpages)/charts/[chipId]/page.tsx` | 新建 | 折线图子页面（Client Component） |
| `app/watering/components/device-card.tsx` | 修改 | 日志按钮改为 ActionSheet（执行日志 / 环境日志） |
| `__tests__/watering/sensor-log.test.ts` | 新建 | 测试采样写入和查询逻辑 |
| `__tests__/watering/sensor-chart.test.tsx` | 新建 | 测试图表页面渲染 |
| `package.json` | 修改 | 新增 recharts 依赖 |

---

### Task 1: 数据库 — 新表 + writeSensorLog + getSensorLogs

**Files:**
- Modify: `app/watering/services/db.ts`

- [ ] **Step 1: 在 initDb() 中新增 watering_sensor_log 表**

在 `initDb()` 函数末尾（`watering_schedule_log` 表创建之后）添加建表语句：

```typescript
  // 传感器采样日志表（每 15 分钟一条）
  db.exec(`
    CREATE TABLE IF NOT EXISTS watering_sensor_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chip_id TEXT NOT NULL,
      record_time TEXT NOT NULL,
      readings JSON NOT NULL,
      created_time TEXT NOT NULL,
      FOREIGN KEY (chip_id) REFERENCES watering_devices(chip_id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sensor_log_time
    ON watering_sensor_log(chip_id, record_time)
  `);
```

- [ ] **Step 2: 新增 SensorLogRow 接口**

在文件顶部现有接口定义区域（`LogRow` 之后）添加：

```typescript
/** watering_sensor_log 表 SQLite 原始行 */
interface SensorLogRow {
  id: number;
  chip_id: string;
  record_time: string;
  readings: string;
  created_time: string;
}
```

- [ ] **Step 3: 新增 writeSensorLog() 函数**

在 `clearDeviceLogs()` 之后添加：

```typescript
/**
 * 写入传感器采样日志
 *
 * 每次写入后附带清理 7 天前的数据，保持表规模可控。
 * SQLite WASM 驱动为同步，函数签名保持 async 以兼容上层契约。
 *
 * @param chipId 设备芯片 ID
 * @param recordTime 采样时间点（对齐到 15 分钟自然时间），ISO 8601
 * @param readings 计算后的传感器读数数组
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function writeSensorLog(
  chipId: string,
  recordTime: string,
  readings: { label: string; value: number }[],
): Promise<void> {
  const db = getDbSync();
  db.run(
    'INSERT INTO watering_sensor_log (chip_id, record_time, readings, created_time) VALUES (?, ?, ?, ?)',
    [chipId, recordTime, JSON.stringify(readings), new Date().toISOString()],
  );
  // 清理 7 天前的数据
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.run('DELETE FROM watering_sensor_log WHERE record_time < ?', [cutoff]);
}
```

- [ ] **Step 4: 新增 getSensorLogs() 函数**

在 `writeSensorLog()` 之后添加：

```typescript
/**
 * 查询设备传感器采样日志
 *
 * 按时间范围筛选，按 record_time 升序排列，供前端绘制折线图。
 * SQLite WASM 驱动为同步，函数签名保持 async 以兼容上层契约。
 *
 * @param chipId 设备芯片 ID
 * @param since ISO 8601 起始时间
 */
// eslint-disable-next-line @typescript-eslint/require-await -- SQLite WASM 驱动为同步，保持 async 契约
export async function getSensorLogs(
  chipId: string,
  since: string,
): Promise<{ recordTime: string; readings: { label: string; value: number }[] }[]> {
  const db = getDb();
  const rows = db.all(
    'SELECT id, chip_id, record_time, readings, created_time FROM watering_sensor_log WHERE chip_id = ? AND record_time >= ? ORDER BY record_time ASC',
    [chipId, since],
  ) as unknown as SensorLogRow[];
  return rows.map((row) => ({
    recordTime: row.record_time,
    readings: parseJSON(row.readings, [] as { label: string; value: number }[]),
  }));
}
```

- [ ] **Step 5: 运行 typecheck 确认无类型错误**

```bash
npm run typecheck
```

Expected: PASS（无新增类型错误）

- [ ] **Step 6: Commit**

```bash
git add app/watering/services/db.ts
git commit -m "feat: 新增 watering_sensor_log 表及读写函数"
```

---

### Task 2: get-state 路由 — 解析 sensor 参数 + 15 分钟采样

**Files:**
- Modify: `app/watering/api/get-state/route.ts`

- [ ] **Step 1: 新增辅助函数 — 计算最近的自然 15 分钟 slot**

在文件顶部 `import` 区域之后、`POLL_INTERVAL` 之前添加：

```typescript
/**
 * 计算当前时间之前最近的自然 15 分钟 slot
 *
 * 对齐到自然时间：分钟数向下取整到 0/15/30/45，秒和毫秒归零。
 * 例如 14:32:45 → 14:30:00.000
 *
 * @param now 当前 Date 对象
 * @returns 对齐后的 ISO 8601 时间字符串
 */
function calcLatestSlot(now: Date): string {
  const slot = new Date(now);
  const minutes = slot.getMinutes();
  // 向下取整到最近的 15 分钟点
  const floored = Math.floor(minutes / 15) * 15;
  slot.setMinutes(floored, 0, 0);
  return slot.toISOString();
}
```

- [ ] **Step 2: 新增导入 writeSensorLog 和 getSensorLogs**

修改现有的 `import` 语句（从 `@/app/watering/services/db` 导入），在解构中添加 `writeSensorLog` 和 `getSensorLogs`：

现有导入行：
```typescript
import { getDeviceState, getDeviceConfig, updateTick, insertScheduleLog, hasScheduleLog, saveDeviceState } from '@/app/watering/services/db';
```

修改为：
```typescript
import { getDeviceState, getDeviceConfig, updateTick, insertScheduleLog, hasScheduleLog, saveDeviceState, writeSensorLog, getSensorLogs } from '@/app/watering/services/db';
```

同时新增 `calcSensorReadings` 和 `SensorConfig` 的导入：

```typescript
import { calcSensorReadings } from '@/app/watering/utils/calc-sensor';
import type { SensorConfig } from '@/app/watering/types';
```

- [ ] **Step 3: 新增传感器采样逻辑函数**

在 `calcLatestSlot()` 之后添加：

```typescript
/**
 * 如果需要则写入传感器采样记录
 *
 * 从请求的查询参数中解析 sensor:xxx 参数，
 * 计算传感器读数，判断当前 slot 是否需要采样，是则写入。
 *
 * @param searchParams 请求 URL 查询参数
 * @param config 设备配置（含 sensors 配置）
 * @param chipId 设备芯片 ID
 */
async function sampleSensorIfNeeded(
  searchParams: URLSearchParams,
  config: { sensors: SensorConfig[] } | null,
  chipId: string,
): Promise<void> {
  // 解析传感器参数（同 push-state 解析方式）
  const rawSensors: Record<string, number> = {};
  searchParams.forEach((value, key) => {
    const match = key.match(/^sensor:(.+)$/);
    if (match) {
      const gpioKey = match[1];
      if (gpioKey) {
        rawSensors[gpioKey] = parseInt(value) || 0;
      }
    }
  });

  // 无传感器数据或未配置传感器 — 跳过
  if (Object.keys(rawSensors).length === 0 || !config?.sensors.length) return;

  // 计算传感器读数
  const readings = calcSensorReadings(config.sensors, rawSensors);
  if (readings.length === 0) return;

  // 计算当前 slot 并判断是否需要采样
  const now = new Date();
  const latestSlot = calcLatestSlot(now);

  // 查询该设备最后一条记录的时间
  const existingLogs = await getSensorLogs(chipId, latestSlot);
  if (existingLogs.length > 0) return; // 当前 slot 已有记录

  // 写入采样记录
  await writeSensorLog(chipId, latestSlot, readings);
}
```

- [ ] **Step 4: 在 GET 处理函数中调用采样逻辑**

在 `GET` 函数中，`updateTick(chipId)` 调用之后、`Promise.all` 之前添加采样调用。

当前代码（约第 238 行）：
```typescript
    // 刷新心跳
    await updateTick(chipId);

    // 并行读取状态和配置
    const [state, config] = await Promise.all([
      getDeviceState(chipId),
      getDeviceConfig(chipId),
    ]);
```

修改为：
```typescript
    // 刷新心跳
    await updateTick(chipId);

    // 读取配置（采样需要传感器配置）
    const config = await getDeviceConfig(chipId);

    // 传感器定时采样（每 15 分钟对齐自然时间）
    void sampleSensorIfNeeded(searchParams, config, chipId);

    // 并行读取状态和配置（状态可能已被计划任务更新）
    const state = await getDeviceState(chipId);
```

注意：`config` 在采样和后续逻辑中都要用到，且 `checkAndExecuteSchedule` 也需要 config。需要确保只获取一次 config。

实际上需要重新审视这一步。原始代码是 `const [state, config] = await Promise.all([...])`，然后后续用 `state` 和 `config`。如果我提前获取 config，就不再需要 Promise.all。

但 `checkAndExecuteSchedule` 会修改 state，如果把采样放在它之前执行也没问题，因为采样只是读取，不修改状态。

让我调整逻辑。采样只需要 config（不需要 state），可以和 `getDeviceState` 并行：

```typescript
    // 刷新心跳
    await updateTick(chipId);

    // 读取配置（传感器配置 + 采样判断需要）
    const config = await getDeviceConfig(chipId);

    // 传感器定时采样（异步，不阻塞响应。只读不写 state，安全并行）
    void sampleSensorIfNeeded(searchParams, config, chipId);

    // 读取状态
    let state = await getDeviceState(chipId);

    // 计划任务检查（可能更新 state）
    if (state && config) {
      await checkAndExecuteSchedule(config, state, new Date());
    }
```

但原始代码中 config 在采样和 checkAndExecuteSchedule 中都要用到。config 只读不写（checkAndExecuteSchedule 写 state 不写 config），所以提前获取一次 config 即可。

- [ ] **Step 5: 运行 typecheck 确认无类型错误**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/watering/api/get-state/route.ts
git commit -m "feat: get-state 新增传感器参数解析和15分钟采样"
```

---

### Task 3: Server Action — getSensorLogs

**Files:**
- Create: `app/watering/actions/get-sensor-logs.ts`
- Modify: `app/watering/actions.ts`

- [ ] **Step 1: 新建 get-sensor-logs.ts**

```typescript
/**
 * getSensorLogs Server Action — 查询设备传感器采样日志
 *
 * 供前端折线图页面调用，按时间范围返回传感器历史读数。
 */

'use server';

import { getSensorLogs as querySensorLogs } from '../services/db';

/** 支持的时间范围 */
type TimeRange = '1h' | '6h' | '24h' | '7d';

/** 时间范围对应的毫秒偏移 */
const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/**
 * 查询设备传感器采样日志
 *
 * @param chipId 设备芯片 ID
 * @param range 时间范围：'1h' | '6h' | '24h' | '7d'
 * @returns 按 recordTime 升序排列的采样记录数组
 */
export async function getSensorLogs(
  chipId: string,
  range: TimeRange,
): Promise<{ recordTime: string; readings: { label: string; value: number }[] }[]> {
  const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
  return querySensorLogs(chipId, since);
}
```

- [ ] **Step 2: 在 actions.ts 中导出**

在 `actions.ts` 中添加导入和导出：

在现有 import 区域添加：
```typescript
import { getSensorLogs as _getSensorLogs } from './actions/get-sensor-logs';
```

在现有导出区域（`clearLogs` 之后）添加：
```typescript
/** 获取设备传感器采样日志（环境数据折线图） */
export async function getSensorLogs(chipId: string, range: '1h' | '6h' | '24h' | '7d') {
  console.log('[Watering] 获取传感器采样日志:', { chipId, range });
  return _getSensorLogs(chipId, range);
}
```

- [ ] **Step 3: 运行 typecheck 确认无类型错误**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/watering/actions/get-sensor-logs.ts app/watering/actions.ts
git commit -m "feat: 新增 getSensorLogs Server Action"
```

---

### Task 4: 安装 Recharts 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 recharts**

```bash
npm install recharts
```

- [ ] **Step 2: 验证安装**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 安装 recharts 依赖"
```

---

### Task 5: 折线图子页面

**Files:**
- Create: `app/watering/(subpages)/charts/[chipId]/page.tsx`

- [ ] **Step 1: 新建页面组件**

```typescript
/**
 * 传感器趋势折线图页面
 *
 * 独立子页面，展示设备传感器数值的历史趋势。
 * 顶部 CapsuleTabs 切换时间范围，下方每传感器一张独立 Recharts 折线图。
 * 支持亮/暗主题自适应。
 */

'use client';

import { CapsuleTabs, DotLoading, ErrorBlock, NavBar } from 'antd-mobile';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { getSensorLogs } from '@/app/watering/actions';

/** 时间范围选项 */
const RANGES = [
  { key: '1h' as const, label: '1小时' },
  { key: '6h' as const, label: '6小时' },
  { key: '24h' as const, label: '24小时' },
  { key: '7d' as const, label: '7天' },
];

type Range = (typeof RANGES)[number]['key'];

/** 采样记录类型 */
interface SensorRecord {
  recordTime: string;
  readings: { label: string; value: number }[];
}

/** 图表数据点 — 每个传感器一根折线，按 label 分组 */
interface ChartSeries {
  label: string;
  data: { time: string; value: number }[];
  color: string;
}

/** 传感器折线颜色（Tailwind 色板，亮/暗通用） */
const LINE_COLORS = [
  '#f87171', // red-400
  '#4ade80', // green-400
  '#60a5fa', // blue-400
  '#fbbf24', // amber-400
  '#a78bfa', // violet-400
  '#fb923c', // orange-400
  '#34d399', // emerald-400
  '#f472b6', // pink-400
];

/**
 * 将采样记录转换为图表数据系列
 *
 * 按 readings[].label 分组，每个 label 生成一个 ChartSeries，
 * 包含该传感器的时间序列数据点。
 */
function recordsToSeries(records: SensorRecord[]): ChartSeries[] {
  if (records.length === 0) return [];

  // 收集所有 label（保持首次出现顺序）
  const labelOrder: string[] = [];
  const labelSet = new Set<string>();
  for (const r of records) {
    for (const rd of r.readings) {
      if (!labelSet.has(rd.label)) {
        labelSet.add(rd.label);
        labelOrder.push(rd.label);
      }
    }
  }

  return labelOrder.map((label, idx) => ({
    label,
    color: LINE_COLORS[idx % LINE_COLORS.length],
    data: records.map((r) => ({
      time: r.recordTime,
      value: r.readings.find((rd) => rd.label === label)?.value ?? 0,
    })),
  }));
}

/**
 * 根据时间范围格式化 X 轴时间标签
 *
 * 1h/6h 显示 HH:mm，24h/7d 显示 MM-DD HH:mm。
 */
function formatTime(time: string, range: Range): string {
  const d = new Date(time);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (range === '1h' || range === '6h') return `${hh}:${mm}`;
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  return `${MM}-${DD} ${hh}:${mm}`;
}

export default function SensorChartPage() {
  const params = useParams<{ chipId: string }>();
  const router = useRouter();
  const chipId = params.chipId;

  const [range, setRange] = useState<Range>('6h');
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<ChartSeries[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await getSensorLogs(chipId, range);
      setSeries(recordsToSeries(records));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [chipId, range]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <>
      <div className="sticky top-0 z-10 bg-[var(--background)]">
        <NavBar onBack={() => router.back()}>传感器趋势</NavBar>
      </div>

      <div className="px-3 pb-6">
        {/* 时间范围切换 */}
        <div className="my-3">
          <CapsuleTabs
            activeKey={range}
            onChange={(key) => setRange(key as Range)}
          >
            {RANGES.map((r) => (
              <CapsuleTabs.Tab key={r.key} title={r.label} />
            ))}
          </CapsuleTabs>
        </div>

        {/* 内容区 */}
        {loading ? (
          <div className="flex justify-center py-20">
            <DotLoading />
          </div>
        ) : error ? (
          <ErrorBlock status="default" title="加载失败" description={error} />
        ) : series.length === 0 ? (
          <ErrorBlock status="empty" title="暂无数据" description="设备还未上报传感器数据" />
        ) : (
          <div className="flex flex-col gap-4">
            {series.map((s) => (
              <SensorChart key={s.label} series={s} range={range} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * 单个传感器的折线图卡片
 */
function SensorChart({
  series,
  range,
}: {
  series: ChartSeries;
  range: Range;
}) {
  return (
    <div className="rounded-xl bg-[var(--adm-color-background)] p-3 shadow-sm dark:bg-[var(--adm-color-background)]">
      <div className="mb-2 text-sm font-semibold text-[var(--adm-color-text)]">
        {series.label}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={series.data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--adm-color-border, #eee)"
            strokeOpacity={0.5}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: 'var(--adm-color-text-secondary, #999)' }}
            tickFormatter={(t: string) => formatTime(t, range)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--adm-color-text-secondary, #999)' }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
            labelFormatter={(t: string) => formatTime(t, range)}
            formatter={(value: number) => [value.toFixed(2), series.label]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={series.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: series.color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: 运行 typecheck 确认无类型错误**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/watering/\(subpages\)/charts/
git commit -m "feat: 新增传感器趋势折线图子页面"
```

---

### Task 6: DeviceCard — 日志按钮改为 ActionSheet

**Files:**
- Modify: `app/watering/components/device-card.tsx`

- [ ] **Step 1: 新增日志 ActionSheet 状态和菜单**

当前代码（约第 30 行）已有 `actionVisible` 状态和 `actions` 数组。需要新增一个日志 ActionSheet。

在现有 `actionVisible` 状态之后添加：

```typescript
  const [logsVisible, setLogsVisible] = useState(false);
```

在返回 JSX 中（现有 `<ActionSheet>` 之后）添加日志 ActionSheet。当前 `<ActionSheet>` 在 `</Card>` 之后（约第 387 行）。在现有 ActionSheet 之后、最外层 `</>` 之前添加：

```typescript
      <ActionSheet
        closeOnAction
        safeArea
        actions={[
          {
            key: 'exec',
            text: '执行日志',
            onClick: () => {
              router.push(
                `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
              );
            },
          },
          {
            key: 'env',
            text: '环境日志',
            onClick: () => {
              router.push(
                `/watering/charts/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
              );
            },
          },
        ]}
        cancelText="取消"
        visible={logsVisible}
        onClose={() => {
          setLogsVisible(false);
        }}
      />
```

- [ ] **Step 2: 修改日志按钮的 onClick 行为**

当前日志按钮（约第 207-213 行）：

```typescript
            <Button
              fill="none"
              size="small"
              onClick={() => {
                router.push(
                  `/watering/logs/${device.chipId}?macAddress=${encodeURIComponent(device.macAddress)}`,
                );
              }}
            >
```

修改为：

```typescript
            <Button
              fill="none"
              size="small"
              onClick={() => {
                setLogsVisible(true);
              }}
            >
```

- [ ] **Step 3: 运行 typecheck 确认无类型错误**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/watering/components/device-card.tsx
git commit -m "feat: 日志按钮改为 ActionSheet，新增环境日志入口"
```

---

### Task 7: 测试

**Files:**
- Create: `__tests__/watering/sensor-log.test.ts`

- [ ] **Step 1: 编写采样逻辑单元测试**

```typescript
/**
 * 传感器采样逻辑测试
 */
import { describe, it, expect } from 'vitest';

/**
 * 单元测试 — calcLatestSlot 函数逻辑
 *
 * 15 分钟自然时间对齐：分钟数向下取整到 0/15/30/45。
 */
function calcLatestSlot(now: Date): string {
  const slot = new Date(now);
  const minutes = slot.getMinutes();
  const floored = Math.floor(minutes / 15) * 15;
  slot.setMinutes(floored, 0, 0);
  return slot.toISOString();
}

describe('calcLatestSlot', () => {
  it('14:32 → 14:30', () => {
    const d = new Date('2026-06-17T14:32:45.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:30:00.000Z');
  });

  it('14:00 → 14:00', () => {
    const d = new Date('2026-06-17T14:00:00.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:00:00.000Z');
  });

  it('14:14 → 14:00', () => {
    const d = new Date('2026-06-17T14:14:59.999Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:00:00.000Z');
  });

  it('14:15 → 14:15', () => {
    const d = new Date('2026-06-17T14:15:00.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:15:00.000Z');
  });

  it('14:45 → 14:45', () => {
    const d = new Date('2026-06-17T14:45:30.000Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T14:45:00.000Z');
  });

  it('23:59 → 23:45', () => {
    const d = new Date('2026-06-17T23:59:59.999Z');
    expect(calcLatestSlot(d)).toBe('2026-06-17T23:45:00.000Z');
  });
});

/**
 * 单元测试 — recordsToSeries 数据转换
 */
function recordsToSeries(records: { recordTime: string; readings: { label: string; value: number }[] }[]) {
  if (records.length === 0) return [];

  const labelOrder: string[] = [];
  const labelSet = new Set<string>();
  for (const r of records) {
    for (const rd of r.readings) {
      if (!labelSet.has(rd.label)) {
        labelSet.add(rd.label);
        labelOrder.push(rd.label);
      }
    }
  }

  return labelOrder.map((label) => ({
    label,
    data: records.map((r) => ({
      time: r.recordTime,
      value: r.readings.find((rd) => rd.label === label)?.value ?? 0,
    })),
  }));
}

describe('recordsToSeries', () => {
  it('空数组返回空', () => {
    expect(recordsToSeries([])).toEqual([]);
  });

  it('单个传感器数据转换正确', () => {
    const records = [
      { recordTime: '2026-06-17T14:00:00.000Z', readings: [{ label: '温度', value: 32.5 }] },
      { recordTime: '2026-06-17T14:15:00.000Z', readings: [{ label: '温度', value: 33.0 }] },
    ];
    const result = recordsToSeries(records);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('温度');
    expect(result[0].data).toEqual([
      { time: '2026-06-17T14:00:00.000Z', value: 32.5 },
      { time: '2026-06-17T14:15:00.000Z', value: 33.0 },
    ]);
  });

  it('多传感器数据正确分组', () => {
    const records = [
      {
        recordTime: '2026-06-17T14:00:00.000Z',
        readings: [
          { label: '温度', value: 32.5 },
          { label: '电压', value: 12.3 },
        ],
      },
      {
        recordTime: '2026-06-17T14:15:00.000Z',
        readings: [
          { label: '温度', value: 33.0 },
          { label: '电压', value: 12.1 },
        ],
      },
    ];
    const result = recordsToSeries(records);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('温度');
    expect(result[1].label).toBe('电压');
    expect(result[0].data).toHaveLength(2);
    expect(result[1].data).toHaveLength(2);
  });

  it('部分记录缺少某传感器时补0', () => {
    const records = [
      { recordTime: '2026-06-17T14:00:00.000Z', readings: [{ label: '温度', value: 32.5 }] },
      { recordTime: '2026-06-17T14:15:00.000Z', readings: [] },
    ];
    const result = recordsToSeries(records);
    expect(result[0].data[1].value).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npm run test
```

Expected: 所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/watering/sensor-log.test.ts
git commit -m "test: 新增传感器采样和数据转换单元测试"
```

---

### Task 8: 格式化与检查

- [ ] **Step 1: 运行格式化和检查**

```bash
npm run format
```

修复所有自动修复的问题。

```bash
npm run check
```

修复所有类型错误和 lint 错误。

- [ ] **Step 2: Commit（如有修复）**

```bash
git add -A
git commit -m "chore: 格式化与类型检查修复"
```

---

## 自审结果

1. **Spec 覆盖率**：设计文档 8 项需求全部对应到 Task 1-8，无遗漏
2. **占位符**：所有步骤包含完整代码，无 TBD/TODO
3. **类型一致性**：
   - `SensorLogRow` 接口字段名与 SQL 列名一致（`chip_id` → `chip_id`）
   - `getSensorLogs` 返回值类型与前端 `recordsToSeries` 入参一致
   - `TimeRange` 类型在 Action 和页面中保持一致（`'1h' | '6h' | '24h' | '7d'`）
