'use client';

import { useRef, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { BarChart3 } from 'lucide-react';

interface MultiLineChartProps {
  series: Record<string, Array<{ time: string; value: number }>>;
  title?: string;
  yAxisLabel?: string;
  height?: number;
  showArea?: boolean;
}

const COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#ca8a04', // yellow
  '#9333ea', // purple
  '#0891b2', // cyan
  '#ea580c', // orange
  '#84cc16', // lime
];

export function MultiLineChart({
  series,
  title,
  yAxisLabel = '',
  height = 300,
  showArea = false,
}: MultiLineChartProps) {
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

  const seriesNames = Object.keys(series);

  // Get all unique timestamps
  const allTimes = new Set<string>();
  for (const data of Object.values(series)) {
    for (const item of data) {
      allTimes.add(item.time);
    }
  }
  const timeLabels = Array.from(allTimes).sort();

  const chartSeries = seriesNames.map((name, index) => {
    const data = series[name];
    const color = COLORS[index % COLORS.length];

    // Map values to time labels
    const values = timeLabels.map((time) => {
      const item = data.find((d) => d.time === time);
      return item?.value ?? 0;
    });

    return {
      name,
      type: 'line' as const,
      smooth: true,
      symbol: 'none',
      sampling: 'lttb' as const,
      itemStyle: { color },
      lineStyle: { width: 2 },
      areaStyle: showArea ? { color: `${color}20` } : undefined,
      data: values,
    };
  });

  const option: EChartsOption = {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: seriesNames,
      bottom: 0,
      type: 'scroll',
    },
    grid: {
      left: '0%',
      right: '2%',
      top: '3%',
      bottom: seriesNames.length > 0 ? '15%' : '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeLabels,
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: yAxisLabel,
      nameTextStyle: { color: '#6b7280' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
    },
    series: chartSeries,
  };

  if (seriesNames.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No data available</p>
        </div>
      </div>
    );
  }

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
