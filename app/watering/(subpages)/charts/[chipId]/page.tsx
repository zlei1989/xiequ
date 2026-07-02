/**
 * 传感器趋势折线图页面
 *
 * 独立子页面，展示设备传感器数值的历史趋势。
 * 顶部 CapsuleTabs 切换时间范围，下方每传感器一张独立 Recharts 折线图。
 * 支持亮/暗主题自适应。
 */

'use client';

import { Button, CapsuleTabs, Dialog, DotLoading, ErrorBlock, NavBar, Toast } from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
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

import { clearSensorLogs, getSensorLogs } from '@/app/watering/actions';

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
] as const;

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
    color: LINE_COLORS[idx % LINE_COLORS.length] ?? '#4ade80',
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 页面初始化加载数据
    void fetchData();
  }, [fetchData]);

  /** 清空传感器采样日志：弹窗确认 → 执行清空 → Toast 提示 */
  async function handleClear() {
    const confirmed = await Dialog.confirm({
      title: '确认清空环境日志？',
      content: '操作不可撤销',
    });
    if (!confirmed) return;

    try {
      await clearSensorLogs(chipId);
      Toast.show({ icon: 'success', content: '环境日志已清空' });
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '清空环境日志失败';
      console.error('[Watering] 清空环境日志失败:', { chipId, message, stack: err instanceof Error ? err.stack : undefined });
      Toast.show({ icon: 'fail', content: message });
    }
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-[var(--background)]">
        <NavBar
          right={
            <Button size="small" onClick={() => { void handleClear(); }}>
              <DeleteOutline />
            </Button>
          }
          onBack={() => { router.back(); }}
        >
          传感器趋势
        </NavBar>
      </div>

      <div className="px-3 pb-6">
        {/* 时间范围切换 */}
        <div className="my-3">
          <CapsuleTabs
            activeKey={range}
            onChange={(key) => { setRange(key as Range); }}
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
          <ErrorBlock description={error} status="default" title="加载失败" />
        ) : series.length === 0 ? (
          <ErrorBlock description="设备还未上报传感器数据" status="empty" title="暂无数据" />
        ) : (
          <div className="flex flex-col gap-4">
            {series.map((s) => (
              <SensorChart key={s.label} range={range} series={s} />
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
    <div className="rounded-xl bg-[var(--adm-color-background)] p-3 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-[var(--adm-color-text)]">
        {series.label}
      </div>
      <ResponsiveContainer height={180} width="100%">
        <LineChart
          data={series.data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            stroke="var(--adm-color-border, #eee)"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
          <XAxis
            dataKey="time"
            interval="preserveStartEnd"
            tick={{ fontSize: 10, fill: 'var(--adm-color-text-secondary, #999)' }}
            tickFormatter={(t: string) => formatTime(t, range)}
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
            formatter={(value) => [Number(value).toFixed(2), series.label]}
            labelFormatter={(t) => formatTime(String(t), range)}
          />
          <Line
            activeDot={{ r: 4, fill: series.color }}
            dataKey="value"
            dot={false}
            stroke={series.color}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
