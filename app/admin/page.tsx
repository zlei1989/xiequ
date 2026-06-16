/**
 * 应用管理页面
 *
 * 提供 data/ 目录文件浏览、上传 .db 文件到 OSS 备份、删除文件等功能。
 * 通过密码门控保护，认证后 24h 有效。
 *
 * 布局外壳（NavBar + SafeArea）由 layout.tsx 提供，
 * 页面通过 useAdminLayout() 控制 NavBar 右侧操作区。
 */

'use client';

import { ActionSheet, Button, Dialog, DotLoading, ErrorBlock, Form, Input, List, SwipeAction, Toast } from 'antd-mobile';
import { MoreOutline } from 'antd-mobile-icons';
import { useCallback, useEffect, useState } from 'react';

import { backupToOss, checkAuth, getFiles, logout, removeFile, verifyPassword } from './actions';
import { useAdminLayout } from './layout';

import type { FileInfo } from './services';

export default function AdminPage() {
  // 认证状态：null = 加载中，false = 未认证，true = 已认证
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionVisible, setActionVisible] = useState(false);
  const { setNavRight } = useAdminLayout();

  /** 页面加载时检查认证状态，已认证则预加载文件列表 */
  useEffect(() => {
    void checkAuth().then((r) => {
      setAuthenticated(r.authenticated);
      if (r.authenticated) {
        void loadFiles();
      }
    });
  }, []);

  /** 认证后设置 NavBar 右侧 MoreOutline 按钮，未认证时清除 */
  useEffect(() => {
    if (authenticated) {
      setNavRight(
        <MoreOutline
          className="text-2xl"
          onClick={() => {
            setActionVisible(true);
          }}
        />,
      );
    } else {
      setNavRight(null);
    }
    // 卸载时清除，避免残留到其他页面
    return () => {
      setNavRight(null);
    };
  }, [authenticated, setNavRight]);

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
    void Dialog.confirm({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── 加载中：显示 DotLoading ──
  if (authenticated === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <DotLoading />
      </div>
    );
  }

  // ── 密码门控（未认证） ──
  if (!authenticated) {
    return (
      <Form
        footer={
          <Button
            block
            color="primary"
            loading={loading}
            type="submit"
            onClick={() => {
              void handleLogin();
            }}
          >
            确认
          </Button>
        }
        layout="vertical"
        mode="card"
      >
        <Form.Header>请输入管理密码</Form.Header>
        <Form.Item help={passwordError ? '密码错误' : undefined}>
          <Input
            clearable
            placeholder="密码"
            type="password"
            value={password}
            onChange={(val) => {
              setPassword(val);
              setPasswordError(false);
            }}
          />
        </Form.Item>
      </Form>
    );
  }

  // ── 文件列表（已认证） ──
  return (
    <>
      {files.length === 0 ? (
        <ErrorBlock description="" status="empty" title="暂无文件" />
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
    </>
  );
}
