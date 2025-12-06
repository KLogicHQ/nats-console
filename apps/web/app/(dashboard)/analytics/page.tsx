'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, TrendingDown, Activity, ArrowUpRight, ArrowDownRight, Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, BarChart, MultiLineChart } from '@/components/charts';
import { formatBytes, formatNumber } from '@nats-console/shared';
import { useClusterStore } from '@/stores/cluster';

// Local formatting helpers
function formatThroughput(value: number): string {
  return `${formatNumber(value)}/s`;
}

function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${formatNumber(ms)}ms`;
}

export default function AnalyticsPage() {
  const { selectedClusterId, setSelectedClusterId } = useClusterStore();
  const [timeRange, setTimeRange] = useState('24h');

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  // Ensure cluster connection before fetching analytics
  const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['cluster-health', selectedClusterId],
    queryFn: () => (selectedClusterId ? api.clusters.health(selectedClusterId) : null),
    enabled: !!selectedClusterId,
    staleTime: 30000,
    retry: 1,
  });

  const isClusterConnected = healthData?.connected === true;
  const isClusterDisconnected = selectedClusterId && healthData && !healthData.connected;

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics', selectedClusterId, timeRange],
    queryFn: () =>
      selectedClusterId
        ? api.analytics.overview(selectedClusterId, timeRange)
        : null,
    enabled: !!selectedClusterId && isClusterConnected,
  });

  // Chart data queries
  const { data: throughputData, isLoading: throughputLoading } = useQuery({
    queryKey: ['analytics-throughput', selectedClusterId, timeRange],
    queryFn: () =>
      selectedClusterId
        ? api.analytics.chartThroughput(selectedClusterId, timeRange)
        : null,
    enabled: !!selectedClusterId && isClusterConnected,
  });

  const { data: consumerLagData, isLoading: consumerLagLoading } = useQuery({
    queryKey: ['analytics-consumer-lag', selectedClusterId, timeRange],
    queryFn: () =>
      selectedClusterId
        ? api.analytics.chartConsumerLag(selectedClusterId, timeRange)
        : null,
    enabled: !!selectedClusterId && isClusterConnected,
  });

  const { data: streamActivityData, isLoading: streamActivityLoading } = useQuery({
    queryKey: ['analytics-stream-activity', selectedClusterId, timeRange],
    queryFn: () =>
      selectedClusterId
        ? api.analytics.chartStreamActivity(selectedClusterId, timeRange)
        : null,
    enabled: !!selectedClusterId && isClusterConnected,
  });

  // Auto-select saved cluster or first cluster
  useEffect(() => {
    if (clustersData?.clusters?.length) {
      const savedClusterExists = clustersData.clusters.some(
        (c: any) => c.id === selectedClusterId
      );
      if (!savedClusterExists) {
        setSelectedClusterId(clustersData.clusters[0].id);
      } else if (!selectedClusterId) {
        setSelectedClusterId(clustersData.clusters[0].id);
      }
    }
  }, [clustersData?.clusters, selectedClusterId, setSelectedClusterId]);

  const stats = analyticsData || {
    totalMessages: 0,
    totalBytes: 0,
    avgThroughput: 0,
    avgLatency: 0,
    messagesTrend: 0,
    bytesTrend: 0,
    throughputTrend: 0,
    latencyTrend: 0,
  };

  const StatCard = ({
    title,
    value,
    trend,
    trendLabel,
    icon: Icon,
    format = 'number',
  }: {
    title: string;
    value: number;
    trend: number;
    trendLabel: string;
    icon: any;
    format?: 'number' | 'bytes' | 'throughput' | 'latency';
  }) => {
    const isPositive = trend >= 0;
    const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
    const trendColor = isPositive ? 'text-green-600' : 'text-red-600';

    const formatValue = () => {
      switch (format) {
        case 'bytes':
          return formatBytes(value);
        case 'throughput':
          return formatThroughput(value);
        case 'latency':
          return formatLatency(value);
        default:
          return formatNumber(value);
      }
    };

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatValue()}</div>
          <div className="flex items-center text-xs text-muted-foreground">
            <TrendIcon className={`h-3 w-3 mr-1 ${trendColor}`} />
            <span className={trendColor}>{Math.abs(trend).toFixed(1)}%</span>
            <span className="ml-1">{trendLabel}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Monitor your NATS JetStream performance</p>
        </div>
      </div>

      <div className="flex gap-4">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedClusterId || ''}
          onChange={(e) => setSelectedClusterId(e.target.value)}
        >
          <option value="">Select cluster...</option>
          {clustersData?.clusters?.map((cluster: any) => (
            <option key={cluster.id} value={cluster.id}>
              {cluster.name}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option value="1h">Last 1 hour</option>
          <option value="6h">Last 6 hours</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {!selectedClusterId && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a cluster</h3>
            <p className="text-muted-foreground">Choose a cluster to view analytics</p>
          </CardContent>
        </Card>
      )}

      {isClusterDisconnected && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-12 text-center">
            <WifiOff className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-red-700">Cluster Not Reachable</h3>
            <p className="text-red-600 mb-4">
              Unable to connect to the selected cluster. Please check if the cluster is running and accessible.
            </p>
            <Button variant="outline" onClick={() => refetchHealth()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Connection
            </Button>
          </CardContent>
        </Card>
      )}

      {selectedClusterId && (isLoading || isLoadingHealth) && !isClusterDisconnected && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {selectedClusterId && isClusterConnected && !isLoading && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Messages"
              value={stats.totalMessages}
              trend={stats.messagesTrend}
              trendLabel="from previous period"
              icon={Activity}
            />
            <StatCard
              title="Total Data"
              value={stats.totalBytes}
              trend={stats.bytesTrend}
              trendLabel="from previous period"
              icon={BarChart3}
              format="bytes"
            />
            <StatCard
              title="Avg Throughput"
              value={stats.avgThroughput}
              trend={stats.throughputTrend}
              trendLabel="from previous period"
              icon={TrendingUp}
              format="throughput"
            />
            <StatCard
              title="Avg Latency"
              value={stats.avgLatency}
              trend={stats.latencyTrend}
              trendLabel="from previous period"
              icon={TrendingDown}
              format="latency"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Message Throughput</CardTitle>
                <CardDescription>Messages per second over time</CardDescription>
              </CardHeader>
              <CardContent>
                {throughputLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : throughputData?.data && throughputData.data.length > 0 ? (
                  <LineChart
                    data={throughputData.data}
                    yAxisLabel="msg/s"
                    color="#2563eb"
                    height={300}
                    showArea={true}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No throughput data available</p>
                      <p className="text-sm">Start producing messages to see metrics</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Consumer Lag</CardTitle>
                <CardDescription>Pending messages by consumer</CardDescription>
              </CardHeader>
              <CardContent>
                {consumerLagLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : consumerLagData?.data && consumerLagData.data.length > 0 ? (
                  <BarChart
                    data={consumerLagData.data}
                    yAxisLabel="pending"
                    color="#dc2626"
                    height={300}
                    horizontal={true}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No consumer lag data available</p>
                      <p className="text-sm">Create consumers to see lag metrics</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Stream Activity</CardTitle>
              <CardDescription>Messages by stream over time</CardDescription>
            </CardHeader>
            <CardContent>
              {streamActivityLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : streamActivityData?.streams && Object.keys(streamActivityData.streams).length > 0 ? (
                <MultiLineChart
                  series={streamActivityData.streams}
                  yAxisLabel="msg/s"
                  height={300}
                  showArea={false}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No stream activity data available</p>
                    <p className="text-sm">Create streams and produce messages to see activity</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
