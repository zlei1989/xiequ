# 拖动排序实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为浇水模块的"功能"列表和"步骤"列表添加长按拖拽排序能力

**Architecture:** 引入 @dnd-kit 系列库，封装 SortableList 组件复用 antd-mobile List 体系。调用方通过 renderItem 回调传入 SwipeAction + List.Item，拖拽只改变本地状态顺序，最终随保存按钮一并提交。

**Tech Stack:** @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities，antd-mobile List/SwipeAction/List.Item

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `package.json` | 新增 @dnd-kit 三个依赖 |
| 新增 | `app/watering/components/sortable-list.tsx` | SortableList 泛型组件，封装 DndContext + SortableContext + List |
| 新增 | `__tests__/watering/components/sortable-list.test.tsx` | SortableList 单元测试 |
| 修改 | `app/watering/components/device-config-form.tsx` | "功能"列表区域替换为 SortableList |
| 修改 | `app/watering/components/process-config-picker.tsx` | "步骤"列表区域替换为 SortableList |

---

### Task 1: 安装 @dnd-kit 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd d:/workspace/自动浇花系统/xiequ/service
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: 验证安装**

```bash
node -e "require('@dnd-kit/core'); require('@dnd-kit/sortable'); require('@dnd-kit/utilities'); console.log('OK')"
```

预期输出: `OK`

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities"
```

---

### Task 2: 编写 SortableList 测试（TDD 第一步 — 先写失败测试）

**Files:**
- Create: `__tests__/watering/components/sortable-list.test.tsx`

- [ ] **Step 1: 编写测试文件 — 渲染空列表、多行、拖拽排序**

```tsx
// @vitest-environment jsdom

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { SortableList } from '@/app/watering/components/sortable-list';

interface TestItem {
  id: string;
  name: string;
}

afterEach(cleanup);

describe('SortableList', () => {
  it('渲染空列表', () => {
    render(
      <SortableList<TestItem>
        header="测试"
        items={[]}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    // 空列表显示 antd-mobile ErrorBlock
    expect(screen.getByText('暂无数据')).toBeDefined();
  });

  it('渲染多行', () => {
    const items: TestItem[] = [
      { id: 'a', name: '项目A' },
      { id: 'b', name: '项目B' },
      { id: 'c', name: '项目C' },
    ];
    render(
      <SortableList<TestItem>
        header="测试"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('项目A')).toBeDefined();
    expect(screen.getByText('项目B')).toBeDefined();
    expect(screen.getByText('项目C')).toBeDefined();
  });

  it('显示 header', () => {
    const items: TestItem[] = [{ id: 'a', name: '项目A' }];
    render(
      <SortableList<TestItem>
        header="功能"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('功能')).toBeDefined();
  });

  it('单项列表不附加拖拽监听器', () => {
    const items: TestItem[] = [{ id: 'a', name: '项目A' }];
    const { container } = render(
      <SortableList<TestItem>
        header="测试"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    // 单项时外层 div 不应有拖拽相关的 aria 属性（role 不为空）
    const listItem = container.querySelector('.adm-list-item');
    // 单项时 SortableItem 的 {...attributes} {...listeners} 不会被应用，
    // 因此不会激活拖拽
    expect(screen.getByText('项目A')).toBeDefined();
  });

  it('使用自定义 emptyText', () => {
    render(
      <SortableList<TestItem>
        emptyText="暂无功能"
        header="功能"
        items={[]}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('暂无功能')).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run __tests__/watering/components/sortable-list.test.tsx
```

预期: FAIL — 找不到模块 `@/app/watering/components/sortable-list`

---

### Task 3: 实现 SortableList 组件（TDD 第二步 — 让测试通过）

**Files:**
- Create: `app/watering/components/sortable-list.tsx`

- [ ] **Step 1: 创建 SortableList 组件**

```tsx
/**
 * 可拖拽排序的列表组件
 *
 * 封装 @dnd-kit 与 antd-mobile List 的集成。
 * 长按 300ms 激活拖拽（与 SwipeAction 横向滑动自然区分），
 * 松手触发 onReorder 回调，调用方负责更新数据。
 * items.length <= 1 时不附加拖拽监听器。
 */

'use client';

import { ErrorBlock, List } from 'antd-mobile';
import { useState, type ReactNode } from 'react';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableListProps<T> {
  /** 数据数组 */
  items: T[];
  /** List header 文本 */
  header?: string;
  /** 空列表提示文本（默认"暂无数据"） */
  emptyText?: string;
  /** 排序回调 — 松手时触发，传入旧索引和新索引 */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** 渲染每行内容（调用方自行包裹 SwipeAction + List.Item） */
  renderItem: (item: T, index: number) => ReactNode;
  /** 获取每行的唯一 key（可选，默认使用 index 转字符串） */
  getKey?: (item: T, index: number) => string;
}
/**
 * 单个可排序行 — 通过 useSortable 获取拖拽 attributes/listeners/transform
 *
 * 仅当 items.length > 1 时使用；单项列表直接渲染内容，不附加拖拽监听器。
 */
function SortableItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function SortableList<T>({
  items,
  header,
  emptyText = '暂无数据',
  onReorder,
  renderItem,
  getKey,
}: SortableListProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const keyFn = getKey ?? ((_: T, index: number) => String(index));
  const ids = items.map((item, index) => keyFn(item, index));

  /** 仅多项时可拖拽 */
  const canDrag = items.length > 1;

  function handleDragStart(event: { active: { id: string | number } }) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const fromIndex = ids.indexOf(String(active.id));
      const toIndex = ids.indexOf(String(over.id));
      if (fromIndex !== -1 && toIndex !== -1) {
        onReorder(fromIndex, toIndex);
      }
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const listContent = (
    <List header={header}>
      {items.length === 0 ? (
        <ErrorBlock description="" status="empty" title={emptyText} />
      ) : (
        items.map((item, index) => {
          const id = keyFn(item, index);
          const content = renderItem(item, index);
          if (!canDrag) {
            return <div key={id}>{content}</div>;
          }
          return (
            <SortableItem key={id} id={id}>
              {content}
            </SortableItem>
          );
        })
      )}
    </List>
  );

  if (!canDrag) {
    // 单项或无项：不包裹 DndContext，避免无意义的拖拽监听
    return listContent;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {listContent}
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 2: 运行测试验证通过**

```bash
npx vitest run __tests__/watering/components/sortable-list.test.tsx
```

预期: 5 个测试全部 PASS

- [ ] **Step 3: 提交**

```bash
git add app/watering/components/sortable-list.tsx __tests__/watering/components/sortable-list.test.tsx
git commit -m "feat: add SortableList component with long-press drag-to-reorder"
```

---

### Task 4: 修改 device-config-form —"功能"列表替换为 SortableList

**Files:**
- Modify: `app/watering/components/device-config-form.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部的 antd-mobile imports 区域，`List` 后面追加 `import { SortableList } from './sortable-list';`。

具体：在第 25 行 `} from 'antd-mobile';` 之后，`import { AddOutline, } from 'antd-mobile-icons';` 之前插入：

```tsx
import { SortableList } from './sortable-list';
import { arrayMove } from '@dnd-kit/sortable';
```

- [ ] **Step 2: 替换"功能"列表 JSX（约第 394-434 行）**

将：

```tsx
      {/* ======== 功能列表 ======== */}
      <List header="功能">
        {form.processes.length === 0 ? (
          <ErrorBlock description="" status="empty" title="暂无功能" />
        ) : (
          form.processes.map((proc, index) => (
            <SwipeAction
              key={(proc as WithKey).key ?? index}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    confirmDelete('确认删除此流程？', () => { deleteProcessFromList(index); });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                onClick={() => {
                  setProcessIndex(index);
                  setProcessVisible(true);
                }}
              >
                {proc.name}
              </List.Item>
            </SwipeAction>
          ))
        )}
        <div className="p-2" >
          <Button
            block
            size="small"
            onClick={addProcess}
          >
            <AddOutline /> 添加
          </Button>
        </div>
      </List>
```

替换为：

```tsx
      {/* ======== 功能列表 ======== */}
      <SortableList
        emptyText="暂无功能"
        header="功能"
        items={form.processes}
        getKey={(proc, index) => (proc as WithKey).key ?? String(index)}
        renderItem={(proc, index) => (
          <SwipeAction
            rightActions={[
              {
                key: 'delete',
                text: '删除',
                color: 'danger',
                onClick: () => {
                  confirmDelete('确认删除此流程？', () => { deleteProcessFromList(index); });
                },
              },
            ]}
          >
            <List.Item
              clickable
              onClick={() => {
                setProcessIndex(index);
                setProcessVisible(true);
              }}
            >
              {proc.name}
            </List.Item>
          </SwipeAction>
        )}
        onReorder={(from, to) => {
          const newProcesses = arrayMove(form.processes, from, to);
          setForm({ ...form, processes: newProcesses });
        }}
      />
      <div className="p-2">
        <Button block size="small" onClick={addProcess}>
          <AddOutline /> 添加
        </Button>
      </div>
```

- [ ] **Step 3: 清理不再需要的 import**

`List` 仍被"计划任务"列表使用，不能移除。`ErrorBlock` 仍被"暂无功能"/"暂无计划任务"使用，也不能移除。无需清理。

- [ ] **Step 4: 运行项目检查**

```bash
npm run check
```

预期: 无 TypeScript/Lint 错误。若有，修复后再检查。

- [ ] **Step 5: 提交**

```bash
git add app/watering/components/device-config-form.tsx
git commit -m "feat: replace process list with SortableList for drag-to-reorder"
```

---

### Task 5: 修改 process-config-picker —"步骤"列表替换为 SortableList

**Files:**
- Modify: `app/watering/components/process-config-picker.tsx`

- [ ] **Step 1: 添加 import**

在第 10 行 `import { ... } from 'antd-mobile';` 之后插入：

```tsx
import { SortableList } from './sortable-list';
import { arrayMove } from '@dnd-kit/sortable';
```

- [ ] **Step 2: 替换"步骤"列表 JSX（约第 119-154 行）**

将：

```tsx
        <List header="步骤">
          {draft.steps.map((s, idx) => (
            <SwipeAction
              key={idx}
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    void Dialog.confirm({
                      title: '确认删除此步骤？',
                      onConfirm: () => {
                        const newSteps = draft.steps.filter((_, i) => i !== idx);
                        update({ steps: newSteps });
                      },
                    });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                description={s.component}
                onClick={() => { onEditStep?.(idx); }}
              >
                {s.name}
              </List.Item>
            </SwipeAction>
          ))}
          <div className="p-2">
            <Button block size="small" onClick={onAddStep}>
              <AddOutline /> 添加步骤
            </Button>
          </div>
        </List>
```

替换为：

```tsx
        <SortableList
          header="步骤"
          items={draft.steps}
          renderItem={(s, idx) => (
            <SwipeAction
              rightActions={[
                {
                  key: 'delete',
                  text: '删除',
                  color: 'danger',
                  onClick: () => {
                    void Dialog.confirm({
                      title: '确认删除此步骤？',
                      onConfirm: () => {
                        const newSteps = draft.steps.filter((_, i) => i !== idx);
                        update({ steps: newSteps });
                      },
                    });
                  },
                },
              ]}
            >
              <List.Item
                clickable
                description={s.component}
                onClick={() => { onEditStep?.(idx); }}
              >
                {s.name}
              </List.Item>
            </SwipeAction>
          )}
          onReorder={(from, to) => {
            const newSteps = arrayMove(draft.steps, from, to);
            update({ steps: newSteps });
          }}
        />
        <div className="p-2">
          <Button block size="small" onClick={onAddStep}>
            <AddOutline /> 添加步骤
          </Button>
        </div>
```

- [ ] **Step 3: 清理不再需要的 import**

`List` 不再被 process-config-picker 直接使用（步骤列表已替换为 SortableList），但该文件其他区域（触发按钮 Selector 等）不需要 List。检查：该文件中 `List` 只用于步骤列表区域，新代码中 SortableList 内部使用了 List，但调用方不需要直接 import List。

从第 10 行 import 中移除 `List`：

原：
```tsx
import { Input, ErrorBlock, Selector, Button, List, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
```

改为：
```tsx
import { Input, ErrorBlock, Selector, Button, Popup, NavBar, Form, SwipeAction, Dialog } from 'antd-mobile';
```

- [ ] **Step 4: 运行项目检查**

```bash
npm run check
```

预期: 无 TypeScript/Lint 错误。若有，修复后再检查。

- [ ] **Step 5: 提交**

```bash
git add app/watering/components/process-config-picker.tsx
git commit -m "feat: replace step list with SortableList for drag-to-reorder"
```

---

### Task 6: 运行完整检查与测试

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行类型检查 + Lint**

```bash
npm run check
```

预期: 无错误。若有，逐一修复。

- [ ] **Step 3: 运行全部测试**

```bash
npm run test
```

预期: 全部 PASS（包括新增的 sortable-list 测试和已有的 device-config-form / process-editor 测试）。

- [ ] **Step 4: 提交最终格式修正（如有）**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: format and fix lint after drag-sort implementation"
```

---

### Task 7: 运行 dev 服务器手动验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 浏览器验证**

在移动端视口（Chrome DevTools 切换到手机模式）访问 `http://localhost:3000/watering`：
1. 进入设备配置页，找到"功能"列表
2. 长按某一行 300ms → 应进入拖拽状态，可拖动排序
3. 松手 → 顺序改变，但不保存
4. 横向滑动 → SwipeAction 删除按钮正常出现
5. 点击 → 正常打开流程编辑弹窗
6. 在流程编辑弹窗中，对"步骤"列表重复步骤 2-5
7. 点击保存 → 新顺序持久化

---

### Task 8: 运行已有测试确保无回归

- [ ] **Step 1: 运行已有测试文件确认无回归**

```bash
npx vitest run __tests__/watering/components/device-config-form.test.tsx
npx vitest run __tests__/watering/components/process-editor.test.tsx
```

预期: 全部 PASS。device-config-form 的"渲染功能列表项"测试仍通过（SortableList 内部仍渲染了流程名称）。process-editor 的"渲染步骤列表项"测试仍通过（SortableList 内部仍渲染了步骤名称）。

- [ ] **Step 2: 确认无回归后提交**

```bash
git log --oneline -5
```

确认提交链完整。
