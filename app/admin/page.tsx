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
