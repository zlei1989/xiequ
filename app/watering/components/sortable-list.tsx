/**
 * 可拖拽排序的列表组件
 *
 * 封装 @dnd-kit 与 antd-mobile List 的集成。
 * 长按 300ms 激活拖拽（与 SwipeAction 横向滑动自然区分），
 * 松手触发 onReorder 回调，调用方负责更新数据。
 * items.length <= 1 时不附加拖拽监听器。
 */

'use client';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ErrorBlock, List } from 'antd-mobile';
import { type ReactNode } from 'react';

interface SortableListProps<T> {
  /** 数据数组 */
  items: T[];
  /** List header 文本 */
  header?: string;
  /** 空列表提示文本（默认"暂无数据"） */
  emptyText?: string;
  /** 排序回调 — 松手时触发，传入旧索引和新索引 */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** 渲染每行内容（调用方自行包裹 SwipeAction + List.Item） */
  renderItem: (item: T, index: number) => ReactNode;
  /** 获取每行的唯一 key（可选，默认使用 index 转字符串） */
  getKey?: (item: T, index: number) => string;
}

/**
 * 单个可排序行 — 通过 useSortable 获取拖拽 attributes/listeners/transform
 *
 * 仅当 items.length > 1 时使用；单项列表直接渲染内容，不附加拖拽监听器。
 */
function SortableItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function SortableList<T>({
  items,
  header,
  emptyText = '暂无数据',
  onReorder,
  renderItem,
  getKey,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const keyFn = getKey ?? ((_: T, index: number) => String(index));
  const ids = items.map((item, index) => keyFn(item, index));

  /** 仅多项时可拖拽 */
  const canDrag = items.length > 1;

  function handleDragStart(_event: DragStartEvent) {
    // 拖拽开始，预留视觉反馈扩展点
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const fromIndex = ids.indexOf(String(active.id));
      const toIndex = ids.indexOf(String(over.id));
      if (fromIndex !== -1 && toIndex !== -1) {
        onReorder(fromIndex, toIndex);
      }
    }
  }

  function handleDragCancel() {
    // 拖拽取消，预留还原状态扩展点
  }

  const listContent = (
    <List header={header}>
      {items.length === 0 ? (
        <ErrorBlock status="empty" title={emptyText} />
      ) : (
        items.map((item, index) => {
          const id = keyFn(item, index);
          const content = renderItem(item, index);
          if (!canDrag) {
            return <div key={id}>{content}</div>;
          }
          return (
            <SortableItem id={id} key={id}>
              {content}
            </SortableItem>
          );
        })
      )}
    </List>
  );

  if (!canDrag) {
    // 单项或无项：不包裹 DndContext，避免无意义的拖拽监听
    return listContent;
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {listContent}
      </SortableContext>
    </DndContext>
  );
}
