# 日志消息格式化优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将日志消息 `{key:value}` 占位符渲染为 antd-mobile 主题色高亮文本，时间类数值转人性化中文表达（如 `1000` → `16分40秒`）。

**Architecture:** 在 `log-card.tsx` 中新增 `formatSeconds` 和 `parseLogMessage` 两个纯函数，改 `formatMessage` 返回 `ReactNode`。固件 `Process.cpp` 中删除模板里的冗余 `秒` 字。

**Tech Stack:** React + TypeScript + antd-mobile + vitest + jsdom

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `app/watering/components/log-card.tsx` | 新增 `formatSeconds`、`parseLogMessage`、`Segment` 类型；`formatMessage` 返回 `ReactNode` |
| `app/watering/rom-v2/Process.cpp` | 4 处模板删除 `秒` 字 |
| `__tests__/watering/log-card-utils.test.ts` | 新增 `formatSeconds`、`parseLogMessage` 测试；更新 `formatMessage` 测试 |

`formatSeconds` — 纯数学运算，无依赖。  
`parseLogMessage` — 调用 `formatSeconds`，正则解析占位符。  
`formatMessage` — 调用 `parseLogMessage`，返回 JSX。

---

### Task 1: 新增 `formatSeconds` 函数

**Files:**
- Modify: `app/watering/components/log-card.tsx`
- Modify: `__tests__/watering/log-card-utils.test.ts`

- [ ] **Step 1: 在测试文件中新增 `formatSeconds` 测试**

在 `__tests__/watering/log-card-utils.test.ts` 中，先在顶部 import 处添加 `formatSeconds`：

```ts
import {
  groupByStateId,
  formatDuration,
  formatMessage,
  formatCause,
  extractProcessNames,
  countSteps,
  calcSleepDuration,
  formatSeconds,
} from '@/app/watering/components/log-card';
```

然后在 `formatDuration` describe 块之后、`formatMessage` describe 块之前，新增：

```ts
// ================================================================
// formatSeconds
// ================================================================

describe('formatSeconds', () => {
  it('0 返回 "0秒"', () => {
    expect(formatSeconds(0)).toBe('0秒');
  });

  it('小于 60 秒保持原样', () => {
    expect(formatSeconds(45)).toBe('45秒');
  });

  it('整分钟省略秒', () => {
    expect(formatSeconds(120)).toBe('2分');
  });

  it('分钟 + 秒', () => {
    expect(formatSeconds(1000)).toBe('16分40秒');
  });

  it('整小时省略分秒', () => {
    expect(formatSeconds(3600)).toBe('1小时');
  });

  it('小时 + 分 + 秒', () => {
    expect(formatSeconds(3661)).toBe('1小时1分1秒');
  });

  it('多整小时', () => {
    expect(formatSeconds(7200)).toBe('2小时');
  });

  it('小时 + 秒（无分钟）', () => {
    expect(formatSeconds(7205)).toBe('2小时5秒');
  });

  it('负数取绝对值', () => {
    expect(formatSeconds(-120)).toBe('2分');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- __tests__/watering/log-card-utils.test.ts
```

预期：`formatSeconds` 相关测试全部 FAIL（`formatSeconds is not a function` 或 `not exported`）。

- [ ] **Step 3: 在 `log-card.tsx` 中实现 `formatSeconds`**

在 `log-card.tsx` 的 `formatSimpleDuration` 函数之后（约 130 行后）新增：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- __tests__/watering/log-card-utils.test.ts
```

预期：`formatSeconds` 的 9 个测试全部 PASS。其他已有测试保持 PASS。

- [ ] **Step 5: 提交**

```bash
git add app/watering/components/log-card.tsx __tests__/watering/log-card-utils.test.ts
git commit -m "feat(watering): add formatSeconds to convert seconds to readable Chinese format"
```

---

### Task 2: 新增 `parseLogMessage` 函数

**Files:**
- Modify: `app/watering/components/log-card.tsx`
- Modify: `__tests__/watering/log-card-utils.test.ts`

- [ ] **Step 1: 在测试文件中新增 `parseLogMessage` 测试**

先在顶部 import 处添加 `parseLogMessage`：

```ts
import {
  groupByStateId,
  formatDuration,
  formatMessage,
  formatCause,
  extractProcessNames,
  countSteps,
  calcSleepDuration,
  formatSeconds,
  parseLogMessage,
} from '@/app/watering/components/log-card';
```

在 `formatSeconds` describe 块之后新增：

```ts
// ================================================================
// parseLogMessage
// ================================================================

describe('parseLogMessage', () => {
  it('纯文本无占位符返回单个 text 段', () => {
    const result = parseLogMessage('设备开机');
    expect(result).toEqual([{ type: 'text', value: '设备开机' }]);
  });

  it('空字符串返回空数组', () => {
    const result = parseLogMessage('');
    expect(result).toEqual([]);
  });

  it('单个非时间占位符', () => {
    const result = parseLogMessage('{processName:浇花}');
    expect(result).toEqual([{ type: 'var', value: '浇花' }]);
  });

  it('单个时间占位符（timeout）转换为可读格式', () => {
    const result = parseLogMessage('{timeout:1000}');
    expect(result).toEqual([{ type: 'var', value: '16分40秒' }]);
  });

  it('多个时间 key 均转换：duration, stepDuration, expire', () => {
    expect(parseLogMessage('{duration:120}')).toEqual([{ type: 'var', value: '2分' }]);
    expect(parseLogMessage('{stepDuration:3600}')).toEqual([{ type: 'var', value: '1小时' }]);
    expect(parseLogMessage('{expire:65}')).toEqual([{ type: 'var', value: '1分5秒' }]);
  });

  it('文本与占位符混合', () => {
    const result = parseLogMessage('负载{componentKey:load_0}{value:200}已打开。');
    expect(result).toEqual([
      { type: 'text', value: '负载' },
      { type: 'var', value: 'load_0' },
      { type: 'var', value: '200' },
      { type: 'text', value: '已打开。' },
    ]);
  });

  it('完整超时消息示例', () => {
    const result = parseLogMessage(
      '{processName:侵水浇花}流程的{stepName:抽水池壹}{stepId:2}环节持续{timeout:1000}超时。'
    );
    expect(result).toEqual([
      { type: 'var', value: '侵水浇花' },
      { type: 'text', value: '流程的' },
      { type: 'var', value: '抽水池壹' },
      { type: 'var', value: '2' },
      { type: 'text', value: '环节持续' },
      { type: 'var', value: '16分40秒' },
      { type: 'text', value: '超时。' },
    ]);
  });

  it('占位符中的 key 区分大小写严格匹配', () => {
    // Timeout（大写 T）不识别为时间 key，原样保留
    const result = parseLogMessage('{Timeout:1000}');
    expect(result).toEqual([{ type: 'var', value: '1000' }]);
  });

  it('占位符内无冒号按普通文本处理', () => {
    const result = parseLogMessage('{timeout1000}');
    expect(result).toEqual([{ type: 'text', value: '{timeout1000}' }]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- __tests__/watering/log-card-utils.test.ts
```

预期：`parseLogMessage` 测试 FAIL，已有测试保持 PASS。

- [ ] **Step 3: 在 `log-card.tsx` 中实现 `Segment` 类型和 `parseLogMessage`**

在 `LogItem` 类型定义之后（约 65 行后）、工具函数区域之前，新增 `Segment` 类型。

然后在 `formatSeconds` 函数之后新增 `parseLogMessage`。

```ts
/** 日志消息解析段落 */
export type Segment =
  | { type: 'text'; value: string }
  | { type: 'var'; value: string };
```

```ts
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
  /** 匹配 {key:value} 占位符 */
  const re = /\{(\w+):([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(message)) !== null) {
    // 占位符之前的普通文本
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: message.slice(lastIndex, match.index) });
    }
    const key = match[1]!;
    const rawValue = match[2]!;
    // 时间类 key：将 value 作为秒数转换
    if (TIME_KEYS.has(key)) {
      const sec = parseInt(rawValue, 10);
      segments.push({ type: 'var', value: formatSeconds(sec) });
    } else {
      segments.push({ type: 'var', value: rawValue });
    }
    lastIndex = match.index + match[0].length;
  }

  // 末尾剩余文本
  if (lastIndex < message.length) {
    segments.push({ type: 'text', value: message.slice(lastIndex) });
  }

  return segments;
}
```

插入位置：
- `Segment` 类型放在 `LogItem` 类型之后（约 65 行后）
- `parseLogMessage` 函数放在 `formatSeconds` 之后

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- __tests__/watering/log-card-utils.test.ts
```

预期：所有测试 PASS（包括 `formatSeconds`、`parseLogMessage` 及原有测试）。

- [ ] **Step 5: 提交**

```bash
git add app/watering/components/log-card.tsx __tests__/watering/log-card-utils.test.ts
git commit -m "feat(watering): add parseLogMessage to parse {key:value} template into segments"
```

---

### Task 3: 改动 `formatMessage` 返回 `ReactNode`

**Files:**
- Modify: `app/watering/components/log-card.tsx`
- Modify: `__tests__/watering/log-card-utils.test.ts`

- [ ] **Step 1: 更新测试文件中 `formatMessage` 的测试用例**

需要在测试文件顶部新增 `React` 和 `renderToString` 的 import：

```ts
import React from 'react';
import { renderToString } from 'react-dom/server';
```

现有的 `formatMessage` describe 块（行 138-188），做以下修改：

```ts
describe('formatMessage', () => {
  /** 将 ReactNode 转为 HTML 字符串用于断言 */
  function renderMsg(item: LogItem): string {
    return renderToString(formatMessage(item) as React.ReactElement);
  }

  it('有 message 字段时优先返回 message（含占位符高亮）', () => {
    const item = makeLog({
      message: '{processName:浇花}流程的{stepName:浇水}{stepId:0}环节持续{timeout:1000}超时。',
      event: 'change',
    });
    const html = renderMsg(item);
    // 变量值应在带 color 样式的 span 中
    expect(html).toContain('style="color:var(--adm-color-primary)"');
    expect(html).toContain('>浇花<');
    expect(html).toContain('>浇水<');
    expect(html).toContain('>0<');
    expect(html).toContain('>16分40秒<');
    expect(html).toContain('>超时。<');
  });

  it('有 message 但无占位符时保持纯文本', () => {
    const item = makeLog({ message: '自定义消息内容' });
    const html = renderMsg(item);
    expect(html).toContain('>自定义消息内容<');
    // 无高亮 span
    expect(html).not.toContain('color:var(--adm-color-primary)');
  });

  it('bootstrap 事件无 cause', () => {
    const item = makeLog({ event: 'bootstrap' });
    const html = renderMsg(item);
    expect(html).toContain('>设备开机<');
  });

  it('bootstrap 事件带 cause="4" 映射为定时唤醒', () => {
    const item = makeLog({ event: 'bootstrap', cause: '4' });
    const html = renderMsg(item);
    expect(html).toContain('>定时唤醒开机<');
  });

  it('execute 事件带 process.name', () => {
    const item = makeLog({ event: 'execute', process: { name: '浇花流程A' } });
    const html = renderMsg(item);
    expect(html).toContain('>执行流程: 浇花流程A<');
  });

  it('execute 事件无 process', () => {
    const item = makeLog({ event: 'execute' });
    const html = renderMsg(item);
    expect(html).toContain('>执行流程<');
  });

  it('terminate 事件', () => {
    const item = makeLog({ event: 'terminate' });
    const html = renderMsg(item);
    expect(html).toContain('>终止流程<');
  });

  it('finish 事件', () => {
    const item = makeLog({ event: 'finish' });
    const html = renderMsg(item);
    expect(html).toContain('>完成流程<');
  });

  it('change 事件（无 message）', () => {
    const item = makeLog({ event: 'change' });
    const html = renderMsg(item);
    expect(html).toContain('>流程状态变更<');
  });

  it('heartbeat 事件', () => {
    const item = makeLog({ event: 'heartbeat' });
    const html = renderMsg(item);
    expect(html).toContain('>心跳<');
  });

  it('未知事件返回原文', () => {
    const item = makeLog({ event: 'custom_event' });
    const html = renderMsg(item);
    expect(html).toContain('>custom_event<');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm run test -- __tests__/watering/log-card-utils.test.ts
```

预期：`formatMessage` 测试 FAIL，因为返回类型从 `string` 变了。`formatSeconds` 和 `parseLogMessage` 测试保持 PASS。

- [ ] **Step 3: 改动 `log-card.tsx` 中 `formatMessage` 的实现**

在 `log-card.tsx` 顶部确认 `React` 已 import（当前文件中使用了 JSX 所以已存在）。

将 `formatMessage`（约 154-172 行）替换为：

```ts
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
      return item.cause ? `${formatCause(item.cause)}开机` : '设备开机';
    case 'execute':
      return `执行流程${item.process?.name ? `: ${item.process.name}` : ''}`;
    case 'terminate':
      return '终止流程';
    case 'finish':
      return '完成流程';
    case 'change':
      return '流程状态变更';
    case 'heartbeat':
      return '心跳';
    default:
      return item.event;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- __tests__/watering/log-card-utils.test.ts
```

预期：全部测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add app/watering/components/log-card.tsx __tests__/watering/log-card-utils.test.ts
git commit -m "feat(watering): formatMessage returns ReactNode with highlighted template variables"
```

---

### Task 4: 修改固件模板删除冗余 `秒` 字

**Files:**
- Modify: `app/watering/rom-v2/Process.cpp`

- [ ] **Step 1: 修改 4 处模板字符串**

使用 Edit 工具逐一替换。注意 C++ 的 `sprintf` 模板跨行，需精确匹配。

**改动 1 — step_timeout（约 53 行）：**

```c
// 改前
                "{processName:%s}流程的{stepName:%s}{stepId:%d}环节持续{"
                "timeout:%lu}秒超时。",

// 改后
                "{processName:%s}流程的{stepName:%s}{stepId:%d}环节持续{"
                "timeout:%lu}超时。",
```

**改动 2 — step_end（约 119-120 行）：**

```c
// 改前
                "{processName:%s}流程的{stepName:%s}{stepId:%d}环节结束。负载{"
                "componentKey:%s}{value:%s}已关闭。环节持续{stepDuration:%lu}"
                "秒，流程持续{duration:%lu}秒。",

// 改后
                "{processName:%s}流程的{stepName:%s}{stepId:%d}环节结束。负载{"
                "componentKey:%s}{value:%s}已关闭。环节持续{stepDuration:%lu}"
                "，流程持续{duration:%lu}。",
```

**改动 3 — step_ready（约 556-557 行）：**

```c
// 改前
                "{processName:%s}流程的{stepName:%s}{stepId:%d}"
                "环节已经准备就绪，执行{expire:%lu}"
                "秒后超时。",

// 改后
                "{processName:%s}流程的{stepName:%s}{stepId:%d}"
                "环节已经准备就绪，执行{expire:%lu}"
                "后超时。",
```

**改动 4 — terminate（约 603-604 行）：**

```c
// 改前
            "{processName:%s}流程的{stepName:%s}{stepId:%d}环节终止。负载{"
            "componentKey:%s}{componentValue:%s}已关闭。环节持续{stepDuration:%lu}"
            "秒，流程持续{duration:%lu}秒。",

// 改后
            "{processName:%s}流程的{stepName:%s}{stepId:%d}环节终止。负载{"
            "componentKey:%s}{componentValue:%s}已关闭。环节持续{stepDuration:%lu}"
            "，流程持续{duration:%lu}。",
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/rom-v2/Process.cpp
git commit -m "fix(watering): remove redundant 秒 from firmware log templates"
```

---

### Task 5: 格式化、检查与验证

- [ ] **Step 1: 格式化**

```bash
npm run format
```

- [ ] **Step 2: 类型检查与 lint**

```bash
npm run check
```

修复所有报错。

- [ ] **Step 3: 运行全量测试**

```bash
npm run test
```

确认所有测试 PASS（包括不限于 `log-card-utils.test.ts`）。

- [ ] **Step 4: 提交（如有格式化变动）**

```bash
git add -A
git commit -m "chore: format and lint fixes for log message formatting"
```

- [ ] **Step 5: 检查 `log-card.tsx` 调用方兼容性**

`formatMessage` 的返回值在 `log-card.tsx` 内部使用（约 340 行），外部的 import 者仅使用 `LogCard` 组件和 `LogItem` 等类型，不直接使用 `formatMessage`。确认无编译错误即可。

验证方式：`npm run check` 通过即可保证。

---

## 验收检查

- [ ] `formatSeconds(1000)` 返回 `"16分40秒"`
- [ ] `parseLogMessage('{timeout:120}')` 返回 `[{ type: 'var', value: '2分' }]`
- [ ] `formatMessage` 有 message 时返回含 `<span style="color:var(--adm-color-primary)">` 的 JSX
- [ ] `formatMessage` 无 message 时回退行为不变
- [ ] `npm run check` 零错误
- [ ] `npm run test` 全量通过
