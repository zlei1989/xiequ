/**
 * callback-map 服务模块单元测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// 每个测试用例前重置模块状态：重新导入以清空 Map
let setCallback: (chipId: string, cb: () => void) => void;
let execCallback: (chipId: string) => void;
let deleteCallback: (chipId: string) => void;

beforeEach(async () => {
  // 清除 globalThis 上的单例 + 重置模块缓存，确保每个测试用例的 Map 初始为空
  Reflect.deleteProperty(globalThis, Symbol.for('watering.callbackMap'));
  vi.resetModules();
  const mod = await import('@/app/watering/services/callback-map');
  setCallback = mod.setCallback;
  execCallback = mod.execCallback;
  deleteCallback = mod.deleteCallback;
});

describe('setCallback', () => {
  it('首次注册：Map 中应存在回调', () => {
    const cb = vi.fn();
    setCallback('chip_001', cb);
    // 验证注册成功：execCallback 应能执行该回调
    execCallback('chip_001');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('设备重连：旧回调应被执行释放，新回调替换', () => {
    const oldCb = vi.fn();
    const newCb = vi.fn();

    setCallback('chip_001', oldCb);
    setCallback('chip_001', newCb);

    // 旧回调应在 setCallback 覆盖时被执行
    expect(oldCb).toHaveBeenCalledTimes(1);
    // 新回调尚未执行
    expect(newCb).not.toHaveBeenCalled();
  });

  it('覆盖后新回调生效', () => {
    const oldCb = vi.fn();
    const newCb = vi.fn();

    setCallback('chip_001', oldCb);
    setCallback('chip_001', newCb);
    // 此时 newCb 是 Map 中的回调
    execCallback('chip_001');

    expect(oldCb).toHaveBeenCalledTimes(1); // 覆盖时执行了 1 次
    expect(newCb).toHaveBeenCalledTimes(1); // execCallback 执行了 1 次
  });
});

describe('execCallback', () => {
  it('通知后 Map 中回调被删除', () => {
    const cb = vi.fn();
    setCallback('chip_001', cb);
    execCallback('chip_001');
    expect(cb).toHaveBeenCalledTimes(1);

    // 再次执行应为空操作
    const cb2 = vi.fn();
    setCallback('chip_001', cb2);
    // 新回调不应受上次 execCallback 影响
    execCallback('chip_001');
    expect(cb2).toHaveBeenCalledTimes(1);
    // 旧回调不应再次执行
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('Map 中无回调时静默跳过不报错', () => {
    expect(() => { execCallback('nonexistent'); }).not.toThrow();
  });
});

describe('deleteCallback', () => {
  it('仅删除回调不执行', () => {
    const cb = vi.fn();
    setCallback('chip_001', cb);
    deleteCallback('chip_001');
    expect(cb).not.toHaveBeenCalled();
  });

  it('Map 中无回调时静默跳过不报错', () => {
    expect(() => { deleteCallback('nonexistent'); }).not.toThrow();
  });
});
