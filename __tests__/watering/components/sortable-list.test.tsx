// @vitest-environment jsdom

import { render, screen, cleanup } from '@testing-library/react';
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
        getKey={(item: TestItem) => item.id}
        header="测试"
        items={[]}
        renderItem={(item: TestItem) => <div>{item.name}</div>}
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
        getKey={(item: TestItem) => item.id}
        header="测试"
        items={items}
        renderItem={(item: TestItem) => <div>{item.name}</div>}
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
        getKey={(item: TestItem) => item.id}
        header="功能"
        items={items}
        renderItem={(item: TestItem) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('功能')).toBeDefined();
  });

  it('单项列表不附加拖拽监听器', () => {
    const items: TestItem[] = [{ id: 'a', name: '项目A' }];
    const { container } = render(
      <SortableList<TestItem>
        getKey={(item: TestItem) => item.id}
        header="测试"
        items={items}
        renderItem={(item: TestItem) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    // 单项时不应有 useSortable 添加的 [role] 属性（拖拽未激活）
    const dragElements = container.querySelectorAll('.adm-list-body [role]');
    expect(dragElements.length).toBe(0);
    // 但内容仍然渲染
    expect(screen.getByText('项目A')).toBeDefined();
  });

  it('使用自定义 emptyText', () => {
    render(
      <SortableList<TestItem>
        emptyText="暂无功能"
        getKey={(item: TestItem) => item.id}
        header="功能"
        items={[]}
        renderItem={(item: TestItem) => <div>{item.name}</div>}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getByText('暂无功能')).toBeDefined();
  });
});
