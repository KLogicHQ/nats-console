'use client';

import { Suspense, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Settings,
  BarChart3,
  Trash2,
  Edit,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsList, useTabs, Tab } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatNumber, formatDuration } from '@nats-console/shared';
import { CreateConsumerDialog } from '@/components/forms/create-consumer-dialog';
import { LineChart } from '@/components/charts';

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Users },
  { id: 'config', label: 'Configuration', icon: Settings },
];

function ConsumerDetailContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clusterId = params.clusterId as string;
  const streamName = params.stream as string;
  const consumerName = params.name as string;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [metricsTimeRange, setMetricsTimeRange] = useState('1h');

  const { activeTab, setActiveTab } = useTabs(tabs, 'overview');

  const { data: consumerData, isLoading } = useQuery({
    queryKey: ['consumer', clusterId, streamName, consumerName],
    queryFn: () => api.consumers.get(clusterId, streamName, consumerName),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.consumers.delete(clusterId, streamName, consumerName),
    onSuccess: () => {
      router.push('/consumers');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.consumers.pause(clusterId, streamName, consumerName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumer', clusterId, streamName, consumerName] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.consumers.resume(clusterId, streamName, consumerName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumer', clusterId, streamName, consumerName] });
    },
  });

  // Metrics data
  const getTimeRangeParams = () => {
    const now = new Date();
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    const from = new Date(now.getTime() - (ranges[metricsTimeRange] || ranges['1h']));
    return {
      clusterId,
      streamName,
      from: from.toISOString(),
      to: now.toISOString(),
      interval: metricsTimeRange === '7d' ? '1h' : metricsTimeRange === '24h' ? '30m' : '5m',
    };
  };

  const { data: metricsData, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['consumer-metrics', clusterId, streamName, consumerName, metricsTimeRange],
    queryFn: () => api.analytics.consumerLag(consumerName, getTimeRangeParams()),
    enabled: activeTab === 'overview',
  });

  // Transform metrics data for charts
  const chartData = useMemo(() => {
    if (!metricsData?.data?.length) return { lag: [], pending: [], ackRate: [] };
    return {
      lag: metricsData.data.map((d: any) => ({
        name: 'Lag',
        value: d.lag || 0,
        time: new Date(d.timestamp).toLocaleTimeString(),
      })),
      pending: metricsData.data.map((d: any) => ({
        name: 'Pending',
        value: d.pendingCount || 0,
        time: new Date(d.timestamp).toLocaleTimeString(),
      })),
      ackRate: metricsData.data.map((d: any) => ({
        name: 'Ack Rate',
        value: d.ackRate || 0,
        time: new Date(d.timestamp).toLocaleTimeString(),
      })),
    };
  }, [metricsData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const consumer = consumerData?.consumer;
  if (!consumer) {
    return (
      <div className="text-center py-12">
        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Consumer not found</h3>
        <Link href="/consumers">
          <Button variant="outline" className="mt-4">
            Back to Consumers
          </Button>
        </Link>
      </div>
    );
  }

  const getHealthStatus = () => {
    const pending = consumer.numPending || 0;
    if (pending > 10000) return { status: 'critical', label: 'Critical Lag', color: 'text-red-500', bg: 'bg-red-100' };
    if (pending > 1000) return { status: 'warning', label: 'High Lag', color: 'text-yellow-500', bg: 'bg-yellow-100' };
    return { status: 'healthy', label: 'Healthy', color: 'text-green-500', bg: 'bg-green-100' };
  };

  const health = getHealthStatus();

  // Check if consumer is paused (pauseUntil is in the future)
  const isPaused = () => {
    const pauseUntil = consumer.config?.pauseUntil;
    if (!pauseUntil) return false;
    return new Date(pauseUntil) > new Date();
  };

  const paused = isPaused();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/consumers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{consumer.name}</h1>
              <span className={`px-2 py-1 text-xs rounded-full ${health.bg} ${health.color}`}>
                {health.label}
              </span>
              {paused && (
                <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">
                  Paused
                </span>
              )}
            </div>
            <p className="text-muted-foreground">
              Stream: {streamName}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['consumer', clusterId, streamName, consumerName] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {paused ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              <Play className="h-4 w-4" />
              {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
            >
              <Pause className="h-4 w-4" />
              {pauseMutation.isPending ? 'Pausing...' : 'Pause'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Consumer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete consumer &quot;{consumerName}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Consumer Dialog */}
      <CreateConsumerDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        clusterId={clusterId}
        streamName={streamName}
        consumer={consumer}
        mode="edit"
      />

      {/* Tabs */}
      <TabsList tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pending Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(consumer.numPending || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Messages waiting to be delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Ack Pending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(consumer.numAckPending || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Delivered, awaiting acknowledgment</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Redelivered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(consumer.numRedelivered || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Messages redelivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Waiting</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(consumer.numWaiting || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Pull requests waiting</p>
              </CardContent>
            </Card>
          </div>

          {/* Consumer Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Consumer Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    consumer.config?.durableName
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {consumer.config?.durableName ? 'Durable' : 'Ephemeral'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deliver Policy</span>
                  <span className="capitalize">{consumer.config?.deliverPolicy || 'all'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ack Policy</span>
                  <span className="capitalize">{consumer.config?.ackPolicy || 'explicit'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Replay Policy</span>
                  <span className="capitalize">{consumer.config?.replayPolicy || 'instant'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Filter Subject</span>
                  <span className="font-mono text-sm">{consumer.config?.filterSubject || '*'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Delivery Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ack Wait</span>
                  <span>{formatDuration(consumer.config?.ackWait || 30000000000)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Deliver</span>
                  <span>{consumer.config?.maxDeliver === -1 ? 'Unlimited' : consumer.config?.maxDeliver}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Ack Pending</span>
                  <span>{consumer.config?.maxAckPending === -1 ? 'Unlimited' : formatNumber(consumer.config?.maxAckPending || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Waiting</span>
                  <span>{consumer.config?.maxWaiting || 512}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deliver Subject</span>
                  <span className="font-mono text-sm truncate max-w-[200px]">
                    {consumer.config?.deliverSubject || '-'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lag Visualization */}
          <Card>
            <CardHeader>
              <CardTitle>Consumer Lag</CardTitle>
              <CardDescription>Visual representation of message backlog</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Pending Messages</span>
                    <span className="text-sm text-muted-foreground">
                      {formatNumber(consumer.numPending || 0)}
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        (consumer.numPending || 0) > 10000
                          ? 'bg-red-500'
                          : (consumer.numPending || 0) > 1000
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(((consumer.numPending || 0) / 10000) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Ack Pending</span>
                    <span className="text-sm text-muted-foreground">
                      {formatNumber(consumer.numAckPending || 0)}
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{
                        width: `${Math.min(((consumer.numAckPending || 0) / 1000) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consumer Lag Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Consumer Lag Over Time</CardTitle>
                <CardDescription>Message lag trend</CardDescription>
              </div>
              <select
                className="h-9 px-3 border rounded-md bg-background text-sm"
                value={metricsTimeRange}
                onChange={(e) => setMetricsTimeRange(e.target.value)}
              >
                <option value="1h">Last 1 hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </select>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : chartData.lag.length > 0 ? (
                <LineChart
                  data={chartData.lag}
                  title=""
                  yAxisLabel="messages"
                  color="#ef4444"
                  height={200}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No metrics data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Messages Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Messages Over Time</CardTitle>
              <CardDescription>Messages pending delivery trend</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : chartData.pending.length > 0 ? (
                <LineChart
                  data={chartData.pending}
                  title=""
                  yAxisLabel="messages"
                  color="#f59e0b"
                  height={200}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No metrics data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ack Rate Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Acknowledgment Rate</CardTitle>
              <CardDescription>Message acknowledgment rate over time</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMetrics ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : chartData.ackRate.length > 0 ? (
                <LineChart
                  data={chartData.ackRate}
                  title=""
                  yAxisLabel="acks/s"
                  color="#22c55e"
                  height={200}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No metrics data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle>Consumer Configuration</CardTitle>
            <CardDescription>Current configuration for this consumer</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(consumer.config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

export default function ConsumerDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <ConsumerDetailContent />
    </Suspense>
  );
}
