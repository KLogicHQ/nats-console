'use client';

import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface GaugeChartProps {
  value: number;
  max?: number;
  title?: string;
  unit?: string;
  color?: string;
  height?: number;
  thresholds?: { warning: number; critical: number };
}

export function GaugeChart({
  value,
  max = 100,
  title,
  unit = '',
  color = '#2563eb',
  height = 200,
  thresholds = { warning: 70, critical: 90 },
}: GaugeChartProps) {
  const percentage = (value / max) * 100;
  const gaugeColor =
    percentage >= thresholds.critical
      ? '#ef4444'
      : percentage >= thresholds.warning
      ? '#f59e0b'
      : color;

  const option: EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max,
        splitNumber: 5,
        itemStyle: { color: gaugeColor },
        progress: {
          show: true,
          width: 20,
        },
        pointer: { show: false },
        axisLine: {
          lineStyle: {
            width: 20,
            color: [[1, '#f3f4f6']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '70%'],
          fontSize: 14,
          color: '#6b7280',
        },
        detail: {
          valueAnimation: true,
          fontSize: 24,
          fontWeight: 'bold',
          offsetCenter: [0, '30%'],
          formatter: `{value}${unit}`,
          color: gaugeColor,
        },
        data: [{ value, name: title || '' }],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height }} />;
}
