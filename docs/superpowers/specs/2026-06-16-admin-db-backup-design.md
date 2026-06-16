# Admin 数据库管理后台设计

## 概述

在 `/admin` 路由下提供数据库文件管理页面，支持浏览 `data/` 目录、上传 `.db` 文件到 OSS 备份、删除非当前数据库文件。页面通过密码门控保护。

## 功能

| 功能 | 说明 |
|------|------|
| 密码认证 | `.env.local` 配置 `ADMIN_PASSWORD`，验证通过设 httpOnly cookie，24h 有效 |
| 文件列表 | 展示 `data/` 目录下所有文件（文件名 + 人类可读大小） |
| 上传到 OSS | 每个 `.db` 文件左滑露出上传按钮，上传到 COS 并加时间戳后缀 |
| 删除文件 | 每个文件左滑露出删除按钮，`Dialog.confirm` 二次确认后执行 |

当前数据库文件**可以上传、不可删除**；同级其他文件可以上传（如果是 `.db`）和删除。

## 路由 & 文件结构

```
app/admin/
  page.tsx              — 客户端页面（密码门控 + 文件列表）
  actions.ts            — Server Actions: listFiles / deleteFile / uploadToOss
lib/oss.ts              — 新增 putBuffer 方法（二进制上传）
.env.local              — 新增 ADMIN_PASSWORD、OSS_BACKUP_PREFIX
.env.example            — 同步新增两个变量
```

不新增 API Route，全部操作走 Server Actions。

## 密码认证

- 环境变量 `ADMIN_PASSWORD`，未配置时拒绝所有请求
- 验证通过后设置 httpOnly cookie `admin_token`，值为密码的 SHA-256（不存明文），有效期 24h
- 页面首次加载检查 cookie：无或无效 → 显示密码输入框；有效 → 显示文件列表
- 每个 Server Action 开头校验 cookie，不通过返回 `{ error: 'UNAUTHORIZED' }`，页面回到密码状态
- 退出登录：ActionSheet 选中"退出登录" → 清除 cookie → 回到密码输入状态

## Server Actions

文件：`app/admin/actions.ts`

### `listFiles()`

- 读取 `path.dirname(DB_PATH)` 目录
- `fs.readdirSync` → 过滤目录（只保留文件）→ 返回 `FileInfo[]`
- 目录不存在时返回空数组

```ts
type FileInfo = {
  name: string;
  size: number;
  sizeDisplay: string;
  isCurrentDb: boolean;  // 是否为当前配置的数据库文件
};
```

### `deleteFile(name: string)`

- 校验：不能删除当前数据库文件（`path.basename(DB_PATH)`），拒绝并返回错误
- `fs.unlinkSync` 删除指定文件
- 返回更新后的文件列表

### `uploadToOss(name: string)`

- 只允许 `.db` 后缀文件，否则拒绝
- `fs.readFileSync` 读取文件内容
- 目标 OSS 路径：`{OSS_BACKUP_PREFIX}{name}.{YYYY-MM-DD}.db`
  - `OSS_BACKUP_PREFIX` 默认 `apps/`，从 `.env.local` 读取
- 调用 `OssAdapter.putBuffer()` 上传二进制内容
- 返回 `{ success: boolean, ossPath: string, error?: string }`

## OSS 扩展

文件：`lib/oss.ts`

### 接口新增

```ts
export interface OssAdapter {
  // ... 现有方法 ...
  putBuffer(path: string, buffer: Buffer, options?: OssPutOptions): Promise<void>;
}
```

### TencentCosAdapter 实现

- 使用 COS SDK `putObject`，`Body` 传 `Buffer`
- 默认 `Content-Type: application/octet-stream`
- 日志：耗时 > 500ms 打印 INFO，失败打印 ERROR + 堆栈
- 实现风格参照现有 `putString` 方法

## UI 设计

### 密码门控（未认证）

- 页面标题"数据库管理"
- 密码输入框（`type="password"`）
- 确认按钮，密码错误时显示红色提示文字
- 验证通过后页面切换到文件列表视图

### 已认证 — 整体布局

- 顶部 `NavBar`：
  - left: 返回首页图标（`onBack` 跳转 `/`）
  - title: "数据库管理"
  - right: `MoreOutline` 图标 → 点击打开 ActionSheet
- ActionSheet 菜单项：
  - "退出登录" → 清除 cookie，回到密码状态
  - "取消"
- 底部无 TabBar

### 文件列表

- 使用 antd-mobile `List` 组件
- 每行显示：
  - 文件名（粗体）
  - 文件大小（右侧 extra）
  - 当前数据库文件显示"当前数据库"标签
- 空状态：没有文件时显示"暂无文件"

### 操作 — SwipeAction

参考 `app/travel/components/location-list-item.tsx` 的 `SwipeAction` 模式：

- 当前数据库文件（`isCurrentDb`）：仅 `[上传到 OSS]` 按钮（`color: 'primary'`）
- 其他 `.db` 文件：`[上传到 OSS]`（`color: 'primary'`）+ `[删除]`（`color: 'danger'`）
- 非 `.db` 文件（如 `.backup` 等）：仅 `[删除]`（`color: 'danger'`）

### 交互

- **上传**：点击 → 按钮 loading → 成功后 `Toast.show({ icon: 'success', content: '已上传至 apps/xxx.2026-06-16.db' })` → 失败 toast 错误信息
- **删除**：点击 → `Dialog.confirm({ content: '确认删除「xxx」？不可恢复。' })` → 确认后执行 → 成功后 `Toast.show({ icon: 'success' })` → 失败 toast 错误信息
- **退出登录**：ActionSheet 选择 → 清除 cookie → 页面回到密码状态

## 环境变量

### `.env.local` 新增

```bash
# ─── Admin 管理后台 ──────────────────────────────
ADMIN_PASSWORD=your_password_here
OSS_BACKUP_PREFIX=apps/              # OSS 备份路径前缀，默认 apps/
```

### `.env.example` 同步

新增上述两个变量，`ADMIN_PASSWORD` 示例值留空，`OSS_BACKUP_PREFIX` 默认 `apps/`。

## 错误处理

| 场景 | 处理 |
|------|------|
| 密码错误 | 页面显示红色提示"密码错误"，不透露具体原因 |
| cookie 过期/无效 | Server Action 返回 `{ error: 'UNAUTHORIZED' }`，页面回到密码状态 |
| 文件不存在 | toast "文件不存在或已被删除"，WARN 日志 |
| OSS 未配置 | toast "OSS 未配置，请检查环境变量"，WARN 日志 |
| OSS 上传失败 | toast 错误信息，ERROR 日志 + 堆栈 |
| 删除当前数据库 | Server Action 拒绝，返回错误信息 |
| 目录不存在 | 文件列表返回空数组，页面显示空状态 |
| SCF 部署 `/tmp` 路径 | `DB_PATH` 取 `dirname` 自动适配 |

## 技术约束

- 使用项目现有 Server Actions 模式，不引入 API Routes
- UI 使用 antd-mobile 组件，交互参照旅行模块 `Shell` + `LocationListItem`
- OSS 操作只扩展 `putBuffer` 方法，不修改现有接口签名
- 遵循项目注释规范和日志级别规范
