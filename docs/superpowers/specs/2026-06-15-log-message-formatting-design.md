# 日志消息格式化优化 — 设计文档

**日期：** 2026-06-15  
**状态：** 已确认

## 目标

将日志消息中的 `{key:value}` 结构化占位符渲染为更可读的形式：
- 变量值用 antd-mobile 主题色高亮
- 时间类数值转换为人性化表达（如 `1000秒` → `16分40秒`）

**示例：**

```
输入：{processName:侵水浇花}流程的{stepName:抽水池壹}{stepId:2}环节持续{timeout:1000}超时。
输出：侵水浇花流程的抽水池壹2环节持续16分40秒超时。
     ~~~~~~        ~~~~~~  ~                  ~~~~~~~~
     (主题色高亮)
```

## 范围

仅限**客户端日志卡片展示**（`log-card.tsx`），不涉及服务端 `console.log` 输出。

## 设计

### 1. 新增 `formatSeconds(seconds: number): string`

纯函数，将秒数转为中文可读格式。

**规则：**

| 范围 | 输出 | 示例 |
|------|------|------|
| `< 60` | `X秒` | `45秒` |
| `≥ 60, < 3600` | `X分Y秒`（省略 Y=0） | `16分40秒`，`5分` |
| `≥ 3600` | `X小时Y分Z秒`（省略为 0 的单位） | `1小时5分30秒`，`2小时` |

**边界：**
- `0` → `0秒`
- 负数 → 取绝对值后格式化

### 2. 新增 `parseLogMessage(message: string): Segment[]`

纯函数，解析 `{key:value}` 模板为段落数组。

```ts
type Segment =
  | { type: 'text'; value: string }
  | { type: 'var'; value: string }; // 已格式化后的变量值
```

**解析规则：**
- 正则匹配 `\{(\w+):([^}]+)\}` 占位符
- 时间类 key（`timeout`、`duration`、`stepDuration`、`expire`）→ value 以秒为单位，调用 `formatSeconds` 转换
- 其他 key → value 原样保留
- 占位符之间的普通文本作为 `text` 段

### 3. 改动 `formatMessage(item: LogItem): ReactNode`

返回类型从 `string` 改为 `ReactNode`。

```ts
export function formatMessage(item: LogItem): ReactNode {
  if (item.message) {
    const segments = parseLogMessage(item.message);
    return segments.map((seg, i) =>
      seg.type === 'var'
        ? <span key={i} style={{ color: 'var(--adm-color-primary)' }}>{seg.value}</span>
        : <span key={i}>{seg.value}</span>
    );
  }
  // 无 message 时的原有回退逻辑不变
  switch (item.event) { ... }
}
```

### 4. 固件模板修改（`Process.cpp`）

去掉时间占位符后多余的 `秒` 字，避免与 `formatSeconds` 输出的单位重复。

| 行号 | 改动前 | 改动后 |
|------|--------|--------|
| 53-54 | `{timeout:%lu}秒超时。` | `{timeout:%lu}超时。` |
| 119-120 | `{stepDuration:%lu}秒，流程持续{duration:%lu}秒。` | `{stepDuration:%lu}，流程持续{duration:%lu}。` |
| 556-557 | `{expire:%lu}秒后超时。` | `{expire:%lu}后超时。` |
| 603-604 | `{stepDuration:%lu}秒，流程持续{duration:%lu}秒。` | `{stepDuration:%lu}，流程持续{duration:%lu}。` |

## 数据流

```
C++ 固件 Process.cpp         服务端                前端 log-card.tsx
─────────────────────       ────────              ───────────────────
sprintf(buffer, ...)  →  DB 存储  →  formatMessage(item)
{processName:xxx}...     透传          │
                                       ├─ parseLogMessage(message)
                                       │   ├─ 时间 key → formatSeconds()
                                       │   └─ 其他 key → 原值
                                       │
                                       └─ Segment[] → <span> JSX
                                           var 段带 color 样式
```

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `app/watering/components/log-card.tsx` | 新增 `formatSeconds`、`parseLogMessage`；`formatMessage` 返回 `ReactNode` |
| `app/watering/rom-v2/Process.cpp` | 4 处模板删除 `秒` 字（6 个字符） |
| `__tests__/watering/log-card-utils.test.ts` | 新增 `formatSeconds`、`parseLogMessage` 测试；更新 `formatMessage` 测试 |

## 测试覆盖

### `formatSeconds`
- `0` → `"0秒"`
- `45` → `"45秒"`
- `120` → `"2分"`
- `1000` → `"16分40秒"`
- `3600` → `"1小时"`
- `3661` → `"1小时1分1秒"`
- `7200` → `"2小时"`
- `7205` → `"2小时5秒"`

### `parseLogMessage`
- 纯文本（无占位符）→ 单个 text 段
- 时间占位符 → `formatSeconds` 转换后的 var 段
- 非时间占位符 → 原值 var 段
- 混合文本与多个占位符 → 正确的段落序列

### `formatMessage`
- 无 message 的 event 回退（bootstrap、execute、finish 等）→ 用 `renderToString` 验证
- 有 message 含占位符 → 验证 HTML 输出含 `<span style="color: var(--adm-color-primary)">`
