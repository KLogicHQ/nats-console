'use client';

import { useRef, useState, useEffect } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Wait for container to have dimensions before rendering chart
  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let timeout: NodeJS.Timeout | null = null;

    const checkDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setIsReady(true);
        }
      }
    };

    // Check immediately and also after a short delay for lazy-loaded content
    checkDimensions();
    timeout = setTimeout(checkDimensions, 100);

    // Use ResizeObserver to detect when container gets dimensions
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(checkDimensions);
      observer.observe(containerRef.current);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (observer) observer.disconnect();
    };
  }, []);

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

  return (
    <div ref={containerRef} style={{ width: '100%', minWidth: 150, height }}>
      {isReady && (
        <ReactECharts
          option={option}
          style={{ width: '100%', height: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      )}
    </div>
  );
}
