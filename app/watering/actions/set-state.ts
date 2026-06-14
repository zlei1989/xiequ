/**
 * 设备开关控制 Server Action
 *
 * 切换 on 时：将指定流程写入设备状态，固件轮询到新 stateId 后开始执行。
 * 切换 off 时：清空流程信息，固件停止当前执行并进入空闲。
 *
 * 注意：throw 前必须 console.error 打印上下文，便于排查。
 */

'use server';

import { newId } from '@/lib/utils';

import { execCallback } from '../services/callback-map';
import { getDeviceConfig, getDeviceState, saveDeviceState } from '../services/db';

/**
 * 设置设备开关状态
 *
 * 读取设备配置和当前状态，根据 switchState 修改状态字段并写入。
 * on 时校验流程索引合法性，off 时清空执行上下文。
 */
export async function setDeviceSwitch(
  chipId: string,
  switchState: 'on' | 'off',
  processIndex?: number,
) {
  console.log('[Watering] 设置设备开关:', { chipId, switchState, processIndex });

  try {
    const config = await getDeviceConfig(chipId);
    if (!config) {
      console.error('[Watering] 设备不存在，无法设置开关:', { chipId });
      throw new Error('设备不存在');
    }

    const state = await getDeviceState(chipId);
    if (!state) {
      console.error('[Watering] 设备状态不存在，无法设置开关:', { chipId });
      throw new Error('设备状态不存在');
    }

    if (switchState === 'on') {
      const processIdx = processIndex ?? 0;
      if (processIdx >= config.processes.length) {
        console.error('[Watering] 流程索引越界:', { chipId, processIdx, total: config.processes.length });
        throw new Error('流程索引越界');
      }
      state.switch = 'on';
      state.index = processIdx;
      state.process = config.processes[processIdx];
      state.message = undefined;
    } else {
      state.switch = 'off';
      state.index = undefined;
      state.process = undefined;
      state.message = undefined;
    }

    state.stateId = newId();
    state.lastWriteTime = new Date().toISOString();
    await saveDeviceState(state);
    // 唤醒正在长轮询等待的设备：立即下发最新状态，无需等到超时
    execCallback(chipId);
    console.log('[Watering] 设备开关状态已更新:', { chipId, switch: state.switch, stateId: state.stateId });

    return { success: true };
  } catch (err) {
    // 业务校验抛出的 Error 已在上面 console.error 记录
    // 这里捕获 DB 操作等未预期的异常，补充堆栈
    if (err instanceof Error && err.message !== '设备不存在' && err.message !== '设备状态不存在' && err.message !== '流程索引越界') {
      console.error('[Watering] 设置设备开关失败:', { chipId, switchState }, err);
    }
    throw err;
  }
}
