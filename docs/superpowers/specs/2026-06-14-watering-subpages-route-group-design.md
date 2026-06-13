# 浇花模块子页面 Route Group 收敛

## 背景

与旅行模块相同的整理逻辑：将 `app/watering/` 下的子页面收进 Route Group `(subpages)/`，形成主/次分层。

## 方案

### URL 不变

| URL | 说明 |
|-----|------|
| `/watering` | 设备列表主页 |
| `/watering/debug` | 调试页 |
| `/watering/devices/[chipId]` | 设备详情 |
| `/watering/logs/[chipId]` | 设备日志 |

### 目录结构

```
app/watering/
  page.tsx                     → /watering
  layout.tsx                   → 共享布局
  (subpages)/
    debug/page.tsx             → /watering/debug         (移入)
    devices/[chipId]/page.tsx  → /watering/devices/:id   (移入)
    logs/[chipId]/page.tsx     → /watering/logs/:id      (移入)
  components/                  → 共享组件
  hooks/                       → hooks
  services/                    → 服务层
```

## 代码变更

### 1. Import 路径更新

| 页面 | 原路径前缀 | 新路径前缀 |
|------|-----------|-----------|
| `debug/page.tsx` | `../` | `../../` |
| `devices/[chipId]/page.tsx` | `../../` | `../../../` |
| `logs/[chipId]/page.tsx` | `../../` | `../../../` |

### 2. 无需更新的引用

`device-card.tsx` 和 `page.tsx` 中的路由跳转使用绝对路径（`/watering/debug`、`/watering/devices/...`），`(subpages)` 对 URL 透明，无需修改。

## 影响范围

| 文件 | 变更类型 |
|------|----------|
| `app/watering/debug/page.tsx` | 移动到 `(subpages)/debug/`，改 import 路径 |
| `app/watering/devices/[chipId]/page.tsx` | 移动到 `(subpages)/devices/[chipId]/`，改 import 路径 |
| `app/watering/logs/[chipId]/page.tsx` | 移动到 `(subpages)/logs/[chipId]/`，改 import 路径 |

不变：`page.tsx`、`layout.tsx`、`components/`、`hooks/`、`services/`、`device-card.tsx`。
