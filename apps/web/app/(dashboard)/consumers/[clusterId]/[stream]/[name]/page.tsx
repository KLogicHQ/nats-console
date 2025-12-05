'use client';

import { Suspense } from 'react';
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
import { formatNumber, formatDuration } from '@nats-console/shared';

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Users },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
];

function ConsumerDetailContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clusterId = params.clusterId as string;
  const streamName = params.stream as string;
  const consumerName = params.name as string;

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
    const pending = consumer.num_pending || 0;
    if (pending > 10000) return { status: 'critical', label: 'Critical Lag', color: 'text-red-500', bg: 'bg-red-100' };
    if (pending > 1000) return { status: 'warning', label: 'High Lag', color: 'text-yellow-500', bg: 'bg-yellow-100' };
    return { status: 'healthy', label: 'Healthy', color: 'text-green-500', bg: 'bg-green-100' };
  };

  const health = getHealthStatus();

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
            </div>
            <p className="text-muted-foreground">
              Stream: {streamName}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('Are you sure you want to delete this consumer?')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

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
                  {formatNumber(consumer.num_pending || 0)}
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
                  {formatNumber(consumer.num_ack_pending || 0)}
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
                  {formatNumber(consumer.num_redelivered || 0)}
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
                  {formatNumber(consumer.num_waiting || 0)}
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
                    consumer.config?.durable_name
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {consumer.config?.durable_name ? 'Durable' : 'Ephemeral'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deliver Policy</span>
                  <span className="capitalize">{consumer.config?.deliver_policy || 'all'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ack Policy</span>
                  <span className="capitalize">{consumer.config?.ack_policy || 'explicit'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Replay Policy</span>
                  <span className="capitalize">{consumer.config?.replay_policy || 'instant'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Filter Subject</span>
                  <span className="font-mono text-sm">{consumer.config?.filter_subject || '*'}</span>
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
                  <span>{formatDuration(consumer.config?.ack_wait || 30000000000)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Deliver</span>
                  <span>{consumer.config?.max_deliver === -1 ? 'Unlimited' : consumer.config?.max_deliver}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Ack Pending</span>
                  <span>{consumer.config?.max_ack_pending === -1 ? 'Unlimited' : formatNumber(consumer.config?.max_ack_pending || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Waiting</span>
                  <span>{consumer.config?.max_waiting || 512}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deliver Subject</span>
                  <span className="font-mono text-sm truncate max-w-[200px]">
                    {consumer.config?.deliver_subject || '-'}
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
                      {formatNumber(consumer.num_pending || 0)}
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        (consumer.num_pending || 0) > 10000
                          ? 'bg-red-500'
                          : (consumer.num_pending || 0) > 1000
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(((consumer.num_pending || 0) / 10000) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Ack Pending</span>
                    <span className="text-sm text-muted-foreground">
                      {formatNumber(consumer.num_ack_pending || 0)}
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{
                        width: `${Math.min(((consumer.num_ack_pending || 0) / 1000) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
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

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <Card>
          <CardHeader>
            <CardTitle>Consumer Metrics</CardTitle>
            <CardDescription>Performance metrics and trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Chart visualization coming soon</p>
                <p className="text-sm">Integrate with your preferred charting library</p>
              </div>
            </div>
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
