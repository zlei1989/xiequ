# 浇花模块子页面 Route Group 收敛 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `app/watering/` 下的 `debug/`、`devices/[chipId]/`、`logs/[chipId]/` 三个子页面收进 Route Group `(subpages)/`。

**Architecture:** 创建 `app/watering/(subpages)/` 路由组目录，将三个子页面移入并更新 import 路径。URL 不变，零业务逻辑变更。

**Tech Stack:** Next.js App Router Route Groups，TypeScript，React

---

### Task 1: 创建目录并移动 debug/page.tsx

**Files:**
- Create: `app/watering/(subpages)/debug/page.tsx`
- Delete: `app/watering/debug/page.tsx`

- [ ] **Step 1: 创建所有目标目录**

```bash
mkdir -p "app/watering/(subpages)/debug" "app/watering/(subpages)/devices/[chipId]" "app/watering/(subpages)/logs/[chipId]"
```

- [ ] **Step 2: 写入 debug/page.tsx（import 路径 `../` → `../../`）**

```tsx
/**
 * IoT 设备模拟器调试页
 *
 * 模拟 ESP32 设备发起 getState / pushState 请求，用于调试服务端设备协议。
 */

'use client';

import { NavBar } from 'antd-mobile';
import { useRouter } from 'next/navigation';

import { DebugButtonCard } from '../../components/debug-button-card';
import { DebugForm } from '../../components/debug-form';
import { DebugLoadCard } from '../../components/debug-load-card';
import { DebugResponseList } from '../../components/debug-response-list';
import { useIotSimulator } from '../../hooks/use-iot-simulator';

export default function DebugPage() {
  const {
    identity,
    setIdentity,
    gpio,
    setGpio,
    logs,
    loading,
    getState,
    pushBootstrap,
    pushChange,
    pushFinish,
    clearLogs,
  } = useIotSimulator();
  const router = useRouter();

  return (
    <>
      <NavBar
        onBack={() => { router.back(); }}
      >
        调试服务
      </NavBar>
      <DebugForm
        gpio={gpio}
        identity={identity}
        onGpioChange={setGpio}
        onIdentityChange={setIdentity}
      />
      <div className="flex flex-col gap-4 p-4">
        <DebugLoadCard loads={gpio.loads} />
        <DebugButtonCard
          loading={loading}
          onGetState={getState}
          onPushBootstrap={pushBootstrap}
          onPushChange={pushChange}
          onPushFinish={pushFinish}
        />
        <DebugResponseList logs={logs} onClear={clearLogs} />
      </div>
    </>
  );
}
```

- [ ] **Step 3: 删除旧文件并清理空目录**

```bash
rm "app/watering/debug/page.tsx"
rmdir "app/watering/debug" 2>/dev/null; true
```

- [ ] **Step 4: 运行检查**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && npm run check
```

- [ ] **Step 5: 提交**

```bash
git add "app/watering/(subpages)/debug/page.tsx" "app/watering/debug/page.tsx"
git commit -m "refactor: 将 debug/page.tsx 移入 (subpages)/debug/"
```

---

### Task 2: 移动 devices/[chipId]/page.tsx

**Files:**
- Create: `app/watering/(subpages)/devices/[chipId]/page.tsx`
- Delete: `app/watering/devices/[chipId]/page.tsx`

- [ ] **Step 1: 写入 devices/[chipId]/page.tsx（import 路径 `../../` → `../../../`）**

```tsx
/**
 * 设备详情/配置页
 *
 * 展示单个设备的完整配置编辑器，顶栏提供保存/删除/返回操作。
 * 通过 saveRef 模式将保存函数从 DeviceEditor 传递到 Header 按钮。
 */

'use client';

import { ArrowLeftOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import { Spin, Button, Popconfirm, message } from 'antd';
import { useRouter } from 'next/navigation';
import { use, useRef } from 'react';

import { DeviceEditor } from '../../../components/device-editor';
import { useDeviceConfig } from '../../../hooks/use-device-config';

/** 设备详情页 */
export default function DeviceDetailPage({
  params,
}: {
  /** Next.js 15 将动态路由参数以 Promise 形式传递，需 use() 解包 */
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { config, gpio, loading, save, remove } = useDeviceConfig(chipId);

  // DeviceEditor 将 handleSave 注册到此 ref，Header 保存按钮通过它触发保存
  const saveRef = useRef<() => Promise<void>>(async () => {});

  async function handleRemove() {
    try {
      await remove();
      message.success('设备已删除');
      router.push('/watering');
    } catch (err: unknown) {
      console.error('[Watering] 删除设备失败:', { chipId, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      message.error(err instanceof Error ? err.message : String(err) || '删除失败');
    }
  }

  if (loading || !config) {
    return (
      <div className="py-12 text-center">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      {/* 页面内顶栏操作按钮 — 匹配 iot-wfm EditView header extra */}
      <div
        className="flex items-center justify-between border-0 border-b border-solid border-gray-100 bg-white p-3"
      >
        <h3 className="m-0 text-base">{config.name || '设备配置'}</h3>
        <div className="flex gap-2">
          <Button
            icon={<SaveOutlined />}
            type="primary"
            onClick={() => { void saveRef.current(); }}
          >
            保存
          </Button>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises -- antd 支持 Promise */}
          <Popconfirm title="确认删除设备？不可恢复。" onConfirm={handleRemove}>
            <Button danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button icon={<ArrowLeftOutlined />} onClick={() => { router.back(); }}>
            返回
          </Button>
        </div>
      </div>

      <DeviceEditor
        config={config}
        gpio={gpio}
        saveRef={saveRef}
        onRemove={handleRemove}
        onSave={async (data) => {
          try {
            await save(data);
            message.success('配置已保存');
          } catch (err: unknown) {
            // 错误已在 useDeviceConfig 中记日志，此处仅提示用户
            message.error(err instanceof Error ? err.message : String(err) || '保存失败');
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 删除旧文件并清理目录**

```bash
rm "app/watering/devices/[chipId]/page.tsx"
rmdir "app/watering/devices/[chipId]" 2>/dev/null; true
rmdir "app/watering/devices" 2>/dev/null; true
```

- [ ] **Step 3: 运行检查**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && npm run check
```

- [ ] **Step 4: 提交**

```bash
git add "app/watering/(subpages)/devices/[chipId]/page.tsx" "app/watering/devices/[chipId]/page.tsx"
git commit -m "refactor: 将 devices/[chipId]/page.tsx 移入 (subpages)/devices/[chipId]/"
```

---

### Task 3: 移动 logs/[chipId]/page.tsx

**Files:**
- Create: `app/watering/(subpages)/logs/[chipId]/page.tsx`
- Delete: `app/watering/logs/[chipId]/page.tsx`

- [ ] **Step 1: 写入 logs/[chipId]/page.tsx（import 路径 `../../` → `../../../`）**

```tsx
/**
 * 设备日志页
 *
 * 展示设备 IoT 通信日志，支持下拉刷新和清空。
 * 使用 antd-mobile NavBar + PullToRefresh + ErrorBlock 构建移动端友好界面。
 * 日志数据由 services/db.ts 存储，不自动轮询。
 */

'use client';

import {
  Button,
  NavBar,
  PullToRefresh,
  DotLoading,
  ErrorBlock,
  SafeArea,
  Dialog,
  Toast,
} from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
import { useRouter } from 'next/navigation';
import { use, useEffect } from 'react';

import { LogCard } from '../../../components/log-card';
import { useDeviceLogs } from '../../../hooks/use-device-logs';

/** 设备日志页 */
export default function DeviceLogsPage({
  params,
}: {
  /** Next.js 15 将动态路由参数以 Promise 形式传递，需 use() 解包 */
  params: Promise<{ chipId: string }>;
}) {
  const { chipId } = use(params);
  const router = useRouter();
  const { logs, loading, error, load, clear } = useDeviceLogs(chipId);

  // 组件挂载时加载日志
  useEffect(() => {
    void load();
  }, [load]);

  /** 清空日志：弹窗确认 → 执行清空 → Toast 提示 */
  async function handleClear() {
    const confirmed = await Dialog.confirm({
      title: '确认清空日志？',
      content: '操作不可撤销',
    });
    if (!confirmed) return;

    try {
      await clear();
      Toast.show({ icon: 'success', content: '日志已清空' });
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '清空日志失败';
      console.error('[Watering] 清空日志失败:', { chipId, message, stack: err instanceof Error ? err.stack : undefined });
      Toast.show({ icon: 'fail', content: message });
    }
  }

  /**
   * 下拉刷新 / 重试加载 — load 失败时显示 Toast
   *
   * 首次加载失败由 ErrorBlock 处理（见 renderContent），不显示 Toast。
   */
  async function handleRefresh() {
    try {
      await load();
    } catch {
      Toast.show({ icon: 'fail', content: '刷新失败' });
    }
  }

  /** 渲染内容区：按状态分发 */
  function renderContent() {
    // 首次加载中
    if (loading && logs.length === 0) {
      return (<DotLoading />);
    }

    // 首次加载失败
    if (error && logs.length === 0) {
      return (
        <ErrorBlock
          description={error.message}
          status="default"
          title="加载失败"
        >
          <Button color="primary" size="small" onClick={() => { void handleRefresh(); }}>
            点击重试
          </Button>
        </ErrorBlock>
      );
    }

    // 空数据
    if (!loading && logs.length === 0) {
      return (
        <ErrorBlock
          status="empty"
          title="暂无日志"
        />
      );
    }

    // 有日志数据 — 下拉刷新包裹
    return (
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="px-3">
          <LogCard logs={logs} />
        </div>
      </PullToRefresh>
    );
  }

  return (
    <>
      <SafeArea position="top" />
      <NavBar
        right={
          <DeleteOutline
            onClick={() => { void handleClear(); }}
          />
        }
        onBack={() => { router.back(); }}
      >
        设备: {chipId}
      </NavBar>
      {renderContent()}
    </>
  );
}
```

- [ ] **Step 2: 删除旧文件并清理目录**

```bash
rm "app/watering/logs/[chipId]/page.tsx"
rmdir "app/watering/logs/[chipId]" 2>/dev/null; true
rmdir "app/watering/logs" 2>/dev/null; true
```

- [ ] **Step 3: 运行检查**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && npm run check
```

- [ ] **Step 4: 提交**

```bash
git add "app/watering/(subpages)/logs/[chipId]/page.tsx" "app/watering/logs/[chipId]/page.tsx"
git commit -m "refactor: 将 logs/[chipId]/page.tsx 移入 (subpages)/logs/[chipId]/"
```

---

### Task 4: 最终验证与清理

- [ ] **Step 1: 确认旧目录已删除**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && ls -d app/watering/debug app/watering/devices app/watering/logs 2>&1
```

Expected: 三个目录均不存在。

- [ ] **Step 2: 确认新目录结构正确**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && ls -R "app/watering/(subpages)/"
```

Expected: `debug/page.tsx`、`devices/[chipId]/page.tsx`、`logs/[chipId]/page.tsx`。

- [ ] **Step 3: 运行检查与格式化**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && npm run format && npm run check
```

Expected: PASS

- [ ] **Step 4: 运行测试**

```bash
cd "d:\workspace\自动浇花系统\xiequ\service" && npm run test
```

Expected: 全部通过（87/88，1 个预存失败）

- [ ] **Step 5: 提交清理**

```bash
git add -A
git status
```
