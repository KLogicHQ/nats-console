'use client';

import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import {
  Server,
  Database,
  Users,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBytes, formatNumber } from '@nats-console/shared';

export default function OverviewPage() {
  const queryClient = useQueryClient();

  const { data: clustersData, isLoading: clustersLoading, refetch: refetchClusters } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: incidentsData, refetch: refetchIncidents } = useQuery({
    queryKey: ['incidents-open'],
    queryFn: () => api.alerts.listIncidents({ status: 'open' }),
  });

  const clusters = clustersData?.clusters || [];
  const connectedClusters = clusters.filter((c: any) => c.status === 'connected');
  const totalClusters = clusters.length;
  const openIncidents = incidentsData?.total || 0;

  // Fetch info for all connected clusters to get stream/consumer counts
  const clusterInfoQueries = useQueries({
    queries: connectedClusters.map((cluster: any) => ({
      queryKey: ['cluster-info', cluster.id],
      queryFn: () => api.clusters.info(cluster.id),
      enabled: cluster.status === 'connected',
      staleTime: 60000, // Cache for 1 minute
    })),
  });

  // Calculate totals from all connected clusters
  const totalStreams = clusterInfoQueries.reduce((sum, query) => {
    return sum + (query.data?.jetstream?.streams || 0);
  }, 0);

  const totalConsumers = clusterInfoQueries.reduce((sum, query) => {
    return sum + (query.data?.jetstream?.consumers || 0);
  }, 0);

  const handleRefresh = () => {
    refetchClusters();
    refetchIncidents();
    queryClient.invalidateQueries({ queryKey: ['cluster-info'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Overview</h1>
          <p className="text-muted-foreground">Monitor your NATS JetStream infrastructure</p>
        </div>
        <Button variant="outline" size="icon" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clusters</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClusters}</div>
            <p className="text-xs text-muted-foreground">
              {connectedClusters.length} connected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Streams</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalStreams)}</div>
            <p className="text-xs text-muted-foreground">
              Across {connectedClusters.length} cluster{connectedClusters.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Consumers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalConsumers)}</div>
            <p className="text-xs text-muted-foreground">
              Processing messages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alert Incidents</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${openIncidents > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${openIncidents > 0 ? 'text-red-500' : ''}`}>{openIncidents}</div>
            <p className="text-xs text-muted-foreground">
              {openIncidents === 0 ? 'No open incidents' : openIncidents === 1 ? '1 open incident' : `${openIncidents} open incidents`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Clusters Status */}
      <Card>
        <CardHeader>
          <CardTitle>Cluster Status</CardTitle>
          <CardDescription>Overview of all connected clusters</CardDescription>
        </CardHeader>
        <CardContent>
          {clustersLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : clusters.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No clusters configured</h3>
              <p className="text-muted-foreground mb-4">
                Add your first NATS cluster to get started
              </p>
              <Link
                href="/clusters"
                className="text-primary hover:underline"
              >
                Go to Clusters →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {clusters.map((cluster: any) => (
                <Link
                  key={cluster.id}
                  href={`/clusters/${cluster.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {cluster.status === 'connected' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium">{cluster.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {cluster.environment} • {cluster.version || 'Unknown version'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      cluster.status === 'connected'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {cluster.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
