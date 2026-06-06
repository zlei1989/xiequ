# API 目录重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 API 路由从集中式 `app/api/` 目录移入各自业务模块，删除与 Server Actions 重复的路由，修复 IoT 固件 URL 命名不一致。

**Architecture:** 采用方案 A（模块内聚），API 路由按模块归位为 `api/` 子目录，删除 7 个与 Server Actions 重复的路由，保留 3 个 Server Action 无法替代的路由并移动到对应模块内。IoT 固件同步更新 URL_PREFIX 和路径常量。

**Tech Stack:** Next.js App Router (Route Handlers), Arduino C++ (IoT firmware)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/watering/api/get-state/route.ts` | IoT 设备轮询状态变化 |
| Create | `app/watering/api/push-state/route.ts` | IoT 设备推送事件 |
| Create | `app/travel/api/download/route.ts` | 图片下载代理（302 重定向） |
| Modify | `app/travel/services/oss.ts:284-292` | 更新代理 URL 引用 |
| Delete | `app/api/iot-wfm/get-list/route.ts` | 与 `getDevices()` action 重复 |
| Delete | `app/api/iot-wfm/get-config/route.ts` | 无调用者 |
| Delete | `app/api/iot-wfm/set-state/route.ts` | 与 `setDeviceSwitch()` action 重复 |
| Delete | `app/api/iot-wfm/set-config/route.ts` | 与 `updateDeviceConfig()` action 重复 |
| Delete | `app/api/iot-wfm/delete/route.ts` | 与 `removeDevice()` action 重复 |
| Delete | `app/api/iot-wfm/get-logs/route.ts` | 与 `getLogs()` action 重复 |
| Delete | `app/api/iot-wfm/clear-logs/route.ts` | 与 `clearLogs()` action 重复 |
| Delete | `app/api/iot-wfm/get-state/route.ts` | 移动到 watering |
| Delete | `app/api/iot-wfm/push-state/route.ts` | 移动到 watering |
| Delete | `app/api/trip-plan/download/route.ts` | 移动到 travel |
| Delete | `app/api/` 目录 | 整个目录删除 |
| Modify | `iot-rom-v2/config.h:34` | URL_PREFIX 改为 `watering/api/` |
| Modify | `iot-rom-v2/NetworkExt.h:32-34` | 路径常量改为 kebab-case |

---

### Task 1: 移动 get-state 路由到 watering 模块

**Files:**
- Create: `app/watering/api/get-state/route.ts`
- Delete: `app/api/iot-wfm/get-state/route.ts`

- [ ] **Step 1: 创建目标目录并写入路由文件**

```ts
// app/watering/api/get-state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceState, updateTick } from "@/app/watering/services/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const clientStateId = searchParams.get("stateId") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  updateTick(chipId);

  // 读取当前状态
  const state = getDeviceState(chipId);

  // 比较是否有变化
  const changed = !state || clientStateId !== state.stateId;

  return NextResponse.json({
    data: {
      ...(changed && state ? state : { stateId: state?.stateId }),
      changed,
    },
  });
}
```

- [ ] **Step 2: 删除旧文件**

```bash
rm app/api/iot-wfm/get-state/route.ts
rmdir app/api/iot-wfm/get-state
```

- [ ] **Step 3: 验证构建**

```bash
pnpm build
```

Expected: 构建成功，新路由 `/watering/api/get-state` 出现在输出中

- [ ] **Step 4: 提交**

```bash
git add app/watering/api/get-state/route.ts app/api/iot-wfm/get-state/
git commit -m "refactor: move get-state API route into watering module"
```

---

### Task 2: 移动 push-state 路由到 watering 模块

**Files:**
- Create: `app/watering/api/push-state/route.ts`
- Delete: `app/api/iot-wfm/push-state/route.ts`

- [ ] **Step 1: 创建路由文件**

```ts
// app/watering/api/push-state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick } from "@/app/watering/services/db";
import { newId } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get("chipId") || "";
  const macAddress = searchParams.get("macAddress") || "";
  const event = searchParams.get("event") || "";

  if (!chipId || !macAddress) {
    return NextResponse.json({ error: "chipId and macAddress required" }, { status: 400 });
  }

  // 刷新心跳
  updateTick(chipId);

  // 解析 GPIO 状态
  const gpioState: Record<string, Record<string, number>> = { buttons: {}, sensors: {}, loads: {} };
  searchParams.forEach((value, key) => {
    const match = key.match(/^(button|sensor|load):(.+)$/);
    if (match) {
      const category = match[1] === "button" ? "buttons" : match[1] === "sensor" ? "sensors" : "loads";
      gpioState[category][match[2]] = parseInt(value) || 0;
    }
  });

  // 处理事件
  switch (event) {
    case "bootstrap": {
      // 首次上线，创建默认配置（如不存在）
      let config = getDeviceConfig(chipId);
      if (!config) {
        config = {
          chipId,
          name: `IOT-${chipId}`,
          macAddress,
          processes: [],
          idleSleep: false,
          idleTimeout: 30000,
          bootExec: -1,
          execDelay: 0,
          schedules: [],
          createdTime: new Date().toISOString(),
          lastWriteTime: new Date().toISOString(),
        };
        saveDeviceConfig(config);
      }

      let state = getDeviceState(chipId);
      if (!state) {
        state = {
          chipId,
          stateId: newId(),
          switch: "off",
          lastWriteTime: new Date().toISOString(),
        };
      }
      // 合并 GPIO 状态
      Object.assign(state, {
        buttons: gpioState.buttons,
        sensors: gpioState.sensors,
        loads: gpioState.loads,
        stateId: newId(),
        lastWriteTime: new Date().toISOString(),
      });
      saveDeviceState(state);

      // 记录日志
      writeDeviceLog(chipId, "bootstrap", { macAddress, cause: searchParams.get("cause") || "" });
      if (state.switch === "on" && state.process) {
        writeDeviceLog(chipId, "execute", { stateId: state.stateId, index: state.index });
      }
      break;
    }
    case "finish": {
      const state = getDeviceState(chipId);
      if (state && state.switch !== "off") {
        state.switch = "off";
        state.index = undefined;
        state.process = undefined;
        state.message = undefined;
        state.stateId = newId();
        state.lastWriteTime = new Date().toISOString();
        saveDeviceState(state);
      }
      writeDeviceLog(chipId, "finish", { macAddress });
      break;
    }
    default: {
      // 普通状态上报
      writeDeviceLog(chipId, event || "heartbeat", {
        macAddress,
        buttons: gpioState.buttons,
        sensors: gpioState.sensors,
        loads: gpioState.loads,
      });
      break;
    }
  }

  return NextResponse.json({ data: undefined });
}
```

- [ ] **Step 2: 删除旧文件**

```bash
rm app/api/iot-wfm/push-state/route.ts
rmdir app/api/iot-wfm/push-state
```

- [ ] **Step 3: 验证构建**

```bash
pnpm build
```

Expected: 构建成功，路由 `/watering/api/push-state` 出现在输出中

- [ ] **Step 4: 提交**

```bash
git add app/watering/api/push-state/route.ts app/api/iot-wfm/push-state/
git commit -m "refactor: move push-state API route into watering module"
```

---

### Task 3: 移动 download 路由到 travel 模块 + 更新 oss.ts 引用

**Files:**
- Create: `app/travel/api/download/route.ts`
- Modify: `app/travel/services/oss.ts:284-292`
- Delete: `app/api/trip-plan/download/route.ts`

- [ ] **Step 1: 创建路由文件**

注意：更新注释中的 URL 路径。

```ts
// app/travel/api/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getOssAdapter, isOssConfigured } from "@/lib/oss";

/**
 * 图片下载代理 API
 *
 * GET /travel/api/download?type=cover&id=xxx
 * GET /travel/api/download?type=icon&id=xxx
 *
 * 流程参考 TencentOss.getSignedUrl()：
 * 1. 服务端通过 OssAdapter.getSignedUrl() 生成临时访问 URL
 * 2. 302 重定向到签名 URL
 * 3. COS 验证签名后返回文件内容
 *
 * 签名 URL 包含临时访问凭据，无需暴露 SecretId/SecretKey 给前端。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "cover";
  const id = searchParams.get("id") || "";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (!isOssConfigured()) {
    return NextResponse.json({ error: "OSS 未配置" }, { status: 503 });
  }

  try {
    const adapter = getOssAdapter();

    // 根据类型确定 OSS Key
    const ossKey = type === "icon"
      ? `trip-plan/icons/${id}`
      : `trip-plan/covers/${id}`;

    // 检查文件是否存在（参考 TencentOss.exists()）
    const fileExists = await adapter.exists(ossKey);
    if (!fileExists) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 获取签名 URL 并重定向（参考 TencentOss.getSignedUrl()）
    const signedUrl = await adapter.getSignedUrl(ossKey);
    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error("图片下载失败:", err);
    return NextResponse.json(
      { error: "下载失败", message: err.message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 更新 oss.ts 中的 URL 引用**

修改 `app/travel/services/oss.ts` 第 285 行和第 292 行：

```ts
// 改前（第 284-286 行）
export function getCoverProxyUrl(id: string): string {
  return `/api/trip-plan/download?type=cover&id=${id}`;
}

// 改后
export function getCoverProxyUrl(id: string): string {
  return `/travel/api/download?type=cover&id=${id}`;
}
```

```ts
// 改前（第 291-293 行）
export function getIconProxyUrl(id: string): string {
  return `/api/trip-plan/download?type=icon&id=${id}`;
}

// 改后
export function getIconProxyUrl(id: string): string {
  return `/travel/api/download?type=icon&id=${id}`;
}
```

- [ ] **Step 3: 删除旧文件**

```bash
rm app/api/trip-plan/download/route.ts
rmdir app/api/trip-plan/download
rmdir app/api/trip-plan
```

- [ ] **Step 4: 验证构建**

```bash
pnpm build
```

Expected: 构建成功，路由 `/travel/api/download` 出现在输出中

- [ ] **Step 5: 提交**

```bash
git add app/travel/api/download/route.ts app/travel/services/oss.ts app/api/trip-plan/
git commit -m "refactor: move download API route into travel module, update oss.ts URLs"
```

---

### Task 4: 删除剩余无调用者的 API 路由和 app/api/ 目录

**Files:**
- Delete: `app/api/iot-wfm/get-list/route.ts`
- Delete: `app/api/iot-wfm/get-config/route.ts`
- Delete: `app/api/iot-wfm/set-state/route.ts`
- Delete: `app/api/iot-wfm/set-config/route.ts`
- Delete: `app/api/iot-wfm/delete/route.ts`
- Delete: `app/api/iot-wfm/get-logs/route.ts`
- Delete: `app/api/iot-wfm/clear-logs/route.ts`
- Delete: `app/api/` 整个目录

这些路由与 Server Actions 完全重叠，无任何调用者。

- [ ] **Step 1: 删除所有文件和目录**

```bash
rm -rf app/api/
```

- [ ] **Step 2: 验证构建**

```bash
pnpm build
```

Expected: 构建成功，不再有 `/api/iot-wfm/` 和 `/api/trip-plan/` 路由

- [ ] **Step 3: 提交**

```bash
git add -A app/api/
git commit -m "refactor: remove redundant API routes (replaced by Server Actions)"
```

---

### Task 5: 更新 IoT 固件 URL 配置

**Files:**
- Modify: `iot-rom-v2/config.h:34`
- Modify: `iot-rom-v2/NetworkExt.h:32-34`

- [ ] **Step 1: 修改 config.h 的 URL_PREFIX**

文件路径相对于 `iot-rom-v2/`。

```cpp
// 改前（第 34 行）
#define URL_PREFIX                                                             \
  "http://xiequ.7qbjs.com/api/iot-wfm/"

// 改后
#define URL_PREFIX                                                             \
  "http://xiequ.7qbjs.com/watering/api/"
```

- [ ] **Step 2: 修改 NetworkExt.h 的路径常量**

```cpp
// 改前（第 32-34 行）
#define GET_STATE_URL "getState"
#define PUSH_STATE_URL "pushState"

// 改后
#define GET_STATE_URL "get-state"
#define PUSH_STATE_URL "push-state"
```

- [ ] **Step 3: 提交**

```bash
cd iot-rom-v2
git add config.h NetworkExt.h
git commit -m "fix: update IoT firmware URLs to match new server route structure"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 清除构建缓存并重新构建**

```bash
rm -rf .next
pnpm build
```

Expected: 构建成功，路由列表中：
- 包含 `/watering/api/get-state`
- 包含 `/watering/api/push-state`
- 包含 `/travel/api/download`
- 不包含任何 `/api/iot-wfm/` 或 `/api/trip-plan/` 路由

- [ ] **Step 2: 启动开发服务器验证路由可达**

```bash
pnpm dev
```

分别验证三个端点：
- `curl http://localhost:3000/watering/api/get-state?chipId=test&macAddress=test` → 应返回 JSON
- `curl http://localhost:3000/watering/api/push-state?chipId=test&macAddress=test&event=heartbeat` → 应返回 JSON
- `curl -I http://localhost:3000/travel/api/download?type=cover&id=test` → 应返回 404 或 503（取决于 OSS 配置），不是 404 route not found

- [ ] **Step 3: 最终提交**

如有任何修复，提交。否则无需额外提交。

---

## Self-Review

**1. Spec coverage:**
- ✅ 目录结构：Task 1-4 覆盖
- ✅ 删除 7 个路由：Task 4 覆盖
- ✅ 保留 3 个路由：Task 1-3 覆盖
- ✅ IoT 固件适配：Task 5 覆盖
- ✅ 决策规则：属于文档约定，已在设计文档中记录，无需代码变更
- ✅ oss.ts URL 引用：Task 3 Step 2 覆盖

**2. Placeholder scan:** 无 TBD、TODO、"implement later"、"add validation" 等。所有步骤包含完整代码。

**3. Type consistency:** 所有路由文件的 import 路径和函数签名与原文件一致，仅位置变更。
