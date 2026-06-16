/**
 * 位置详情弹窗
 *
 * 展示封面图、名称、地址、坐标、备注、精彩瞬间列表、状态切换开关。
 */

'use client';

import { Button, Card, Dialog, ErrorBlock, List, Popup, Space, Switch, Toast } from 'antd-mobile';
import { EditSOutline, AddOutline, DeleteOutline } from 'antd-mobile-icons';
import { useState } from 'react';

import { useBackButton } from '@/lib/back-button';

import { CoverImage } from './cover-image';
import { Section } from './section';
import { UploadImage } from './upload-image';

import type { Location, Moment } from '../types';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/**
 * 位置详情弹窗
 *
 * 展示封面图（支持上传替换）、名称、地址、坐标、备注、精彩瞬间列表和状态开关。
 * 精彩瞬间存在时 Switch 禁用（状态锁定为已去）。
 */
export function LocationViewPopup({
  location,
  visible,
  onClose,
  moments,
  onEdit,
  onToggle,
  onDelete: _onDelete,
  onAddMoment,
  onEditMoment,
  onDeleteMoment,
}: {
  location: Location | null;
  visible: boolean;
  onClose: () => void;
  moments: Moment[];
  onEdit: (location: Location) => void;
  onToggle: (location: Location) => Promise<void>;
  onDelete: (location: Location) => Promise<void>;
  onAddMoment: () => void;
  onEditMoment: (moment: Moment) => void;
  onDeleteMoment: (moment: Moment) => Promise<void>;
}) {
  useBackButton(visible, onClose);

  // Date.now() 作为缓存破坏参数初始值，仅在组件挂载时调用一次
  // eslint-disable-next-line react-hooks/purity
  const [coverKey, setCoverKey] = useState(Date.now());

  if (!location) return null;

  // 在 null 检查后提取为 const，闭包中可安全使用 Location 类型
  const loc = location;
  const coverUrl = `/travel/api/download?type=cover&id=${loc.id}&_t=${String(coverKey)}`;

  /**
   * 切换位置状态（已去/待去）—— 调用父组件 onToggle 执行 Server Action，
   * 成功/失败均通过 Toast 反馈。
   */
  async function handleToggle() {
    try {
      await onToggle(loc);
      Toast.show({ icon: 'success', content: '更新成功' });
    } catch (err: unknown) {
      console.error('[Travel] 切换位置状态失败:', err, { locationId: loc.id });
      if (err instanceof Error && err.stack) console.error(err.stack);
      Toast.show({ icon: 'fail', content: getErrorMessage(err, '更新失败') });
    }
  }

  function handleDeleteMoment(moment: Moment) {
    void Dialog.confirm({
      content: `确认删除「${moment.date}」的记录？不可恢复。`,
      confirmText: '确定',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await onDeleteMoment(moment);
          Toast.show({ icon: 'success', content: '删除成功' });
        } catch (err: unknown) {
          console.error('[Travel] 删除瞬间失败:', err, { momentId: moment.id });
          if (err instanceof Error && err.stack) console.error(err.stack);
          Toast.show({ icon: 'fail', content: getErrorMessage(err, '删除失败') });
        }
      },
    });
  }

  return (
    <Popup
      bodyClassName="overflow-auto"
      bodyStyle={{ height: '75vh' }}
      closeOnMaskClick={true}
      position="bottom"
      showCloseButton={true}
      visible={visible}
      onClose={onClose}
      onMaskClick={onClose}
    >
      <CoverImage
        alt={loc.name}
        height={240}
        overlay={
          <UploadImage
            locationId={loc.id}
            type="cover"
            onSuccess={() => { setCoverKey(Date.now()); }}
          />
        }
        src={coverUrl}
      />

      <List>
        <List.Item
          extra={
            <Button color="primary" fill="none" size="small" onClick={() => { onEdit(loc); }}>
              <EditSOutline />
            </Button>
          }
        >
          {loc.name}
        </List.Item>
        <List.Item title="地址">{loc.address}</List.Item>
        <List.Item title="坐标">
          {loc.longitude}, {loc.latitude}
        </List.Item>
        {loc.comments && <List.Item title="备注">{loc.comments}</List.Item>}
      </List>

      <Section
        extra={
          <Button color="primary" fill="none" size="small" onClick={onAddMoment}>
            <AddOutline />
          </Button>
        }
        title="精彩瞬间"
      >
        {moments.length === 0 ? (
          <ErrorBlock description="" status="empty" title="暂无记录" />
        ) : (
          <Space className="w-full" direction="vertical">
            {moments.map((moment) => (
              <Card
                extra={
                  <Button
                    color="danger"
                    fill="none"
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteMoment(moment);
                    }}
                  >
                    <DeleteOutline />
                  </Button>
                }
                key={moment.id}
                title={moment.date}
                onClick={() => { onEditMoment(moment); }}
              >
                {moment.text}
              </Card>
            ))}
          </Space>
        )}
      </Section>

      <List>
        <List.Item
          extra={
            <Switch
              checked={loc.checked}
              checkedText="已去"
              disabled={moments.length > 0}
              uncheckedText="待去"
              onChange={handleToggle}
            />
          }
        >
          状态
        </List.Item>
      </List>
    </Popup>
  );
}
