# 设备卡片信息布局 & 流程快捷按钮优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设备卡片信息区重构为 1 行 2 列网格，流程快捷按钮增加奇数个首项整行布局规则，统一颜色/状态映射为红（运行中）/蓝（停止）/灰（待机禁用）。

**Architecture:** 修改 `device-card.tsx` 单个文件。信息区用 Row+Col(span=12) 四格排布替换当前分散布局。流程按钮去掉 Dropdown 包装改为纯单击，根据 isExec + idleSleep 决定 type/danger/disabled 状态，奇数流程时第一项占 span=24。

**Tech Stack:** Next.js App Router, React Server Components + Client Components, Ant Design v5, TypeScript

**关联文档:** [设计文档](../specs/2026-06-08-device-card-layout-and-buttons-design.md)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `app/watering/components/device-card.tsx` | 修改 | 信息区两列布局 + 流程按钮重构 |

---

### Task 1: 设备信息区改为 1 行 2 列网格

**Files:**
- Modify: `app/watering/components/device-card.tsx:135-166`

- [ ] **Step 1: 替换信息区 JSX**

将当前第 135-166 行的设备信息 Row/Col 替换为两列等宽网格。当前代码：

```typescript
      {/* 设备信息 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={voltage !== undefined ? 12 : 16}>
          <span style={{ color: "#999", fontSize: 12 }}>芯片: </span>
          <span style={{ fontSize: 13 }}>{device.chipId}</span>
        </Col>
        {voltage !== undefined && (
          <Col span={12}>
            <span style={{ color: "#999", fontSize: 12 }}>电压: </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {voltage.toFixed(2)}V
            </span>
            {device.voltage && (
              <span style={{ fontSize: 10, color: "#bbb", marginLeft: 2 }}>
                (计算)
              </span>
            )}
          </Col>
        )}
        <Col span={8}>
          <span style={{ color: "#999", fontSize: 12 }}>状态: </span>
          {device.isOnline ? (
            <Tag color="green" style={{ margin: 0 }}>
              在线
            </Tag>
          ) : (
            <Tag color="default" style={{ margin: 0 }}>
              离线
            </Tag>
          )}
        </Col>
      </Row>

      {/* 网卡地址 */}
      <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>
        网卡: {device.macAddress}
      </div>
```

替换为：

```typescript
      {/* 设备信息 — 1 行 2 列 */}
      <Row gutter={[8, 4]} style={{ marginBottom: 8 }}>
        <Col span={12}>
          <span style={{ color: "#999", fontSize: 12 }}>芯片: </span>
          <span style={{ fontSize: 13 }}>{device.chipId}</span>
        </Col>
        {voltage !== undefined ? (
          <Col span={12}>
            <span style={{ color: "#999", fontSize: 12 }}>电压: </span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {voltage.toFixed(2)}V
            </span>
            {device.voltage && (
              <span style={{ fontSize: 10, color: "#bbb", marginLeft: 2 }}>
                (计算)
              </span>
            )}
          </Col>
        ) : (
          <Col span={12} />
        )}
        <Col span={12}>
          <span style={{ color: "#999", fontSize: 12 }}>网卡: </span>
          <span style={{ fontSize: 12 }}>{device.macAddress}</span>
        </Col>
        <Col span={12}>
          <span style={{ color: "#999", fontSize: 12 }}>状态: </span>
          {device.isOnline ? (
            <Tag color="green" style={{ margin: 0 }}>
              在线
            </Tag>
          ) : (
            <Tag color="default" style={{ margin: 0 }}>
              离线
            </Tag>
          )}
        </Col>
      </Row>
```

关键变化：
- `gutter={[8, 4]}` 支持水平+垂直间距
- 每格 `span={12}`，4 格分两行
- 电压无值时占位空 Col（保持网格对齐）
- 网卡地址并入网格，不再单独一行

- [ ] **Step 2: 提交**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
git add app/watering/components/device-card.tsx
git commit -m "refactor(watering): change device info section to 2-column grid"
```

---

### Task 2: 流程按钮重构 — 布局规则和颜色状态

**Files:**
- Modify: `app/watering/components/device-card.tsx:173-242`

- [ ] **Step 1: 移除"运行中"状态文字行**

删除第 173-180 行的当前执行状态提示：

删除这段：
```typescript
      {/* 当前执行状态 */}
      {device.state?.switch === "on" &&
        device.state.process &&
        device.state.process.name && (
          <div style={{ color: "#1677ff", fontSize: 13, marginBottom: 8 }}>
            运行中: {device.state.process.name}
          </div>
        )}
```

按钮自身的红色+停止文案已经足够标示运行状态，不需要重复提示。

- [ ] **Step 2: 替换流程按钮区域**

将当前第 182-242 行的流程按钮块（含 Dropdown 包装）整体替换为：

```typescript
      {/* 流程快捷按钮 — 1 行 2 列，奇数个首项占整行 */}
      {device.isOnline && processes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {(() => {
            const items: { idx: number; span: number }[] = [];
            if (processes.length % 2 === 1) {
              // 奇数个：第 1 个占整行
              items.push({ idx: 0, span: 24 });
              for (let i = 1; i < processes.length; i++) {
                items.push({ idx: i, span: 12 });
              }
            } else {
              // 偶数个：每行 2 个
              for (let i = 0; i < processes.length; i++) {
                items.push({ idx: i, span: 12 });
              }
            }
            const rows: { idx: number; span: number }[][] = [];
            let i = 0;
            while (i < items.length) {
              if (items[i].span === 24) {
                rows.push([items[i]]);
                i++;
              } else {
                rows.push(items.slice(i, i + 2));
                i += 2;
              }
            }
            return rows.map((row, rowIdx) => (
              <Row gutter={8} key={rowIdx} style={{ marginBottom: 4 }}>
                {row.map(({ idx, span }) => {
                  const exec = isExec(idx);
                  // 状态 → 按钮映射
                  const isRunning = exec;
                  const isIdle = !exec && !!device.idleSleep;
                  return (
                    <Col span={span} key={idx}>
                      <Button
                        type="primary"
                        danger={isRunning}
                        disabled={isIdle}
                        block
                        size="small"
                        icon={isRunning ? <PauseCircleOutlined /> : <ThunderboltOutlined />}
                        onClick={() => onClickSwitch(idx)}
                      >
                        {isRunning ? "停止" : processes[idx].name}
                      </Button>
                    </Col>
                  );
                })}
              </Row>
            ));
          })()}
        </div>
      )}
```

关键变化：
- 去掉 `Dropdown` 包装，改为纯 `Button` 单击
- 始终 `type="primary"`：运行中加 `danger` 变红，已停止默认蓝色，待机加 `disabled` 变灰
- 运行中按钮文案统一为"停止"，停止/待机显示流程名
- 奇数流程：第一个 `span={24}`，其余 `span={12}` 每行两个
- 使用 IIFE 构建行列结构后渲染（避免 JSX 中复杂逻辑）

- [ ] **Step 3: 清理不再使用的 import**

修改文件顶部导入。

删除 `Dropdown` 导入（第 3 行）：

```typescript
// 改前
import { Card, Tag, Button, Row, Col, message, Popconfirm, Dropdown } from "antd";
// 改后
import { Card, Tag, Button, Row, Col, message, Popconfirm } from "antd";
```

确认 `PlayCircleOutlined` 和 `SettingOutlined` 是否仍被使用。如果不再使用，也一并删除。

检查第 4-12 行图标导入，`ThunderboltOutlined` 和 `PauseCircleOutlined` 仍被按钮使用，保留。`PlayCircleOutlined` 和 `SettingOutlined` 在去掉 Dropdown 后不再使用，删除：

```typescript
// 改前
import {
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
// 改后
import {
  EditOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
```

- [ ] **Step 4: 提交**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
git add app/watering/components/device-card.tsx
git commit -m "feat(watering): refactor process buttons with new layout rules and color states"
```

---

### Task 3: 验证

**Files:**
- 验证 `app/watering/components/device-card.tsx`

- [ ] **Step 1: 检查 TypeScript 编译**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
npx tsc --noEmit 2>&1 | head -30
```

期望：无新增 TypeScript 错误。

- [ ] **Step 2: 启动开发服务器验证页面渲染**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
# 如果已运行则跳过
pnpm dev
```

访问 `http://localhost:3000/watering`，验证以下场景：

| 检查项 | 预期 |
|--------|------|
| 信息区 4 格两列排布 | 芯片/电压 上排，网卡/状态 下排 |
| 无电压时电压格留空 | 芯片格不跨列，电压位空 Col |
| 偶数流程按钮 | 每行 2 个，等宽 |
| 奇数流程按钮 | 第一个占整行，其余每行 2 个 |
| 运行中按钮 | 红色 danger，文案"停止"，可点击 |
| 已停止按钮 | 蓝色 primary，文案为流程名，可点击 |
| 待机中按钮 | 灰色 disabled，文案为流程名，不可点击 |
| 点击运行中按钮 | 终止流程，刷新列表 |
| 点击已停止按钮 | 启动流程，刷新列表 |
| 无 Dropdown 菜单 | 左键/右键点击均不弹出菜单 |
| 离线设备 | 不显示流程按钮 |
| 无流程设备 | 不显示流程按钮区 |

- [ ] **Step 3: 提交修复**

```bash
cd "d:/workspace/自动浇花系统/xiequ/service"
git add -A
git commit -m "chore(watering): verification fixes for device card layout and buttons"
```

---

## 自审

### 1. 设计覆盖

| 设计需求 | 对应任务 |
|----------|----------|
| 信息项 1 行 2 列 | Task 1 — 4 格 Col span=12 |
| 流程按钮一行两个 | Task 2 — span=12 偶数行 |
| 奇数个首项占整行 | Task 2 — span=24 奇数首项 |
| 运行中红色显示"停止" | Task 2 — danger + "停止"文案 |
| 停止时蓝色 | Task 2 — type="primary" 默认蓝色 |
| 待机不可点击 | Task 2 — disabled + idleSleep |
| 移除 Dropdown | Task 2 — 去掉 Dropdown 包装 |

### 2. 占位符检查
无 TBD、TODO、"implement later" 等占位符。

### 3. 类型一致性
- `isExec(idx)` 已在组件中定义，返回 boolean
- `device.idleSleep` 来自 `DeviceConfig` 类型，boolean
- `processes` 来自 `device.processes`，`Process[]`
- Button 的 `danger`/`disabled`/`block`/`type` 均为 Ant Design 标准 API
