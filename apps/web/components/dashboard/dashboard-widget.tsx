'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { LineChart, BarChart, GaugeChart } from '@/components/charts';
import { formatNumber, formatBytes } from '@nats-console/shared';

interface Widget {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

interface DashboardWidgetProps {
  widget: Widget;
}

export function DashboardWidget({ widget }: DashboardWidgetProps) {
  const clusterId = widget.config.clusterId as string;
  const metric = widget.config.metric as string;

  // Fetch data based on metric type
  const { data, isLoading, error } = useQuery({
    queryKey: ['widget-data', widget.id, clusterId, metric],
    queryFn: async () => {
      if (!clusterId) return null;

      switch (metric) {
        case 'messages_rate':
        case 'bytes_rate':
          return api.analytics.chartThroughput(clusterId, '1h');
        case 'consumer_lag':
          return api.analytics.chartConsumerLag(clusterId, '1h');
        default:
          return api.analytics.overview(clusterId, '1h');
      }
    },
    enabled: !!clusterId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (!clusterId) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a cluster to display data</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive opacity-50" />
          <p className="text-sm">Failed to load data</p>
        </div>
      </div>
    );
  }

  // Helper to safely extract chart data
  const chartData = data && 'data' in data ? (data as { data: any[] }).data : [];

  // Render based on widget type
  switch (widget.type) {
    case 'line-chart':
      return (
        <LineChart
          data={chartData}
          yAxisLabel={metric === 'bytes_rate' ? 'bytes/s' : 'msg/s'}
          color="#2563eb"
          height={200}
          showArea={true}
        />
      );

    case 'bar-chart':
      return (
        <BarChart
          data={chartData}
          yAxisLabel={metric === 'consumer_lag' ? 'pending' : 'value'}
          color="#16a34a"
          height={200}
          horizontal={true}
        />
      );

    case 'gauge':
      // Extract overview data for gauge
      const overviewData = data && 'totalMessages' in data ? data : null;
      const gaugeValue = overviewData?.totalMessages || overviewData?.avgThroughput || 0;
      const maxValue = metric === 'cpu_percent' ? 100 : gaugeValue * 2 || 100;
      return (
        <div className="h-[200px] flex items-center justify-center">
          <GaugeChart
            value={gaugeValue}
            max={maxValue}
            title={getMetricLabel(metric)}
            color={getGaugeColor(gaugeValue, maxValue)}
            height={180}
          />
        </div>
      );

    case 'stat':
      return (
        <div className="h-[200px] flex flex-col items-center justify-center">
          <div className="text-4xl font-bold">
            {formatMetricValue(data, metric)}
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {getMetricLabel(metric)}
          </div>
        </div>
      );

    case 'table':
      return (
        <div className="h-[200px] overflow-auto">
          {chartData.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, 5).map((item: any, idx: number) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2">{item.name}</td>
                    <td className="text-right py-2">{formatNumber(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </div>
      );

    case 'pie-chart':
      // For pie charts, we'd need a different chart component
      // For now, show as a placeholder
      return (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-sm">Pie chart coming soon</p>
          </div>
        </div>
      );

    default:
      return (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Unknown widget type</p>
        </div>
      );
  }
}

function getMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    messages_rate: 'Messages/sec',
    bytes_rate: 'Bytes/sec',
    consumer_lag: 'Consumer Lag',
    connections: 'Connections',
    cpu_percent: 'CPU Usage',
    memory_bytes: 'Memory Usage',
  };
  return labels[metric] || metric;
}

function formatMetricValue(data: any, metric: string): string {
  if (!data) return '0';

  switch (metric) {
    case 'messages_rate':
      return formatNumber(data.avgThroughput || 0);
    case 'bytes_rate':
      return formatBytes(data.totalBytes || 0);
    case 'consumer_lag':
      return formatNumber(data.data?.[0]?.value || 0);
    case 'connections':
      return formatNumber(data.connections || 0);
    case 'cpu_percent':
      return `${(data.cpuPercent || 0).toFixed(1)}%`;
    case 'memory_bytes':
      return formatBytes(data.memoryBytes || 0);
    default:
      return formatNumber(data.totalMessages || 0);
  }
}

function getGaugeColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.5) return '#16a34a'; // green
  if (ratio < 0.75) return '#ca8a04'; // yellow
  return '#dc2626'; // red
}
