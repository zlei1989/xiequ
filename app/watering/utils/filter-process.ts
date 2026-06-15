/**
 * 流程禁用项过滤工具
 *
 * 在发送给 ROM 固件前移除 disabled 的步骤和中断，
 * 确保禁用配置在设备端不生效。
 */

import type { ProcessConfig } from '../types';

/**
 * 过滤单个流程中禁用的步骤和中断
 *
 * 深拷贝流程对象后：
 * 1. 移除 disabled === true 的步骤
 * 2. 移除每个步骤中 disabled === true 的中断
 */
export function filterProcess(process: ProcessConfig): ProcessConfig {
  return {
    ...process,
    steps: process.steps
      .filter((step) => !step.disabled)
      .map((step) => ({
        ...step,
        interrupts: step.interrupts?.filter((irq) => !irq.disabled),
      })),
  };
}

/**
 * 过滤流程数组中所有禁用的步骤和中断
 */
export function filterProcesses(processes: ProcessConfig[]): ProcessConfig[] {
  return processes.map(filterProcess);
}
