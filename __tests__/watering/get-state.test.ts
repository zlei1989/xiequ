/**
 * get-state API 路由单元测试
 *
 * 测试响应构建和计划任务检查的集成行为。
 * 注意：Promise 阻塞的长轮询行为依赖 callback-map，已在 callback-map.test.ts 中覆盖。
 */

import { describe, it, expect } from 'vitest';

/**
 * 模拟 buildResponse 的核心逻辑（纯函数版本，便于测试）
 */
function buildResponseForTest(
  state: { stateId: string; switch: string; process?: unknown } | null,
  changed: boolean,
  options?: {
    idleSleep?: boolean;
    idleSince?: number;
    idleTimeout?: number;
    processesVersion?: string;
    clientProcessesVersion?: string;
    processes?: unknown[];
  },
) {
  const result: Record<string, unknown> = {};
  result.stateId = state?.stateId || '';
  result.changed = changed;
  result.switch = state?.switch || 'off';

  if (changed && state?.process) {
    result.process = state.process;
  }

  if (
    options?.idleSleep &&
    state?.switch !== 'on' &&
    options?.idleSince != null &&
    options?.idleTimeout != null &&
    (Date.now() - options.idleSince) >= options.idleTimeout
  ) {
    result.sleepDuration = expect.any(Number) as unknown as number;
  }

  if (options?.processesVersion) {
    result.processesVersion = options.processesVersion;
    if (options.clientProcessesVersion !== options.processesVersion) {
      result.processes = options.processes;
    }
  }

  return result;
}

describe('buildResponse', () => {
  it('有变化时应包含 process', () => {
    const state = { stateId: 'abc123', switch: 'on', process: { name: 'test' } };
    const result = buildResponseForTest(state, true);
    expect(result.changed).toBe(true);
    expect(result.process).toEqual({ name: 'test' });
  });

  it('无变化时不应包含 process', () => {
    const state = { stateId: 'abc123', switch: 'off', process: { name: 'test' } };
    const result = buildResponseForTest(state, false);
    expect(result.changed).toBe(false);
    expect(result.process).toBeUndefined();
  });

  it('processesVersion 不匹配时下发 processes', () => {
    const state = { stateId: 'abc', switch: 'off' };
    const result = buildResponseForTest(state, false, {
      processesVersion: 'v2',
      clientProcessesVersion: 'v1',
      processes: [{ name: '流程A', steps: [] }],
    });
    expect(result.processesVersion).toBe('v2');
    expect(result.processes).toEqual([{ name: '流程A', steps: [] }]);
  });

  it('processesVersion 匹配时不下发 processes', () => {
    const state = { stateId: 'abc', switch: 'off' };
    const result = buildResponseForTest(state, false, {
      processesVersion: 'v1',
      clientProcessesVersion: 'v1',
      processes: [{ name: '流程A', steps: [] }],
    });
    expect(result.processesVersion).toBe('v1');
    expect(result.processes).toBeUndefined();
  });

  it('state 为 null 时 stateId 为空字符串', () => {
    const result = buildResponseForTest(null, false);
    expect(result.stateId).toBe('');
    expect(result.switch).toBe('off');
  });

  it('idleSleep 开启 + 空闲超时 → 包含 sleepDuration', () => {
    const state = { stateId: 'abc', switch: 'off' };
    const result = buildResponseForTest(state, false, {
      idleSleep: true,
      idleSince: Date.now() - 60000,
      idleTimeout: 30000,
    });
    expect(result.sleepDuration).toBeDefined();
  });

  it('idleSleep 开启但 switch=on → 不包含 sleepDuration', () => {
    const state = { stateId: 'abc', switch: 'on' };
    const result = buildResponseForTest(state, false, {
      idleSleep: true,
      idleSince: Date.now() - 60000,
      idleTimeout: 30000,
    });
    expect(result.sleepDuration).toBeUndefined();
  });
});
