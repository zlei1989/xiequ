# Popup 蒙层关闭统一 + NavBar 返回键 URL 栈修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一所有 Popup 支持蒙层关闭，修复 NavBar 返回键产生的多余浏览器 URL 栈

**Architecture:** 在 `lib/back-button.ts` 的 effect cleanup 中利用 `handlePopstate` 已将 `onCloseRef.current` 置空这一标记，判断关闭来源。若非 popstate 触发且栈变空，调用 `history.back()` 消费占位。5 个 watering Picker 的 Popup 各加 `closeOnMaskClick` + `onMaskClick`。

**Tech Stack:** React 19, TypeScript, vitest + @testing-library/react + jsdom

---

### Task 1: 修复 `lib/back-button.ts` — NavBar 返回键 URL 栈残留

**Files:**
- Modify: `lib/back-button.ts:109-119`

- [ ] **Step 1: 修改 effect cleanup 中的出栈逻辑**

将 `lib/back-button.ts` 第 109-119 行的 cleanup return 改为：

```ts
return () => {
  // 从栈中移除当前 entry
  const idx = stack.findIndex((e) => e.id === entry.id);
  if (idx !== -1) {
    // 判断本次关闭是否由 handlePopstate（系统返回键）触发
    // handlePopstate 会在调用 onClose 前将 onCloseRef.current 置为 null
    const closedByPopstate = stack[idx].onCloseRef.current === null;
    stack.splice(idx, 1);

    // 栈空则清理监听器
    if (stack.length === 0 && listenerRegistered) {
      window.removeEventListener('popstate', handlePopstate);
      listenerRegistered = false;
      // 若非系统返回键触发的关闭，占位状态未被消费，需手动清理
      if (!closedByPopstate) {
        window.history.back();
      }
    }
  }
};
```

- [ ] **Step 2: 运行现有测试确保不破坏已有行为**

```bash
npx vitest run __tests__/lib/back-button.test.ts
```

预期：所有 8 个测试通过

- [ ] **Step 3: 提交**

```bash
git add lib/back-button.ts
git commit -m "fix: clean up history placeholder when popup closes via NavBar instead of system back"
```

---

### Task 2: 为 NavBar 返回键修复添加测试

**Files:**
- Modify: `__tests__/lib/back-button.test.ts:15-16, 50-52, 336-348`

- [ ] **Step 1: 在测试的 mock 中添加 `history.back`**

在 `__tests__/lib/back-button.test.ts` 第 13-15 行，给 `pushState` 声明后面增加 `back`：

```ts
let eventListeners: Record<string, EventListener[]>;
let pushState: ReturnType<typeof vi.fn>;
let back: ReturnType<typeof vi.fn>;
```

第 16-21 行的 `beforeEach` 中，在 `pushState = vi.fn()` 后增加 `back` 并在 `window.history` 中增加：

```ts
beforeEach(() => {
  vi.resetModules();
  eventListeners = {};
  pushState = vi.fn();
  back = vi.fn();
  vi.stubGlobal('window', {
    history: { pushState, back },
    location: { href: 'http://localhost:3000/test' },
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      (eventListeners[event] ??= []).push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
      const arr = eventListeners[event];
      if (!arr) return;
      const i = arr.indexOf(handler);
      if (i !== -1) arr.splice(i, 1);
    }),
  });
});
```

- [ ] **Step 2: 在最后一个测试之后（第 348 行后），SSR 测试之前，添加新测试用例**

在 `it('SSR 环境...', ...)` 测试之前（第 337 行前）插入：

```ts
it('通过 NavBar/代码关闭弹窗（非 popstate）时调用 history.back() 清理占位', async () => {
  const useBackButton = await loadHook();
  const onClose = vi.fn();

  const { rerender, unmount } = renderHook<
    ReturnType<typeof useBackButton>,
    { visible: boolean }
  >(({ visible }) => { useBackButton(visible, onClose); },
    { initialProps: { visible: false } },
  );

  // 打开弹窗 → pushState 被调用（注入占位）
  rerender({ visible: true });
  expect(pushState).toHaveBeenCalledTimes(1);
  expect(back).not.toHaveBeenCalled();

  // 通过代码关闭弹窗（模拟 NavBar onBack）
  // 注意：不触发 firePopstate()
  rerender({ visible: false });

  // 栈空 + 非 popstate 关闭 → history.back() 被调用
  expect(back).toHaveBeenCalledOnce();

  // 监听器应被清理
  expect(popstateCount()).toBe(0);

  unmount();
});

it('嵌套弹窗：系统返回键关闭顶层后，NavBar 关闭底层也调用 history.back()', async () => {
  const useBackButton = await loadHook();
  const onCloseA = vi.fn();
  const onCloseB = vi.fn();

  // 底层弹窗 A
  const { rerender: rerenderA, unmount: unmountA } = renderHook<
    ReturnType<typeof useBackButton>,
    { visible: boolean }
  >(({ visible }) => { useBackButton(visible, onCloseA); },
    { initialProps: { visible: false } },
  );
  rerenderA({ visible: true });
  expect(pushState).toHaveBeenCalledTimes(1);

  // 顶层弹窗 B
  const { rerender: rerenderB, unmount: unmountB } = renderHook<
    ReturnType<typeof useBackButton>,
    { visible: boolean }
  >(({ visible }) => { useBackButton(visible, onCloseB); },
    { initialProps: { visible: false } },
  );
  rerenderB({ visible: true });
  // B 打开也调 pushState（非首个弹窗，但也注入占位）
  // 注：当前实现中每个 visible=true 都会 pushPlaceholder，首个只负责注册监听器

  // 系统返回键关闭 B（popstate 触发）
  firePopstate();
  expect(onCloseB).toHaveBeenCalledOnce();
  // 模拟 React 更新：B visible=false
  rerenderB({ visible: false });
  // B 通过 popstate 关闭，不应调 back（栈非空）
  const backCallsAfterBClose = back.mock.calls.length;

  // 通过 NavBar 关闭底层 A
  rerenderA({ visible: false });

  // A 是最后一个弹窗 + 非 popstate 关闭 → 应调 history.back()
  expect(back.mock.calls.length).toBe(backCallsAfterBClose + 1);

  unmountB();
  unmountA();
});
```

- [ ] **Step 3: 运行所有 back-button 测试**

```bash
npx vitest run __tests__/lib/back-button.test.ts
```

预期：全部 10 个测试通过（原有 8 个 + 新增 2 个）

- [ ] **Step 4: 提交**

```bash
git add __tests__/lib/back-button.test.ts
git commit -m "test: add cases for history.back() cleanup on non-popstate popup close"
```

---

### Task 3: `process-config-picker.tsx` — 添加蒙层关闭

**Files:**
- Modify: `app/watering/components/process-config-picker.tsx:76-82`

- [ ] **Step 1: 在 Popup 上加 `closeOnMaskClick` 和 `onMaskClick`**

```diff
     <Popup
       afterClose={afterClose}
+      closeOnMaskClick={true}
       bodyStyle={{ height: '80vh' }}
       position="bottom"
       visible={open}
       onClose={onClose}
+      onMaskClick={onClose}
     >
```

- [ ] **Step 2: 运行检查确认无类型错误**

```bash
npx tsc --noEmit
```

预期：无新增错误

- [ ] **Step 3: 提交**

```bash
git add app/watering/components/process-config-picker.tsx
git commit -m "feat: add mask click to close for process config picker popup"
```

---

### Task 4: `step-config-picker.tsx` — 添加蒙层关闭

**Files:**
- Modify: `app/watering/components/step-config-picker.tsx:67-73`

- [ ] **Step 1: 在 Popup 上加 `closeOnMaskClick` 和 `onMaskClick`**

```diff
     <Popup
       afterClose={afterClose}
+      closeOnMaskClick={true}
       bodyStyle={{ height: '75vh' }}
       position="bottom"
       visible={open}
       onClose={onClose}
+      onMaskClick={onClose}
     >
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/components/step-config-picker.tsx
git commit -m "feat: add mask click to close for step config picker popup"
```

---

### Task 5: `interrupt-config-picker.tsx` — 添加蒙层关闭

**Files:**
- Modify: `app/watering/components/interrupt-config-picker.tsx:83-89`

- [ ] **Step 1: 在 Popup 上加 `closeOnMaskClick` 和 `onMaskClick`**

```diff
     <Popup
       afterClose={afterClose}
+      closeOnMaskClick={true}
       bodyStyle={{ height: '70vh' }}
       position="bottom"
       visible={open}
       onClose={onClose}
+      onMaskClick={onClose}
     >
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/components/interrupt-config-picker.tsx
git commit -m "feat: add mask click to close for interrupt config picker popup"
```

---

### Task 6: `voltage-config-picker.tsx` — 添加蒙层关闭

**Files:**
- Modify: `app/watering/components/voltage-config-picker.tsx:79-85`

- [ ] **Step 1: 在 Popup 上加 `closeOnMaskClick` 和 `onMaskClick`**

```diff
     <Popup
       afterClose={afterClose}
+      closeOnMaskClick={true}
       bodyStyle={{ height: '60vh' }}
       position="bottom"
       visible={open}
       onClose={handleClose}
+      onMaskClick={handleClose}
     >
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/components/voltage-config-picker.tsx
git commit -m "feat: add mask click to close for voltage config picker popup"
```

---

### Task 7: `schedule-config-picker.tsx` — 添加蒙层关闭

**Files:**
- Modify: `app/watering/components/schedule-config-picker.tsx:84-90`

- [ ] **Step 1: 在 Popup 上加 `closeOnMaskClick` 和 `onMaskClick`**

```diff
     <Popup
       afterClose={afterClose}
+      closeOnMaskClick={true}
       bodyStyle={{ height: '70vh' }}
       position="bottom"
       visible={open}
       onClose={onClose}
+      onMaskClick={onClose}
     >
```

- [ ] **Step 2: 提交**

```bash
git add app/watering/components/schedule-config-picker.tsx
git commit -m "feat: add mask click to close for schedule config picker popup"
```

---

### Task 8: 格式化、全量检查、最终提交

**Files:**
- (无新文件，验证所有改动)

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

- [ ] **Step 2: 运行全量检查**

```bash
npm run check
```

预期：无错误。若有 lint/类型错误，修复后重新运行。

- [ ] **Step 3: 运行全部测试**

```bash
npm run test
```

预期：所有测试通过

- [ ] **Step 4: 最终提交（如有 format 产生的改动）**

```bash
git add -A
git commit -m "chore: format and final verification for popup mask close and navbar back fix"
```
