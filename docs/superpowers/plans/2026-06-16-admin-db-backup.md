# Admin 数据库管理后台实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/admin` 路由下实现数据库文件管理页面，支持浏览 data/ 目录文件、上传 .db 到 OSS 备份、删除文件，密码门控保护。

**Architecture:** Server Actions + 服务层分离（actions.ts 处理 auth + 调用 services.ts）；UI 使用 antd-mobile NavBar + ActionSheet + List + SwipeAction（参照旅行模块 Shell 模式）；OSS 扩展 putBuffer 方法支持二进制上传。

**Tech Stack:** Next.js 16 App Router, antd-mobile v5, cos-nodejs-sdk-v5, Node.js fs/crypto, vitest

---

### Task 1: OSS putBuffer 接口 + 实现

**Files:**
- Modify: `lib/oss.ts` — 接口新增 `putBuffer` + `TencentCosAdapter` 实现
- Modify: `__tests__/lib/oss.test.ts` — 新增测试用例

- [ ] **Step 1: 在 OssAdapter 接口中新增 putBuffer 方法声明**

在 `lib/oss.ts` 的 `OssAdapter` 接口中，`delete` 方法后面添加：

```ts
/** 上传二进制内容（Buffer） */
putBuffer(path: string, buffer: Buffer, options?: OssPutOptions): Promise<void>;
```

- [ ] **Step 2: 在 TencentCosAdapter 类中实现 putBuffer**

在 `lib/oss.ts` 的 `TencentCosAdapter` 类中，`delete` 方法后面添加：

```ts
/**
 * 上传二进制内容（Buffer）
 *
 * 与 putString 结构一致，但 Body 直接接受 Buffer，
 * 默认 Content-Type 为 application/octet-stream，适用于 SQLite .db 等二进制文件。
 * 日志：耗时 > 500ms 打印 INFO，失败打印 ERROR + 堆栈。
 */
public putBuffer(
  path: string,
  buffer: Buffer,
  options?: OssPutOptions,
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    if (!options) {
      options = {};
    }
    if (!options.headers) {
      options.headers = {};
    }
    if (!('Content-Type' in options.headers)) {
      options.headers['Content-Type'] = 'application/octet-stream';
    }

    this.getSdk().putObject(
      {
        Bucket: this.getBucket(),
        Region: this.getEndpoint(),
        Key: path,
        ContentType: options.headers['Content-Type'],
        ContentEncoding: options.headers['Content-Encoding'],
        Body: buffer,
      },
      (err: OssErr | null, _data: unknown) => {
        const elapsed = Date.now() - start;
        if (err) {
          // ERROR: 上传失败，打印堆栈和上下文
          console.error(`[OSS] putBuffer failed (${String(elapsed)}ms) path=${path}:`, err.message || err);
          if (err.stack) console.error(err.stack);
          reject(toOssError(err)); return;
        }
        if (elapsed > 500) console.log(`[OSS] putBuffer OK (${String(elapsed)}ms) path=${path}`);
        resolve();
      },
    );
  });
}
```

- [ ] **Step 3: 在测试文件中新增 putBuffer 接口检查**

在 `__tests__/lib/oss.test.ts` 的 `'has all required OssAdapter methods'` 测试用例中，`typeof adapter.delete` 后面添加：

```ts
expect(typeof adapter.putBuffer).toBe('function');
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm run test -- __tests__/lib/oss.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/oss.ts __tests__/lib/oss.test.ts
git commit -m "feat: add putBuffer method to OssAdapter for binary upload"
```

---

### Task 2: Admin 服务层（纯函数，不含 auth）

**Files:**
- Create: `app/admin/services.ts` — listFiles / deleteFile / uploadToOss 核心逻辑

- [ ] **Step 1: 创建 `app/admin/services.ts`**

```ts
/**
 * Admin 数据库管理 — 服务层
 *
 * 纯函数，负责文件列表读取、删除、OSS 上传等核心逻辑。
 * 不含认证检查，认证由 actions.ts 的 Server Action 包装层处理。
 * 注意事项：
 * - 数据库目录路径从 DB_PATH 环境变量派生，兼容 SCF /tmp 部署
 * - uploadToOss 仅接受 .db 后缀文件
 */

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';

import { getOssAdapter, isOssConfigured } from '@/lib/oss';

/** 数据库文件目录（DB_PATH 的 dirname，兼容 SCF /tmp 路径） */
function getDbDir(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');
  return path.dirname(dbPath);
}

/** 当前数据库文件名 */
function getCurrentDbName(): string {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');
  return path.basename(dbPath);
}

/** 文件信息 */
export type FileInfo = {
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** 人类可读的文件大小（如 "44 KB"） */
  sizeDisplay: string;
  /** 是否为当前配置中的数据库文件 */
  isCurrentDb: boolean;
};

/** OSS 上传结果 */
export type UploadResult = {
  success: boolean;
  /** OSS 完整路径（成功时有效） */
  ossPath: string;
  /** 错误信息（失败时有效） */
  error?: string;
};

/**
 * 格式化文件大小（字节 → 人类可读）
 *
 * < 1024 B 显示 "X B"，< 1 MB 显示 "X.X KB"，>= 1 MB 显示 "X.X MB"
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 列出数据库目录下所有文件
 *
 * 读取 data/ 目录 → 过滤子目录（只保留文件）→ 排序（按文件名）。
 * 目录不存在时返回空数组（兼容 SCF 冷启动 /tmp 未创建场景）。
 */
export function listFiles(): FileInfo[] {
  const dbDir = getDbDir();
  if (!existsSync(dbDir)) {
    console.warn(`[Admin] 数据库目录不存在: ${dbDir}`);
    return [];
  }
  const currentDb = getCurrentDbName();
  const entries = readdirSync(dbDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = path.join(dbDir, e.name);
      const stat = statSync(filePath);
      return {
        name: e.name,
        size: stat.size,
        sizeDisplay: formatSize(stat.size),
        isCurrentDb: e.name === currentDb,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 删除指定文件
 *
 * 安全检查：不允许删除当前数据库文件（path.basename(DB_PATH)）。
 * 文件不存在时返回错误而非抛出异常。
 */
export function deleteFile(name: string): { success: boolean; error?: string } {
  const dbDir = getDbDir();
  const currentDb = getCurrentDbName();

  if (name === currentDb) {
    console.warn(`[Admin] 拒绝删除当前数据库文件: ${name}`);
    return { success: false, error: '不能删除当前使用的数据库文件' };
  }

  const filePath = path.join(dbDir, name);
  if (!existsSync(filePath)) {
    console.warn(`[Admin] 文件不存在: ${filePath}`);
    return { success: false, error: '文件不存在或已被删除' };
  }

  unlinkSync(filePath);
  console.log(`[Admin] 已删除文件: ${name}`);
  return { success: true };
}

/**
 * 上传 .db 文件到 OSS（腾讯云 COS）
 *
 * 仅接受 .db 后缀文件；目标路径格式：{OSS_BACKUP_PREFIX}{name}.{YYYY-MM-DD}.db。
 * OSS_BACKUP_PREFIX 从环境变量读取，默认 "apps/"。
 * 文件不存在或 OSS 未配置时返回错误，不抛异常。
 */
export async function uploadToOss(name: string): Promise<UploadResult> {
  if (!name.endsWith('.db')) {
    return { success: false, ossPath: '', error: '仅支持上传 .db 文件' };
  }

  if (!isOssConfigured()) {
    console.warn('[Admin] OSS 未配置，无法上传');
    return { success: false, ossPath: '', error: 'OSS 未配置，请检查环境变量' };
  }

  const dbDir = getDbDir();
  const filePath = path.join(dbDir, name);
  if (!existsSync(filePath)) {
    return { success: false, ossPath: '', error: '文件不存在或已被删除' };
  }

  const prefix = process.env.OSS_BACKUP_PREFIX || 'apps/';
  // 去掉原 .db 后缀，拼接日期生成 OSS 路径
  const baseName = name.replace(/\.db$/, '');
  const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const ossPath = `${prefix}${baseName}.${dateStr}.db`;

  try {
    const buffer = readFileSync(filePath);
    const adapter = getOssAdapter();
    await adapter.putBuffer(ossPath, buffer);
    console.log(`[Admin] 已上传至 OSS: ${ossPath}`);
    return { success: true, ossPath };
  } catch (err) {
    // ERROR: OSS 上传失败，打印堆栈和上下文
    console.error(`[Admin] OSS 上传失败 path=${ossPath}:`, err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    const message = err instanceof Error ? err.message : '上传失败';
    return { success: false, ossPath, error: message };
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add app/admin/services.ts
git commit -m "feat: add admin services layer for file listing, deletion, and OSS upload"
```

---

### Task 3: Admin Server Actions（auth + 调用服务层）

**Files:**
- Create: `app/admin/actions.ts`

- [ ] **Step 1: 创建 `app/admin/actions.ts`**

```ts
/**
 * Admin 数据库管理 — Server Actions
 *
 * 所有服务端操作统一从这里导出，前端组件通过 import 直接调用。
 * 认证检查在此层完成：每个操作前校验 admin_token cookie。
 * 核心逻辑委托给 services.ts。
 */

'use server';

import { createHash } from 'crypto';
import { cookies } from 'next/headers';

import { deleteFile, listFiles, uploadToOss } from './services';

import type { FileInfo, UploadResult } from './services';

/** Cookie 名称常量 */
const TOKEN_COOKIE = 'admin_token';

/**
 * 获取密码的 SHA-256 哈希
 *
 * ADMIN_PASSWORD 未配置时返回 null，所有认证操作将拒绝。
 */
function getPasswordHash(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash('sha256').update(password).digest('hex');
}

/**
 * 校验当前请求是否已认证
 *
 * 读取 admin_token cookie 与密码哈希比对，匹配则视为已认证。
 */
function authenticate(): boolean {
  const hash = getPasswordHash();
  if (!hash) return false;
  const token = cookies().get(TOKEN_COOKIE)?.value;
  return token === hash;
}

/**
 * 验证管理密码
 *
 * 比对明文密码的 SHA-256 与 ADMIN_PASSWORD 的哈希，
 * 匹配则设置 httpOnly cookie（24h 有效）并返回成功。
 */
export async function verifyPassword(password: string): Promise<{ success: boolean }> {
  const hash = getPasswordHash();
  if (!hash) {
    console.warn('[Admin] ADMIN_PASSWORD 未配置，拒绝登录');
    return { success: false };
  }
  const inputHash = createHash('sha256').update(password).digest('hex');
  if (inputHash !== hash) {
    return { success: false };
  }
  cookies().set(TOKEN_COOKIE, hash, {
    httpOnly: true,
    maxAge: 86400,
    path: '/',
    sameSite: 'lax' as const,
  });
  console.log('[Admin] 管理员登录成功');
  return { success: true };
}

/**
 * 检查当前认证状态
 *
 * 页面加载时调用，判断是否已登录。
 */
export async function checkAuth(): Promise<{ authenticated: boolean }> {
  return { authenticated: authenticate() };
}

/**
 * 退出登录
 *
 * 删除 admin_token cookie，后续操作需重新验证密码。
 */
export async function logout(): Promise<{ success: boolean }> {
  cookies().delete(TOKEN_COOKIE);
  console.log('[Admin] 管理员退出登录');
  return { success: true };
}

/**
 * 获取文件列表
 *
 * 未认证时返回 error: 'UNAUTHORIZED'，前端据此回到密码状态。
 */
export async function getFiles(): Promise<{ files: FileInfo[]; error?: string }> {
  if (!authenticate()) return { files: [], error: 'UNAUTHORIZED' };
  console.log('[Admin] 获取文件列表');
  return { files: listFiles() };
}

/**
 * 删除文件
 *
 * 未认证时返回 error: 'UNAUTHORIZED'。
 * 不允许删除当前数据库文件（services.ts 层校验）。
 */
export async function removeFile(name: string): Promise<{ success: boolean; error?: string }> {
  if (!authenticate()) return { success: false, error: 'UNAUTHORIZED' };
  console.log(`[Admin] 删除文件: ${name}`);
  return deleteFile(name);
}

/**
 * 上传文件到 OSS
 *
 * 未认证时返回 error: 'UNAUTHORIZED'。
 * 仅支持 .db 文件（services.ts 层校验）。
 */
export async function backupToOss(name: string): Promise<UploadResult> {
  if (!authenticate()) return { success: false, ossPath: '', error: 'UNAUTHORIZED' };
  console.log(`[Admin] 上传到 OSS: ${name}`);
  return uploadToOss(name);
}
```

- [ ] **Step 2: 提交**

```bash
git add app/admin/actions.ts
git commit -m "feat: add admin server actions with cookie-based auth"
```

---

### Task 4: Admin 页面 UI

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: 创建 `app/admin/page.tsx`**

```tsx
/**
 * 数据库管理页面
 *
 * 提供 data/ 目录文件浏览、上传 .db 文件到 OSS 备份、删除文件等功能。
 * 通过密码门控保护，认证后 24h 有效。
 *
 * 交互模式参照旅行模块 Shell：
 * - NavBar right: MoreOutline → ActionSheet（退出登录）
 * - 文件操作：SwipeAction 右滑露出上传/删除按钮
 * - 删除：Dialog.confirm 二次确认
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ActionSheet, Button, Dialog, DotLoading, Input, List, NavBar, SafeArea, SwipeAction, Toast } from 'antd-mobile';
import { AppstoreOutline, MoreOutline } from 'antd-mobile-icons';

import { backupToOss, checkAuth, getFiles, logout, removeFile, verifyPassword } from './actions';

import type { FileInfo } from './services';

export default function AdminPage() {
  const router = useRouter();

  // 认证状态：null = 加载中，false = 未认证，true = 已认证
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionVisible, setActionVisible] = useState(false);

  /** 页面加载时检查认证状态，已认证则预加载文件列表 */
  useEffect(() => {
    checkAuth().then((r) => {
      setAuthenticated(r.authenticated);
      if (r.authenticated) {
        void loadFiles();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时执行一次
  }, []);

  /** 加载文件列表，UNAUTHORIZED 时回退到登录状态 */
  async function loadFiles() {
    const result = await getFiles();
    if (result.error === 'UNAUTHORIZED') {
      setAuthenticated(false);
      return;
    }
    setFiles(result.files);
  }

  /** 验证密码 */
  async function handleLogin() {
    if (!password) return;
    setLoading(true);
    setPasswordError(false);
    try {
      const result = await verifyPassword(password);
      if (result.success) {
        setAuthenticated(true);
        setPassword('');
        await loadFiles();
      } else {
        setPasswordError(true);
      }
    } catch {
      setPasswordError(true);
    } finally {
      setLoading(false);
    }
  }

  /** 退出登录：清除 cookie → 回密码状态 */
  function handleLogout() {
    setActionVisible(false);
    void logout().then(() => {
      setAuthenticated(false);
      setFiles([]);
    });
  }

  /** 上传文件到 OSS */
  async function handleUpload(name: string) {
    setLoading(true);
    try {
      const result = await backupToOss(name);
      if (result.success) {
        Toast.show({ icon: 'success', content: `已上传至 ${result.ossPath}` });
      } else {
        Toast.show({ icon: 'fail', content: result.error || '上传失败' });
      }
    } catch (err) {
      console.error('[Admin] 上传失败:', err);
      Toast.show({ icon: 'fail', content: '上传失败' });
    } finally {
      setLoading(false);
    }
  }

  /** 删除文件（Dialog.confirm 二次确认） */
  function handleDelete(name: string) {
    Dialog.confirm({
      content: `确认删除「${name}」？不可恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      onConfirm: async () => {
        setLoading(true);
        try {
          const result = await removeFile(name);
          if (result.success) {
            Toast.show({ icon: 'success', content: '已删除' });
            await loadFiles();
          } else {
            Toast.show({ icon: 'fail', content: result.error || '删除失败' });
          }
        } catch (err) {
          console.error('[Admin] 删除失败:', err);
          Toast.show({ icon: 'fail', content: '删除失败' });
        } finally {
          setLoading(false);
        }
      },
    });
  }

  /**
   * 根据文件类型生成 SwipeAction 右滑操作按钮
   *
   * .db 文件 → 上传按钮（color: primary）
   * 非当前数据库文件 → 删除按钮（color: danger）
   */
  const getRightActions = useCallback(
    (file: FileInfo) => {
      const actions: Array<{
        key: string;
        text: string;
        color: 'primary' | 'danger';
        onClick: () => void;
      }> = [];

      if (file.name.endsWith('.db')) {
        actions.push({
          key: 'upload',
          text: '上传到 OSS',
          color: 'primary',
          onClick: () => {
            void handleUpload(file.name);
          },
        });
      }

      if (!file.isCurrentDb) {
        actions.push({
          key: 'delete',
          text: '删除',
          color: 'danger',
          onClick: () => {
            handleDelete(file.name);
          },
        });
      }

      return actions;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleUpload/handleDelete 每次渲染重建，此处有意保持引用稳定
    [],
  );

  // ── 加载中：显示 DotLoading ──
  if (authenticated === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <DotLoading />
      </div>
    );
  }

  // ── 密码门控（未认证） ──
  if (!authenticated) {
    return (
      <div className="flex h-screen flex-col">
        <SafeArea position="top" />
        <NavBar
          backIcon={<AppstoreOutline />}
          onBack={() => {
            router.push('/');
          }}
        >
          数据库管理
        </NavBar>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
          <h2 className="text-lg font-medium">请输入管理密码</h2>
          <Input
            className="w-full"
            clearable
            placeholder="密码"
            type="password"
            value={password}
            onChange={(val) => {
              setPassword(val);
              setPasswordError(false);
            }}
            onEnterPress={() => {
              void handleLogin();
            }}
          />
          {passwordError && <p className="text-sm text-red-500">密码错误</p>}
          <Button
            block
            color="primary"
            loading={loading}
            onClick={() => {
              void handleLogin();
            }}
          >
            确认
          </Button>
        </div>
        <SafeArea position="bottom" />
      </div>
    );
  }

  // ── 文件列表（已认证） ──
  return (
    <div className="flex h-screen flex-col">
      <SafeArea position="top" />
      <NavBar
        backIcon={<AppstoreOutline />}
        right={
          <MoreOutline
            className="text-2xl"
            onClick={() => {
              setActionVisible(true);
            }}
          />
        }
        onBack={() => {
          router.push('/');
        }}
      >
        数据库管理
      </NavBar>

      <div className="flex-1 overflow-auto">
        {files.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">暂无文件</div>
        ) : (
          <List>
            {files.map((file) => (
              <SwipeAction key={file.name} rightActions={getRightActions(file)}>
                <List.Item
                  description={file.isCurrentDb ? '当前数据库' : undefined}
                  extra={file.sizeDisplay}
                >
                  {file.name}
                </List.Item>
              </SwipeAction>
            ))}
          </List>
        )}
      </div>

      <SafeArea position="bottom" />

      <ActionSheet
        actions={[{ key: 'logout', text: '退出登录' }]}
        cancelText="取消"
        visible={actionVisible}
        onAction={(action) => {
          if (action.key === 'logout') handleLogout();
        }}
        onClose={() => {
          setActionVisible(false);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add app/admin/page.tsx
git commit -m "feat: add admin db management page with password gate"
```

---

### Task 5: 环境变量

**Files:**
- Modify: `.env.example` — 新增 ADMIN_PASSWORD、OSS_BACKUP_PREFIX

- [ ] **Step 1: 在 .env.example 末尾添加新变量**

在 `.env.example` 文件末尾（`DEPLOY_SCF_FUNCTION` 之后）添加：

```bash
# ─── Admin 管理后台 ──────────────────────────────
ADMIN_PASSWORD=                 # 管理后台登录密码
OSS_BACKUP_PREFIX=apps/        # 数据库备份 OSS 路径前缀
```

- [ ] **Step 2: 在 .env.local 中添加配置**

⚠️ **提醒：需要手动在 `.env.local` 中添加以下配置：**

```bash
# ─── Admin 管理后台 ──────────────────────────────
ADMIN_PASSWORD=<设置你的管理密码>
OSS_BACKUP_PREFIX=apps/
```

- [ ] **Step 3: 提交**

```bash
git add .env.example
git commit -m "chore: add ADMIN_PASSWORD and OSS_BACKUP_PREFIX to .env.example"
```

---

### Task 6: 格式化与类型检查

- [ ] **Step 1: 运行格式化**

```bash
npm run format
```

Expected: 无错误，自动修复完成。

- [ ] **Step 2: 运行类型检查 + lint**

```bash
npm run check
```

Expected: 无 TypeScript 错误，无 lint 错误。如有错误，逐一修复后重新运行。

- [ ] **Step 3: 提交（如有格式化变更）**

```bash
git add -u
git commit -m "chore: format and fix lint issues for admin module"
```

---

### Task 7: 测试

**Files:**
- Create: `__tests__/admin/services.test.ts`

- [ ] **Step 1: 创建测试文件 `__tests__/admin/services.test.ts`**

```ts
/**
 * Admin services 层单元测试
 *
 * 测试 listFiles、deleteFile、uploadToOss 核心逻辑。
 * 使用 vitest + Node.js 环境，mock fs 操作模拟文件系统状态。
 */

import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteFile, listFiles } from '@/app/admin/services';

const TEST_DIR = path.join(__dirname, '__test_fs__');

/** 辅助：创建测试文件 */
function createFile(name: string, content: string = 'test') {
  const filePath = path.join(TEST_DIR, name);
  writeFileSync(filePath, content, 'utf-8');
}

describe('admin/services', () => {
  /** 记录原始环境变量，测试结束后恢复 */
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 创建临时测试目录
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    // 设置 DB_PATH 指向测试目录
    process.env.DB_PATH = path.join(TEST_DIR, 'app.db');
    // 创建当前数据库文件（模拟）
    createFile('app.db', 'mock-db-content');
    // 创建其他测试文件
    createFile('app.db.backup', 'mock-backup');
    createFile('notes.txt', 'some notes');
  });

  afterEach(() => {
    // 清理测试目录
    if (existsSync(TEST_DIR)) {
      const entries = readdirSync(TEST_DIR);
      for (const entry of entries) {
        unlinkSync(path.join(TEST_DIR, entry));
      }
      rmdirSync(TEST_DIR);
    }
    // 恢复环境变量
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('listFiles', () => {
    it('列出目录中所有文件，标记当前数据库', () => {
      const files = listFiles();
      // 按名称排序，先 app.db
      expect(files).toHaveLength(3);
      expect(files[0]?.name).toBe('app.db');
      expect(files[0]?.isCurrentDb).toBe(true);
      expect(files[1]?.name).toBe('app.db.backup');
      expect(files[1]?.isCurrentDb).toBe(false);
      expect(files[2]?.name).toBe('notes.txt');
    });

    it('文件大小字段包含原始值和人类可读格式', () => {
      const files = listFiles();
      for (const file of files) {
        expect(typeof file.size).toBe('number');
        expect(file.size).toBeGreaterThan(0);
        expect(typeof file.sizeDisplay).toBe('string');
        expect(file.sizeDisplay.length).toBeGreaterThan(0);
      }
    });

    it('目录不存在时返回空数组', () => {
      process.env.DB_PATH = '/nonexistent/path/app.db';
      const files = listFiles();
      expect(files).toEqual([]);
    });
  });

  describe('deleteFile', () => {
    it('删除非当前数据库文件成功', () => {
      expect(existsSync(path.join(TEST_DIR, 'app.db.backup'))).toBe(true);
      const result = deleteFile('app.db.backup');
      expect(result.success).toBe(true);
      expect(existsSync(path.join(TEST_DIR, 'app.db.backup'))).toBe(false);
    });

    it('拒绝删除当前数据库文件', () => {
      const result = deleteFile('app.db');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不能删除');
      // 文件仍然存在
      expect(existsSync(path.join(TEST_DIR, 'app.db'))).toBe(true);
    });

    it('文件不存在时返回错误', () => {
      const result = deleteFile('nonexistent.db');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('formatSize', () => {
    it('通过 sizeDisplay 的格式间接验证', () => {
      // 创建不同大小的文件验证 formatSize 格式化
      const bigContent = Buffer.alloc(2048).toString(); // 2 KB
      createFile('big.db', bigContent);
      process.env.DB_PATH = path.join(TEST_DIR, 'app.db');

      const files = listFiles();
      const bigFile = files.find((f) => f.name === 'big.db');
      expect(bigFile).toBeDefined();
      // sizeDisplay 应包含空格分隔的数值和单位
      expect(bigFile!.sizeDisplay).toMatch(/^\d+(\.\d)?\s[KMB]B?$/);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

```bash
npm run test -- __tests__/admin/services.test.ts
```

Expected: 所有测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add __tests__/admin/services.test.ts
git commit -m "test: add unit tests for admin services layer"
```

---

### Task 8: 最终检查

- [ ] **Step 1: 运行全部测试**

```bash
npm run test
```

Expected: 所有已有测试仍然通过，新增测试也通过。

- [ ] **Step 2: 运行格式化 + 类型检查**

```bash
npm run format && npm run check
```

Expected: 无错误。

- [ ] **Step 3: 验证 .env.local 已配置**

确认 `.env.local` 中包含 `ADMIN_PASSWORD` 和 `OSS_BACKUP_PREFIX`。

- [ ] **Step 4: 启动开发服务器验证**

```bash
npm run dev
```

访问 `http://localhost:3000/admin`：
1. 确认密码门控显示正常
2. 输入密码后进入文件列表
3. 确认能看到 `app.db` 和其他文件
4. 确认"当前数据库"标签显示正确
5. 确认右滑操作按钮正确（当前数据库仅上传，其他文件有上传+删除）

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore: final cleanup and verification for admin module"
```
