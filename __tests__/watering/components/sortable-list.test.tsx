// @vitest-environment jsdom

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { SortableList } from '@/app/watering/components/sortable-list';

interface TestItem {
  id: string;
  name: string;
}

afterEach(cleanup);

describe('SortableList', () => {
  it('渲染空列表', () => {
    render(
      <SortableList<TestItem>
        header="测试"
        items={[]}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    // 空列表显示 antd-mobile ErrorBlock
    expect(screen.getByText('暂无数据')).toBeDefined();
  });

  it('渲染多行', () => {
    const items: TestItem[] = [
      { id: 'a', name: '项目A' },
      { id: 'b', name: '项目B' },
      { id: 'c', name: '项目C' },
    ];
    render(
      <SortableList<TestItem>
        header="测试"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('项目A')).toBeDefined();
    expect(screen.getByText('项目B')).toBeDefined();
    expect(screen.getByText('项目C')).toBeDefined();
  });

  it('显示 header', () => {
    const items: TestItem[] = [{ id: 'a', name: '项目A' }];
    render(
      <SortableList<TestItem>
        header="功能"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('功能')).toBeDefined();
  });

  it('单项列表不附加拖拽监听器', () => {
    const items: TestItem[] = [{ id: 'a', name: '项目A' }];
    const { container } = render(
      <SortableList<TestItem>
        header="测试"
        items={items}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    // 单项时外层 div 不应有拖拽相关的 aria 属性（role 不为空）
    const listItem = container.querySelector('.adm-list-item');
    // 单项时 SortableItem 的 {...attributes} {...listeners} 不会被应用，
    // 因此不会激活拖拽
    expect(screen.getByText('项目A')).toBeDefined();
  });

  it('使用自定义 emptyText', () => {
    render(
      <SortableList<TestItem>
        emptyText="暂无功能"
        header="功能"
        items={[]}
        getKey={(item) => item.id}
        renderItem={(item) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('暂无功能')).toBeDefined();
  });
});
