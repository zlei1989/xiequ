/**
 * 日志查看器 — 用 antd-mobile Steps + Card + Space 展示 IoT 通信日志
 *
 * 每个 stateId 组为一个 Card，组内每条事件为一个 Steps.Step。
 * 保留原有的分组、排序、格式化逻辑。
 */

'use client';

import { Card, Space, Steps, Tag } from 'antd-mobile';
import React, { useEffect, useState } from 'react';

/** ── 常量 ── */

/** 变更类型中文标签 */
export const changeTypeLabels: Record<string, string> = {
  step_ready: '步骤就绪',
  step_begin: '步骤开始',
  step_end: '步骤结束',
  step_timeout: '步骤超时',
  step_interrupt: '步骤中断',
};

/** 变更类型 Tag 颜色 */
export const changeTypeColors: Record<string, string> = {
  step_ready: 'default',
  step_begin: 'primary',
  step_end: 'success',
  step_timeout: 'warning',
  step_interrupt: 'danger',
};

/** ── 类型 ── */

export type LogItem = {
  event: string;
  createdTime: string;
  /** 剩余结构化数据：cause, type, sensors, loads, process, index */
  state?: unknown;
  macAddress?: string;
  stateId?: string;
  /** 设备生成的中文描述（change 事件） */
  message?: string;
  /** 传感器读数数组，每项包含感应名称和计算值 */
  readings?: { label: string; value: number }[];
  process?: { name?: string };
  cause?: string;
};

/** 日志消息解析段落 */
export type Segment =
  | { type: 'text'; value: string }
  | { type: 'var'; value: string };


/** 按流程分组后的组类型 */
export type ProcessGroup = {
  type: 'boot' | 'process';
  /** 开机信息（type='boot' 时必有） */
  bootItem?: LogItem;
  /** 流程名（从 execute 事件 state.process.name 或 change 的 processName 提取） */
  processName?: string;
  /** 流程内的事件（change + finish/terminate），正序 */
  items: LogItem[];
  /** 结束类型：finish=正常完成, terminate=手动终止, pending=缺失结束 */
  endType?: 'finish' | 'terminate' | 'pending';
};

/** ── 工具函数 ── */

/**
 * 按流程分组日志
 *
 * 以 execute 事件为流程切割点，bootstrap 永远独立为开机记录，
 * change/finish/terminate 归入当前流程组。
 * 过滤 heartbeat，卡片倒序（最新在前），卡片内部正序。
 */
export function groupByProcess(logs: LogItem[]): ProcessGroup[] {
  // 过滤 heartbeat
  const filtered = logs.filter((l) => l.event !== 'heartbeat');
  if (filtered.length === 0) return [];

  // 按时间正序排列（输入可能为倒序）
  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
  );

  const groups: ProcessGroup[] = [];
  let currentProcess: ProcessGroup | null = null;

  for (const log of sorted) {
    switch (log.event) {
      case 'bootstrap': {
        if (currentProcess && !currentProcess.endType) {
          currentProcess.endType = 'pending';
          currentProcess = null;
        }
        groups.push({ type: 'boot', bootItem: log, items: [] });
        break;
      }

      case 'execute': {
        if (currentProcess && !currentProcess.endType) {
          currentProcess.endType = 'pending';
        }
        const stateObj = log.state as Record<string, unknown> | undefined;
        const processName =
          log.process?.name ||
          (stateObj && typeof stateObj.process === 'object' && stateObj.process
            ? (stateObj.process as { name?: string }).name
            : undefined);
        currentProcess = {
          type: 'process',
          processName,
          items: [],
          endType: undefined,
        };
        groups.push(currentProcess);
        break;
      }

      case 'change': {
        if (currentProcess) {
          currentProcess.items.push(log);
        }
        break;
      }

      case 'finish': {
        if (currentProcess) {
          currentProcess.items.push(log);
          currentProcess.endType = 'finish';
          currentProcess = null;
        }
        break;
      }

      case 'terminate': {
        if (currentProcess) {
          currentProcess.items.push(log);
          currentProcess.endType = 'terminate';
          currentProcess = null;
        }
        break;
      }

      default:
        break;
    }
  }

  if (currentProcess && !currentProcess.endType) {
    currentProcess.endType = 'pending';
  }

  return groups.reverse();
}/**
 * 格式化时长为中文简化形式
 *
 * 规则：<1 分钟 → 刚刚，<1 小时 → X 分钟，<1 天 → X 小时，≥1 天 → X 天
 */
export function formatDuration(items: LogItem[]): string {
  if (items.length < 2) return '';
  const begin = new Date(items[0]?.createdTime ?? 0).getTime();
  const end = new Date(items[items.length - 1]?.createdTime ?? 0).getTime();
  /** 用 Math.floor 截断秒数，避免跨分钟边界时四舍五入导致分钟数 +1 */
  const seconds = Math.floor((end - begin) / 1000);
  return formatSimpleDuration(seconds);
}

/**
 * 格式化秒数为中文简化形式
 *
 * 用于流程用时和休眠时长。
 */
export function formatSimpleDuration(seconds: number): string {
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}小时`;
  const days = Math.floor(hours / 24);
  return `${String(days)}天`;
}

/**
 * 将秒数转为中文可读格式
 *
 * 规则：
 * - < 60 秒 → "X秒"
 * - 60 ~ 3599 秒 → "X分Y秒"（Y=0 时省略秒）
 * - ≥ 3600 秒 → "X小时Y分Z秒"（为 0 的单位省略）
 * - 负数取绝对值
 */
export function formatSeconds(seconds: number): string {
  const total = Math.abs(Math.floor(seconds));
  if (total < 60) return `${String(total)}秒`;

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${String(h)}小时`);
  if (m > 0) parts.push(`${String(m)}分`);
  if (s > 0) parts.push(`${String(s)}秒`);

  return parts.join('');
}

/** 时间类占位符 key 集合 */
const TIME_KEYS = new Set(['timeout', 'duration', 'stepDuration', 'expire']);

/**
 * 解析日志消息中的 {key:value} 占位符为段落数组
 *
 * 时间类 key（timeout/duration/stepDuration/expire）的 value 以秒为单位，
 * 调用 formatSeconds 转为可读格式。
 * 匹配模式：{key:value}，key 为 \w+，value 不含 } 字符。
 */
export function parseLogMessage(message: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const re = /\{(\w+):([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(message)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: message.slice(lastIndex, match.index) });
    }
    const key = match[1] ?? '';
    const rawValue = match[2] ?? '';
    if (TIME_KEYS.has(key)) {
      const sec = parseInt(rawValue, 10);
      segments.push({ type: 'var', value: formatSeconds(sec) });
    } else {
      segments.push({ type: 'var', value: rawValue });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < message.length) {
    segments.push({ type: 'text', value: message.slice(lastIndex) });
  }

  return segments;
}

/** 唤醒原因值到中文标签的映射 */
const causeLabels: Record<string, string> = {
  '0': '正常上电',
  '2': '外部唤醒',
  '4': '定时唤醒',
};

/** 将 cause 数字映射为中文标签，未知值返回空字符串 */
export function formatCause(cause: string | undefined): string {
  if (!cause) return '';
  return causeLabels[cause] || '';
}

/**
 * 格式化负载值展示
 *
 * load_0, 192  → "load_0(192)"
 * load_0, null → "load_0(空)"
 */
export function formatLoadValue(component: string, value: unknown): string {
  if (value === null || value === undefined) return `${component}(空)`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${component}(${String(value)})`;
  }
  return `${component}(空)`;
}

/**
 * 开机记录卡片
 *
 * 纯信息展示，不使用 Steps。
 * 显示开机时间、唤醒原因、休眠时长、传感器读数。
 */
export function BootCard({ group, allLogs }: { group: ProcessGroup; allLogs: LogItem[] }) {
  const item = group.bootItem;
  if (!item) return null;

  const causeLabel = formatCause(item.cause);
  const sleepSec = calcSleepDuration(item, allLogs);
  const sleepText = sleepSec >= 60 ? `休眠 ${formatSimpleDuration(sleepSec)}` : '';

  // 描述行：唤醒原因 · 休眠时长
  const descParts: string[] = [];
  if (causeLabel) descParts.push(causeLabel);
  if (sleepText) descParts.push(sleepText);
  const descText = descParts.join(' · ');

  // 传感器读数行
  const readingText =
    item.readings && item.readings.length > 0
      ? item.readings.map((r) => `${r.label}: ${r.value}`).join(' · ')
      : '';

  return (
    <Card
      extra={
        <span className="text-xs text-gray-400">
          {formatDateTime(item.createdTime)}
        </span>
      }
      key={`boot-${item.createdTime}`}
      title={
        <Space align="center">
          <Tag color="success">开机</Tag>
          <span>开机记录</span>
        </Space>
      }
    >
      {descText && (
        <div className="mb-1 text-[13px] text-gray-700">{descText}</div>
      )}
      {readingText && (
        <div className="text-xs text-gray-400">{readingText}</div>
      )}
    </Card>
  );
}

/**
 * 格式化日志消息为可渲染的 ReactNode
 *
 * 有 message 时解析 {key:value} 占位符，变量值用主题色高亮；
 * 无 message 时根据事件类型生成中文描述。
 */
export function formatMessage(item: LogItem): React.ReactNode {
  if (item.message) {
    const segments = parseLogMessage(item.message);
    return segments.map((seg, i) =>
      seg.type === 'var' ? (
        <span key={i} style={{ color: 'var(--adm-color-primary)' }}>
          {seg.value}
        </span>
      ) : (
        <span key={i}>{seg.value}</span>
      ),
    );
  }
  switch (item.event) {
    case 'bootstrap':
      return <span>{item.cause ? `${formatCause(item.cause)}开机` : '设备开机'}</span>;
    case 'execute':
      return <span>{`执行流程${item.process?.name ? `: ${item.process.name}` : ''}`}</span>;
    case 'terminate':
      return <span>终止流程</span>;
    case 'finish':
      return <span>完成流程</span>;
    case 'change':
      return <span>流程状态变更</span>;
    case 'heartbeat':
      return <span>心跳</span>;
    default:
      return <span>{item.event}</span>;
  }
}

/**
 * 从一组日志中提取流程名列表
 *
 * 遍历所有 change 事件的 message，从中提取 processName，去重按首次出现排序。
 */
export function extractProcessNames(items: LogItem[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (item.event !== 'change') continue;
    const msg = item.message;
    if (!msg) continue;
    const match = msg.match(/\{processName:([^}]+)\}/);
    if (match && match[1]) {
      const name = match[1];
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

/** 统计 change 事件数（即步骤总数） */
export function countSteps(items: LogItem[]): number {
  return items.filter((i) => i.event === 'change' && i?.state?.type === 'step_ready').length;
}

/**
 * 计算休眠时长（秒）
 *
 * 返回当前 bootstrap 事件与前一条日志的时间差。
 * 无法计算时返回 0。
 */
export function calcSleepDuration(currentLog: LogItem, allLogs: LogItem[]): number {
  const currentTime = new Date(currentLog.createdTime).getTime();
  let prevTime = 0;
  for (const log of allLogs) {
    const t = new Date(log.createdTime).getTime();
    if (t < currentTime && t > prevTime) {
      prevTime = t;
    }
  }
  if (prevTime === 0) return 0;
  /** 用 Math.floor 截断秒数，避免跨分钟边界时四舍五入导致分钟数 +1 */
  return Math.floor((currentTime - prevTime) / 1000);
}

/**
 * 判定事件对应的 Step status
 *
 * - 正常结束类事件 → finish
 * - 异常中断类事件 → error
 * - 心跳等持续类事件 → wait
 */
function getStepStatus(event: string): 'wait' | 'finish' | 'error' {
  switch (event) {
    case 'bootstrap':
    case 'execute':
    case 'finish':
    case 'change':
      return 'finish';
    case 'terminate':
      return 'error';
    case 'heartbeat':
      return 'wait';
    default:
      return 'finish';
  }
}

/** 格式化时间为 HH:MM:SS */
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** 格式化时间为 YYYY-MM-DD */
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 格式化时间为 YYYY-MM-DD HH:MM:SS */
function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 流程卡片
 *
 * 展示一次完整流程执行：摘要行 + Steps 步骤列表 + 结束标记。
 * 缺失 finish/terminate 时显示"进行中"状态。
 */
export function ProcessCard({ group }: { group: ProcessGroup }) {
  // hooks 必须在条件返回之前调用
  const [now, setNow] = useState<number>(0);

  // 更新"进行中"状态的当前时间，每 10 秒刷新一次
  useEffect(() => {
    if (group.endType !== 'pending') return;
    let timer: ReturnType<typeof setInterval> | undefined;
    // 用 setTimeout 延迟初始 setState，避免在 effect 体中同步调用
    const id = setTimeout(() => {
      setNow(Date.now());
      timer = setInterval(() => { setNow(Date.now()); }, 10000);
    }, 0);
    return () => {
      clearTimeout(id);
      if (timer) clearInterval(timer);
    };
  }, [group.endType]);

  if (group.items.length === 0) return null;

  // 流程名：优先 execute 的 process.name，否则从 change 的 processName 提取
  const processName =
    group.processName ||
    (group.items.length > 0 ? extractProcessNames(group.items)[0] : undefined) ||
    '未知流程';

  // 步骤数
  const stepCount = countSteps(group.items);

  // 用时
  let durationText = '';
  if (group.endType === 'pending') {
    const lastItem = group.items[group.items.length - 1];
    if (lastItem && now > 0) {
      const elapsed =
        (now - new Date(lastItem.createdTime).getTime()) / 1000;
      durationText = `已运行${formatSimpleDuration(Math.floor(elapsed))}`;
    }
  } else {
    const d = formatDuration(group.items);
    if (d) durationText = `用${d}`;
  }

  // 状态标签
  let statusTag: { label: string; color: 'success' | 'warning' | 'danger' };
  switch (group.endType) {
    case 'finish':
      statusTag = { label: '已完成', color: 'success' };
      break;
    case 'terminate':
      statusTag = { label: '已终止', color: 'warning' };
      break;
    case 'pending':
    default:
      statusTag = { label: '进行中', color: 'warning' };
      break;
  }

  // 摘要行
  const summaryParts: string[] = [];
  summaryParts.push(formatDate(group.items[0].createdTime));
  if (durationText) summaryParts.push(durationText);
  if (stepCount > 0) summaryParts.push(`共${String(stepCount)}步`);
  const summaryText = summaryParts.join(' · ');

  return (
    <Card
      extra={<Tag color={statusTag.color}>{statusTag.label}</Tag>}
      title={processName}
    >
      {/* 摘要行 */}
      {summaryText && (
        <div className="mb-2 text-xs text-gray-400">{summaryText}</div>
      )}

      {/* 步骤列表 */}
      <Steps direction="vertical" className="!p-0">
        {group.items
          .filter((item) => item.event === 'change')
          .map((item, idx) => {
            const stateObj = item.state as Record<string, unknown> | undefined;
            const type = stateObj?.type;
            const changeType =
              typeof type === 'string' || typeof type === 'number'
                ? String(type)
                : '';
            const component = stateObj?.component;
            const value = stateObj?.value as
              | { begin?: number; end?: number }
              | undefined;
            const interrupts = stateObj?.interrupts as
              | Array<{ name: string; disabled: boolean }>
              | undefined;

            // 负载展示：只显示目标值（end）
            const loadDisplay =
              typeof component === 'string'
                ? formatLoadValue(component, value?.end ?? null)
                : '';

            // 中断描述
            const interruptText =
              interrupts && interrupts.length > 0
                ? `传感器: ${interrupts
                  .map(
                    (ir) =>
                      `${ir.name}${ir.disabled ? '(禁用)' : ''}`,
                  )
                  .join(' · ')}`
                : '';

            return (
              <Steps.Step
                description={
                  <span className="text-[13px] text-gray-700">
                    {item.message ? (
                      formatMessage({ ...item })
                    ) : (
                      loadDisplay
                    )}
                    {loadDisplay && item.message ? (
                      <>
                        {' · '}
                        <span style={{ color: 'var(--adm-color-primary)' }}>
                          {loadDisplay}
                        </span>
                      </>
                    ) : null}
                    {interruptText && (
                      <span className="mt-0.5 block text-xs text-gray-400">
                        {interruptText}
                      </span>
                    )}
                  </span>
                }
                key={`step-${idx}`}
                status={getStepStatus(item.event)}
                title={
                  <Space align="center">
                    {changeType && changeTypeLabels[changeType] ? (
                      <Tag
                        color={changeTypeColors[changeType] || 'default'}
                      >
                        {changeTypeLabels[changeType]}
                      </Tag>
                    ) : (
                      <Tag color="primary">变更</Tag>
                    )}
                    <span className="text-xs text-gray-400">
                      {formatTime(item.createdTime)}
                    </span>
                  </Space>
                }
              />
            );
          })}
      </Steps>

    </Card>
  );
}


