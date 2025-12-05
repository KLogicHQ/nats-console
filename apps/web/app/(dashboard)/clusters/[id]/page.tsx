'use client';

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Server,
  Settings,
  BarChart3,
  Database,
  Activity,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsList, TabsContent, useTabs, Tab } from '@/components/ui/tabs';
import { formatBytes, formatNumber } from '@nats-console/shared';

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: Server },
  { id: 'streams', label: 'Streams', icon: Database },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
];

function ClusterDetailContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clusterId = params.id as string;

  const { activeTab, setActiveTab } = useTabs(tabs, 'overview');

  const { data: clusterData, isLoading } = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => api.clusters.get(clusterId),
  });

  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ['cluster-health', clusterId],
    queryFn: () => api.clusters.health(clusterId),
  });

  const { data: infoData } = useQuery({
    queryKey: ['cluster-info', clusterId],
    queryFn: () => api.clusters.info(clusterId),
  });

  const { data: streamsData } = useQuery({
    queryKey: ['streams', clusterId],
    queryFn: () => api.streams.list(clusterId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.clusters.delete(clusterId),
    onSuccess: () => {
      router.push('/clusters');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const cluster = clusterData?.cluster;
  if (!cluster) {
    return (
      <div className="text-center py-12">
        <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Cluster not found</h3>
        <Link href="/clusters">
          <Button variant="outline" className="mt-4">
            Back to Clusters
          </Button>
        </Link>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'disconnected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getEnvironmentBadge = (env: string) => {
    const colors: Record<string, string> = {
      production: 'bg-red-100 text-red-700',
      staging: 'bg-yellow-100 text-yellow-700',
      development: 'bg-green-100 text-green-700',
    };
    return colors[env] || 'bg-gray-100 text-gray-700';
  };

  const jetstream = infoData?.jetstream;
  const streams = streamsData?.streams || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clusters">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              {getStatusIcon(cluster.status)}
              <h1 className="text-3xl font-bold">{cluster.name}</h1>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEnvironmentBadge(cluster.environment)}`}>
                {cluster.environment}
              </span>
            </div>
            <p className="text-muted-foreground">
              {cluster.description || 'No description'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
            <RefreshCw className="h-4 w-4" />
            Test Connection
          </Button>
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('Are you sure you want to delete this cluster?')) {
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
          {/* Connection Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {cluster.status === 'connected' ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-500" />
                )}
                Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-lg font-medium capitalize">{cluster.status}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">URL</p>
                  <p className="text-lg font-mono">{cluster.url}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Version</p>
                  <p className="text-lg font-medium">{cluster.version || 'Unknown'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* JetStream Info */}
          {jetstream && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Streams</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {jetstream.streams || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Consumers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {jetstream.consumers || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatNumber(jetstream.messages || 0)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatBytes(jetstream.bytes || 0)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Server Info */}
          <Card>
            <CardHeader>
              <CardTitle>Server Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Server ID</span>
                    <span className="font-mono text-sm truncate max-w-[200px]">
                      {healthData?.server_id || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Server Name</span>
                    <span>{healthData?.server_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Go Version</span>
                    <span>{healthData?.go || '-'}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span>{healthData?.uptime || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connections</span>
                    <span>{formatNumber(healthData?.connections || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Memory</span>
                    <span>{formatBytes(healthData?.mem || 0)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Streams Tab */}
      {activeTab === 'streams' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Streams</CardTitle>
              <CardDescription>JetStream streams on this cluster</CardDescription>
            </div>
            <Link href="/streams">
              <Button size="sm">
                <Database className="h-4 w-4" />
                Manage Streams
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {streams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No streams on this cluster</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Subjects</th>
                      <th className="text-right p-3 font-medium">Messages</th>
                      <th className="text-right p-3 font-medium">Size</th>
                      <th className="text-right p-3 font-medium">Consumers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map((stream: any) => (
                      <tr key={stream.config.name} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          <Link
                            href={`/streams/${clusterId}/${stream.config.name}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {stream.config.name}
                          </Link>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {stream.config.subjects?.join(', ') || '-'}
                        </td>
                        <td className="p-3 text-right">{formatNumber(stream.state?.messages || 0)}</td>
                        <td className="p-3 text-right">{formatBytes(stream.state?.bytes || 0)}</td>
                        <td className="p-3 text-right">{stream.state?.consumer_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle>Cluster Configuration</CardTitle>
            <CardDescription>Connection and authentication settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <p className="mt-1">{cluster.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Environment</label>
                  <p className="mt-1 capitalize">{cluster.environment}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">URL</label>
                  <p className="mt-1 font-mono">{cluster.url}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Authentication</label>
                  <p className="mt-1">{cluster.authType || 'None'}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <p className="mt-1">{cluster.description || 'No description'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <Card>
          <CardHeader>
            <CardTitle>Cluster Metrics</CardTitle>
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

export default function ClusterDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <ClusterDetailContent />
    </Suspense>
  );
}
