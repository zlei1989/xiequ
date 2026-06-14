/**
 * 步骤进度组件 — 展示当前流程的步骤进度条和上一步/下一步导航
 *
 * 使用 antd-mobile Steps（横向）展示已完成/进行中/等待状态，
 * 提供上一步/下一步按钮用于切换 ROM 当前执行步骤。
 */

'use client';

import { Button, Steps } from 'antd-mobile';

import type { StepConfig } from '../types';

export interface StepProgressProps {
  /** 步骤列表（来自 process.steps） */
  steps: StepConfig[];
  /** 当前执行步骤索引，undefined 或负数表示未追踪 */
  stepIndex?: number;
  /** 设备是否在线 */
  online: boolean;
  /** 是否正在执行中（switch === 'on'） */
  running: boolean;
  /** 上一步回调 */
  onPrev: () => void;
  /** 下一步回调 */
  onNext: () => void;
}

/**
 * 根据 stepIndex 和当前索引判定单个步骤的状态
 *
 * - stepIndex 未定义 → 全部 wait
 * - i < stepIndex → finish（已完成）
 * - i === stepIndex → process（进行中）
 * - i > stepIndex → wait（等待）
 */
function getStatus(
  i: number,
  stepIndex: number | undefined,
): 'wait' | 'process' | 'finish' {
  if (stepIndex === undefined || stepIndex < 0) return 'wait';
  if (i < stepIndex) return 'finish';
  if (i === stepIndex) return 'process';
  return 'wait';
}

export function StepProgress({
  steps,
  stepIndex,
  online,
  running,
  onPrev,
  onNext,
}: StepProgressProps) {
  // 无步骤或不在执行中不渲染
  if (steps.length === 0 || !running) return null;

  // 导航按钮禁用判定
  const stepIdx = typeof stepIndex === 'number' && stepIndex >= 0 ? stepIndex : -1;
  const prevDisabled = !online || stepIdx <= 0;
  const nextDisabled = !online || stepIdx < 0 || stepIdx >= steps.length - 1;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {/* 步骤进度条 — 横向 */}
      <Steps direction="horizontal" className="[&_.adm-step-icon]:scale-75">
        {steps.map((step, i) => (
          <Steps.Step
            key={i}
            status={getStatus(i, stepIdx >= 0 ? stepIdx : undefined)}
            title={
              <span className="text-xs">
                {step.name}
              </span>
            }
          />
        ))}
      </Steps>

      {/* 导航按钮 — 仅在有 stepIndex 时显示 */}
      {stepIdx >= 0 && (
        <div className="mt-2 flex justify-between">
          <Button
            color="primary"
            disabled={prevDisabled}
            fill="none"
            size="small"
            onClick={onPrev}
          >
            ← 上一步
          </Button>
          <Button
            color="primary"
            disabled={nextDisabled}
            fill="none"
            size="small"
            onClick={onNext}
          >
            下一步 →
          </Button>
        </div>
      )}
    </div>
  );
}
