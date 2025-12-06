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
  timeRange?: string;
}

// Metrics that need chart data (time-series)
const CHART_METRICS = [
  'messages_rate', 'bytes_rate', 'throughput', 'message_rate',
  'stream_throughput', 'weekly_trends', 'resource_trends',
  'latency_history', 'ack_rate', 'latency_dist',
];

// Metrics that need consumer lag data
const LAG_METRICS = [
  'consumer_lag', 'lag_history', 'pending_by_consumer',
  'total_pending', 'avg_lag',
];

// Metrics that need cluster info
const CLUSTER_INFO_METRICS = [
  'streams_count', 'consumers_count',
];

// Metrics that need stream activity data
const STREAM_ACTIVITY_METRICS = [
  'stream_sizes', 'message_distribution',
];

// Data sources for table widgets
const TABLE_DATA_SOURCES = ['streams', 'consumers', 'lagging_consumers'];

// Helper to parse comma-separated filter values
const parseFilterValues = (filter: string | undefined): string[] => {
  if (!filter) return [];
  return filter.split(',').map(s => s.trim()).filter(Boolean);
};

// Filter data based on stream/consumer/subject filters
const filterData = (
  data: any[],
  streamFilters: string[],
  consumerFilters: string[],
  subjectFilters: string[]
): any[] => {
  if (!data || data.length === 0) return data;
  if (streamFilters.length === 0 && consumerFilters.length === 0 && subjectFilters.length === 0) return data;

  return data.filter((item) => {
    // Check stream filter
    if (streamFilters.length > 0) {
      const itemStream = item.stream || item.streamName || item.name || '';
      const matchesStream = streamFilters.some(f =>
        itemStream.toLowerCase().includes(f.toLowerCase())
      );
      if (!matchesStream) return false;
    }

    // Check consumer filter
    if (consumerFilters.length > 0) {
      const itemConsumer = item.consumer || item.consumerName || item.name || '';
      const matchesConsumer = consumerFilters.some(f =>
        itemConsumer.toLowerCase().includes(f.toLowerCase())
      );
      if (!matchesConsumer) return false;
    }

    // Check subject filter
    if (subjectFilters.length > 0) {
      const itemSubject = item.subject || item.subjects?.join(',') || '';
      const matchesSubject = subjectFilters.some(f =>
        itemSubject.toLowerCase().includes(f.toLowerCase())
      );
      if (!matchesSubject) return false;
    }

    return true;
  });
};

export function DashboardWidget({ widget, timeRange = '1h' }: DashboardWidgetProps) {
  const clusterId = widget.config.clusterId as string;
  const metric = widget.config.metric as string;
  const dataSource = widget.config.dataSource as string;

  // Get filter values
  const streamFilters = parseFilterValues(widget.config.streamFilter as string);
  const consumerFilters = parseFilterValues(widget.config.consumerFilter as string);
  const subjectFilters = parseFilterValues(widget.config.subjectFilter as string);
  const hasFilters = streamFilters.length > 0 || consumerFilters.length > 0 || subjectFilters.length > 0;

  // Determine which API to call based on metric or dataSource
  const getApiCall = () => {
    // Handle table data sources
    if (TABLE_DATA_SOURCES.includes(dataSource)) {
      if (dataSource === 'streams') {
        return api.streams.list(clusterId);
      }
      if (dataSource === 'consumers' || dataSource === 'lagging_consumers') {
        return api.analytics.chartConsumerLag(clusterId, timeRange);
      }
    }
    if (CHART_METRICS.includes(metric)) {
      return api.analytics.chartThroughput(clusterId, timeRange);
    }
    if (LAG_METRICS.includes(metric)) {
      return api.analytics.chartConsumerLag(clusterId, timeRange);
    }
    if (CLUSTER_INFO_METRICS.includes(metric)) {
      return api.clusters.info(clusterId);
    }
    if (STREAM_ACTIVITY_METRICS.includes(metric)) {
      return api.analytics.chartStreamActivity(clusterId, timeRange);
    }
    return api.analytics.overview(clusterId, timeRange);
  };

  // Fetch data based on metric type
  const { data, isLoading, error } = useQuery({
    queryKey: ['widget-data', widget.id, clusterId, metric, dataSource, timeRange, streamFilters.join(','), consumerFilters.join(','), subjectFilters.join(',')],
    queryFn: async () => {
      if (!clusterId) return null;
      return getApiCall();
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

  // Helper to safely extract chart data and apply filters
  const rawChartData = data && 'data' in data ? (data as { data: any[] }).data : [];
  const chartData = filterData(rawChartData, streamFilters, consumerFilters, subjectFilters);

  // Normalize chart data to ensure it has required fields for LineChart
  // Some APIs return { name, value } while LineChart expects { name, value, time }
  const normalizeChartData = (rawData: any[]): { name: string; value: number; time: string }[] => {
    if (!rawData || rawData.length === 0) return [];

    return rawData.map((item, index) => ({
      name: item.name || `Item ${index + 1}`,
      value: typeof item.value === 'number' ? item.value : 0,
      // Use existing time, or timestamp, or generate a relative time label
      time: item.time || item.timestamp || item.name || `Point ${index + 1}`,
    }));
  };

  // Render based on widget type
  switch (widget.type) {
    case 'line-chart':
      return (
        <LineChart
          data={normalizeChartData(chartData)}
          title={widget.title}
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
      // Handle different data sources for tables
      const tableData = getTableData(data, dataSource, chartData, streamFilters, consumerFilters, subjectFilters);
      return (
        <div className="h-[200px] overflow-auto">
          {tableData.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {tableData.slice(0, 5).map((item: any, idx: number) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2">{item.name}</td>
                    <td className="text-right py-2">{item.formatted || formatNumber(item.value)}</td>
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
      // For pie charts, show as a bar chart (horizontal) with legend
      const pieData = getPieChartData(data, metric, streamFilters);
      if (pieData.length > 0) {
        return (
          <BarChart
            data={pieData}
            yAxisLabel=""
            color="#8b5cf6"
            height={200}
            horizontal={true}
          />
        );
      }
      return (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-sm">No data available</p>
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
    message_rate: 'Messages/sec',
    bytes_rate: 'Bytes/sec',
    consumer_lag: 'Consumer Lag',
    connections: 'Connections',
    cpu_percent: 'CPU Usage',
    memory_bytes: 'Memory Usage',
    streams_count: 'Total Streams',
    consumers_count: 'Total Consumers',
    total_bytes: 'Total Storage',
    throughput: 'Throughput',
    total_messages: 'Total Messages',
    avg_latency: 'Avg Latency',
    uptime: 'Uptime',
    total_pending: 'Pending Messages',
    avg_lag: 'Average Lag',
    processing_rate: 'Processing Rate',
    redelivery_rate: 'Redelivery Rate',
    peak_rate: 'Peak Rate',
    avg_rate: 'Average Rate',
    total_today: 'Total Today',
    p50_latency: 'P50 Latency',
    p95_latency: 'P95 Latency',
    p99_latency: 'P99 Latency',
    max_latency: 'Max Latency',
    storage_percent: 'Storage Used',
    memory_percent: 'Memory Used',
    connections_percent: 'Connections',
  };
  return labels[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatMetricValue(data: any, metric: string): string {
  if (!data) return '0';

  // Handle cluster info response
  if (data.cluster) {
    switch (metric) {
      case 'streams_count':
        return formatNumber(data.cluster.streams || 0);
      case 'consumers_count':
        return formatNumber(data.cluster.consumers || 0);
    }
  }

  // Handle analytics overview response
  switch (metric) {
    case 'messages_rate':
    case 'message_rate':
    case 'throughput':
    case 'processing_rate':
    case 'peak_rate':
    case 'avg_rate':
      return formatThroughput(data.avgThroughput || 0);
    case 'bytes_rate':
    case 'total_bytes':
      return formatBytes(data.totalBytes || 0);
    case 'consumer_lag':
    case 'total_pending':
    case 'avg_lag':
      // For lag metrics, try to get from chart data first
      if (data.data && data.data.length > 0) {
        const total = data.data.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
        return formatNumber(total);
      }
      return formatNumber(0);
    case 'connections':
      return formatNumber(data.connections || 0);
    case 'cpu_percent':
    case 'storage_percent':
    case 'memory_percent':
    case 'connections_percent':
      return `${formatNumber(data.cpuPercent || data.percent || 0)}%`;
    case 'memory_bytes':
      return formatBytes(data.memoryBytes || 0);
    case 'total_messages':
      return formatNumber(data.totalMessages || 0);
    case 'avg_latency':
    case 'p50_latency':
    case 'p95_latency':
    case 'p99_latency':
    case 'max_latency':
      return `${formatNumber(data.avgLatency || 0)}ms`;
    case 'uptime':
      return formatNumber(data.uptime || 100);
    case 'redelivery_rate':
      return formatThroughput(data.redeliveryRate || 0);
    case 'total_today':
      return formatNumber(data.totalMessages || 0);
    default:
      return formatNumber(data.totalMessages || data.avgThroughput || 0);
  }
}

function getGaugeColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.5) return '#16a34a'; // green
  if (ratio < 0.75) return '#ca8a04'; // yellow
  return '#dc2626'; // red
}

function formatThroughput(value: number): string {
  return `${formatNumber(value)}/s`;
}

function getTableData(
  data: any,
  dataSource: string,
  chartData: any[],
  streamFilters: string[] = [],
  consumerFilters: string[] = [],
  subjectFilters: string[] = []
): Array<{ name: string; value: number; formatted?: string }> {
  if (!data) return [];

  // Helper to check if item matches filters
  const matchesFilters = (item: any) => {
    if (streamFilters.length > 0) {
      const itemName = item.stream || item.streamName || item.name || '';
      if (!streamFilters.some(f => itemName.toLowerCase().includes(f.toLowerCase()))) {
        return false;
      }
    }
    if (consumerFilters.length > 0) {
      const itemName = item.consumer || item.consumerName || item.name || '';
      if (!consumerFilters.some(f => itemName.toLowerCase().includes(f.toLowerCase()))) {
        return false;
      }
    }
    if (subjectFilters.length > 0) {
      const subjects = item.subject || item.subjects?.join(',') || item.config?.filterSubject || '';
      if (!subjectFilters.some(f => subjects.toLowerCase().includes(f.toLowerCase()))) {
        return false;
      }
    }
    return true;
  };

  // Handle streams data source
  if (dataSource === 'streams' && data.streams) {
    return data.streams
      .filter((stream: any) => {
        if (streamFilters.length > 0) {
          return streamFilters.some(f => stream.name.toLowerCase().includes(f.toLowerCase()));
        }
        return true;
      })
      .slice(0, 10)
      .map((stream: any) => ({
        name: stream.name,
        value: stream.state?.messages || 0,
        formatted: formatNumber(stream.state?.messages || 0),
        stream: stream.name,
      }));
  }

  // Handle consumers/lagging_consumers data source
  if ((dataSource === 'consumers' || dataSource === 'lagging_consumers') && data.data) {
    return data.data
      .filter(matchesFilters)
      .slice(0, 10)
      .map((item: any) => ({
        name: item.name || item.consumer || 'Unknown',
        value: item.value || item.pending || 0,
        formatted: formatNumber(item.value || item.pending || 0),
      }));
  }

  // Fallback to chartData (already filtered)
  if (chartData.length > 0) {
    return chartData;
  }

  return [];
}

function getPieChartData(
  data: any,
  metric: string,
  streamFilters: string[] = []
): Array<{ name: string; value: number }> {
  // Helper to filter by stream name
  const filterStreams = (entries: [string, any][]) => {
    if (streamFilters.length === 0) return entries;
    return entries.filter(([name]) =>
      streamFilters.some(f => name.toLowerCase().includes(f.toLowerCase()))
    );
  };

  // Handle stream activity data for distribution
  if (metric === 'message_distribution' && data?.streams) {
    const streams = filterStreams(Object.entries(data.streams));
    return streams.slice(0, 5).map(([name, values]: [string, any]) => {
      // Sum up the values in the time series
      const total = Array.isArray(values)
        ? values.reduce((sum: number, point: any) => sum + (point.value || 0), 0)
        : 0;
      return { name, value: total };
    });
  }

  // Handle stream sizes from streams list
  if (metric === 'stream_sizes' && data?.streams) {
    const streams = filterStreams(Object.entries(data.streams));
    return streams.slice(0, 5).map(([name, values]: [string, any]) => {
      const lastValue = Array.isArray(values) && values.length > 0
        ? values[values.length - 1]?.value || 0
        : 0;
      return { name, value: lastValue };
    });
  }

  // Fallback: try to extract from data.data
  if (data?.data && Array.isArray(data.data)) {
    let items = data.data;
    if (streamFilters.length > 0) {
      items = items.filter((item: any) =>
        streamFilters.some(f => (item.name || '').toLowerCase().includes(f.toLowerCase()))
      );
    }
    return items.slice(0, 5).map((item: any) => ({
      name: item.name || 'Unknown',
      value: item.value || 0,
    }));
  }

  return [];
}
