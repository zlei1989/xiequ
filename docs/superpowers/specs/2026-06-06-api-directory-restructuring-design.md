# API 目录重构设计：消除 app/api/ 集中式目录，按模块内聚

## 背景

当前 `app/api/` 目录将所有 API 路由集中放置，脱离了它们所属的业务模块。这导致三个问题：

1. **开发心智负担** — 改一个模块要跳两个目录，找不到代码在哪
2. **模块内聚性差** — 一个模块的东西散落各处，不便于整体理解、移动或删除
3. **URL 命名不一致** — URL 是 `/api/iot-wfm/...`，但模块名叫 `watering`

此外，IoT 固件使用 camelCase 路径（`getState`、`pushState`），服务端使用 kebab-case（`get-state`、`push-state`），两边 URL 对不上，尚未联调。

## 方案选择

考虑了三种方案：

| 方案 | 描述 | 结论 |
|------|------|------|
| A. 模块内聚 | API 路由移入各模块 `api/` 子目录 | ✅ 采用 |
| B. 保留 app/api/ 对齐命名 | 仅将 `iot-wfm` 改名为 `watering` | 不解决内聚问题 |
| C. 模块内聚 + URL rewrite | 代码在模块内，用 rewrite 保持 `/api/` 前缀 | 增加间接层，两套 URL 混乱 |

选择方案 A 的理由：项目规模小，集中管理的优势不明显；`actions.ts` 已在模块内，`api/` 也应在模块内，保持一致；不需要 rewrite 间接层。

## 设计

### 目录结构

删除 `app/api/` 整个目录，API 路由按模块归位：

```
app/
├── watering/
│   ├── api/                        ← 仅保留 IoT 设备专用路由
│   │   ├── get-state/route.ts          → GET /watering/api/get-state
│   │   └── push-state/route.ts         → GET /watering/api/push-state
│   ├── actions.ts                  ← 浏览器端 Server Actions（保留不动）
│   ├── actions/
│   │   ├── set-state.ts
│   │   ├── set-config.ts
│   │   ├── delete-device.ts
│   │   ├── get-logs.ts
│   │   └── clear-logs.ts
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── types.ts
├── travel/
│   ├── api/                        ← 仅保留需要 HTTP 能力的路由
│   │   └── download/route.ts           → GET /travel/api/download
│   ├── actions.ts
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── types.ts
```

### 删除的路由（7 个，无调用者）

以下路由与 Server Actions 功能完全重叠，浏览器端通过 Server Actions 调用，IoT 固件也不调用这些路由：

| 删除的路由 | 等价的 Server Action |
|-------------|---------------------|
| `app/api/iot-wfm/get-list/route.ts` | `getDevices()` |
| `app/api/iot-wfm/get-config/route.ts` | 无调用者 |
| `app/api/iot-wfm/set-state/route.ts` | `setDeviceSwitch()` |
| `app/api/iot-wfm/set-config/route.ts` | `updateDeviceConfig()` |
| `app/api/iot-wfm/delete/route.ts` | `removeDevice()` |
| `app/api/iot-wfm/get-logs/route.ts` | `getLogs()` |
| `app/api/iot-wfm/clear-logs/route.ts` | `clearLogs()` |

### 保留的路由（3 个，Server Action 无法替代）

| 保留的路由 | 新路径 | 原因 |
|-------------|--------|------|
| `get-state` | `app/watering/api/get-state/route.ts` | IoT 设备轮询状态变化，需要 URL + 状态对比逻辑 |
| `push-state` | `app/watering/api/push-state/route.ts` | IoT 设备推送事件（bootstrap/finish/heartbeat），需要 URL |
| `download` | `app/travel/api/download/route.ts` | 浏览器图片下载代理，需要 302 重定向到签名 URL |

### IoT 固件适配

修改 `iot-rom-v2/config.h`（1 处）和 `iot-rom-v2/NetworkExt.h`（2 处）：

**config.h：**
```cpp
// 改前
#define URL_PREFIX "http://xiequ.7qbjs.com/api/iot-wfm/"

// 改后
#define URL_PREFIX "http://xiequ.7qbjs.com/watering/api/"
```

**NetworkExt.h：**
```cpp
// 改前
#define GET_STATE_URL "getState"
#define PUSH_STATE_URL "pushState"

// 改后
#define GET_STATE_URL "get-state"
#define PUSH_STATE_URL "push-state"
```

**最终 URL 对照：**

| 功能 | 旧 URL | 新 URL |
|------|--------|--------|
| 轮询状态 | `/api/iot-wfm/getState` | `/watering/api/get-state` |
| 推送事件 | `/api/iot-wfm/pushState` | `/watering/api/push-state` |
| 下载图片 | `/api/trip-plan/download` | `/travel/api/download` |

### 决策规则：API 路由 vs Server Action

默认用 Server Action，仅以下情况用 API 路由：

| 情况 | 用什么 | 原因 |
|------|--------|------|
| 浏览器端 CRUD | Server Action | 零样板代码，自动 CSRF 保护，`revalidatePath` 刷新 UI |
| 需要 302 重定向 | API 路由 | Action 无法返回 HTTP 重定向 |
| 需要 SSE/流式响应 | API 路由 | Action 不支持流式传输 |
| IoT 设备 / 外部 HTTP 客户端 | API 路由 | 非 React 客户端无法调用 Server Action |
| Webhook 回调 | API 路由 | 第三方服务需要 HTTP URL |

**原则：Server Action 优先，只有浏览器做不到的才用 API 路由。**

## 变更范围

| 类型 | 内容 |
|------|------|
| 删除 | `app/api/` 整个目录（7 个无调用者路由 + 2 个空子目录） |
| 移动 | `app/api/iot-wfm/get-state/` → `app/watering/api/get-state/` |
| 移动 | `app/api/iot-wfm/push-state/` → `app/watering/api/push-state/` |
| 移动 | `app/api/trip-plan/download/` → `app/travel/api/download/` |
| 修复 | IoT 固件 `URL_PREFIX` 改为 `watering/api/`，路径改 kebab-case |
| 不变 | `actions/`、`services/`、`components/`、`hooks/` 全部不动 |

纯文件搬迁 + 固件 1 个文件 3 处字符串修改，无业务逻辑变更。
