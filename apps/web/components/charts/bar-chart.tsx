'use client';

import { useRef, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface BarChartProps {
  data: { name: string; value: number }[];
  title?: string;
  yAxisLabel?: string;
  color?: string;
  height?: number;
  horizontal?: boolean;
}

export function BarChart({
  data,
  title,
  yAxisLabel = '',
  color = '#2563eb',
  height = 300,
  horizontal = false,
}: BarChartProps) {
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

    checkDimensions();
    timeout = setTimeout(checkDimensions, 100);

    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(checkDimensions);
      observer.observe(containerRef.current);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (observer) observer.disconnect();
    };
  }, []);

  const option: EChartsOption = {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: {
      left: '0%',
      right: '2%',
      top: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: horizontal
      ? {
          type: 'value',
          name: yAxisLabel,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f3f4f6' } },
          axisLabel: { color: '#6b7280', fontSize: 11 },
        }
      : {
          type: 'category',
          data: data.map((d) => d.name),
          axisLine: { lineStyle: { color: '#e5e7eb' } },
          axisLabel: { color: '#6b7280', fontSize: 11, rotate: 45 },
        },
    yAxis: horizontal
      ? {
          type: 'category',
          data: data.map((d) => d.name),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#6b7280', fontSize: 11 },
        }
      : {
          type: 'value',
          name: yAxisLabel,
          nameTextStyle: { color: '#6b7280' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f3f4f6' } },
          axisLabel: { color: '#6b7280', fontSize: 11 },
        },
    series: [
      {
        name: title || 'Value',
        type: 'bar',
        barWidth: '60%',
        itemStyle: { color, borderRadius: 0 },
        data: data.map((d) => d.value),
      },
    ],
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height }}>
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
