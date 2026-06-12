/**
 * GET /api/watering/push-state — 设备状态上报 API
 *
 * ESP32 固件通过此接口上报 GPIO 状态和事件（bootstrap/finish/heartbeat）。
 * - bootstrap: 首次上线，自动创建默认配置
 * - finish: 流程执行完毕，清除执行状态
 * - 其他: 普通 heartbeat，记录传感器和负载读数
 */

import { NextResponse } from 'next/server';

import { getDeviceConfig, saveDeviceConfig, getDeviceState, saveDeviceState, writeDeviceLog, updateTick } from '@/app/watering/services/db';
import { newId } from '@/lib/utils';

import type { NextRequest } from 'next/server';

/** ESP32 上报 GPIO 状态和事件（使用 GET 因 ESP32 HTTP 客户端限制） */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chipId = searchParams.get('chipId') || '';
  const macAddress = searchParams.get('macAddress') || '';
  const event = searchParams.get('event') || '';

  console.info('[Watering] push-state 请求', { chipId, macAddress, event });

  if (!chipId || !macAddress) {
    console.warn('[Watering] push-state 缺少必要参数', { chipId, macAddress });
    return NextResponse.json({ error: 'chipId and macAddress required' }, { status: 400 });
  }

  try {
    // 刷新心跳
    await updateTick(chipId);

    // 解析 GPIO 状态 — 从 query 参数中提取 sensor:xxx 和 load:xxx 键值对
    const gpioState: Record<string, Record<string, number>> = { sensors: {}, loads: {} };
    searchParams.forEach((value, key) => {
      const match = key.match(/^(sensor|load):(.+)$/);
      if (match) {
        const [, type, name] = match;
        if (type && name) {
          const category = type === 'sensor' ? 'sensors' : 'loads';
          const bucket = gpioState[category];
          if (bucket) {
            bucket[name] = parseInt(value) || 0;
          }
        }
      }
    });

    // 处理事件
    switch (event) {
      case 'bootstrap': {
        // 首次上线，创建默认配置（如不存在）
        let config = await getDeviceConfig(chipId);
        if (!config) {
          console.info('[Watering] bootstrap 自动创建默认配置', { chipId });
          config = {
            chipId,
            name: `IOT-${chipId}`,
            macAddress,
            processes: [],
            idleSleep: false,
            idleTimeout: 30000,
            bootExec: -1,
            execDelay: 0,
            schedules: [],
            voltage: undefined,
            createdTime: new Date().toISOString(),
            lastWriteTime: new Date().toISOString(),
          };
          await saveDeviceConfig(config);
        }

        let state = await getDeviceState(chipId);
        if (!state) {
          state = {
            chipId,
            stateId: newId(),
            switch: 'off',
            lastWriteTime: new Date().toISOString(),
          };
        }
        // 合并 GPIO 状态
        Object.assign(state, {
          sensors: gpioState.sensors,
          loads: gpioState.loads,
          stateId: newId(),
          lastWriteTime: new Date().toISOString(),
        });
        await saveDeviceState(state);

        // 记录日志
        await writeDeviceLog(chipId, 'bootstrap', { macAddress, cause: searchParams.get('cause') || '' });
        if (state.switch === 'on' && state.process) {
          await writeDeviceLog(chipId, 'execute', { stateId: state.stateId, index: state.index });
        }
        break;
      }
      case 'finish': {
        console.info('[Watering] finish 清除执行状态', { chipId });
        const state = await getDeviceState(chipId);
        if (state && state.switch !== 'off') {
          state.switch = 'off';
          state.index = undefined;
          state.process = undefined;
          state.message = undefined;
          state.stateId = newId();
          state.lastWriteTime = new Date().toISOString();
          await saveDeviceState(state);
        }
        await writeDeviceLog(chipId, 'finish', { macAddress });
        break;
      }
      default: {
        // 普通状态上报（空 event 视为 heartbeat）
        await writeDeviceLog(chipId, event || 'heartbeat', {
          macAddress,
          sensors: gpioState.sensors,
          loads: gpioState.loads,
        });
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Watering] push-state 处理失败', {
      chipId,
      macAddress,
      event,
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error && err.stack) console.error(err.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
