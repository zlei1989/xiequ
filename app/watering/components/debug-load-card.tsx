/**
 * 调试负载卡片 — 以 ProgressCircle 展示各负载的 PWM 状态
 *
 * 纯展示，无交互。颜色与进度根据值映射：0=停止(灰)、1-254=PWM(绿)、1024=全速(红)。
 */

'use client';

import {
  AutoCenter,
  Card,
  Grid,
  ProgressCircle,
  Space,
} from 'antd-mobile';

/** 计算 PWM 百分比：val/255*100，1024 即 100%，0 即 0% */
function getPwmPercent(val: number): number {
  if (val === 0) return 0;
  if (val === 1024) return 100;
  return Math.round((val / 255) * 100);
}

/** 根据值返回颜色 CSS 变量 */
function getColor(val: number): string {
  if (val === 0) return 'var(--adm-color-weak)';
  if (val === 1024) return 'var(--adm-color-danger)';
  return 'var(--adm-color-success)';
}

/** 根据值返回状态文字标签 */
function getLabel(val: number): string {
  if (val === 0) return '停止';
  if (val === 1024) return '全速';
  return `PWM ${getPwmPercent(val)}%`;
}

export function DebugLoadCard({ loads }: { loads: Record<string, number> }) {
  return (
    <Card title="负载">
      <Grid columns={2} gap={12}>
        {Object.entries(loads).map(([key, val]) => {
          const pwmPercent = getPwmPercent(val);
          const color = getColor(val);
          const label = getLabel(val);

          return (
            <Grid.Item key={key}>
              <AutoCenter>
                <Space className="gap-0" direction="vertical">
                  <ProgressCircle
                    percent={pwmPercent}
                    style={{
                      '--fill-color': color,
                      '--size': '64px',
                      '--track-width': '4px',
                    }}
                  >
                    <span className="text-sm font-medium">{val}</span>
                  </ProgressCircle>
                  <Space>
                    <span className="text-xs text-gray-500">{key}</span>
                    <span className="text-xs text-gray-400">{label}</span>
                  </Space>
                </Space>
              </AutoCenter>
            </Grid.Item>
          );
        })}
      </Grid>
    </Card>
  );
}
