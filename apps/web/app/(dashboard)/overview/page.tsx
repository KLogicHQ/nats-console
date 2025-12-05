'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Database,
  Users,
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, formatNumber } from '@nats-console/shared';

export default function OverviewPage() {
  const { data: clustersData, isLoading: clustersLoading } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const clusters = clustersData?.clusters || [];
  const connectedClusters = clusters.filter((c: any) => c.status === 'connected').length;
  const totalClusters = clusters.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-foreground">Monitor your NATS JetStream infrastructure</p>
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
              {connectedClusters} connected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Streams</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Across all clusters
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Consumers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Processing messages
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              No active alerts
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
