'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Server,
  Database,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatBytes, formatNumber } from '@nats-console/shared';

export default function DashboardPage() {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  const { data: clustersData, isLoading: clustersLoading } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: streamsData } = useQuery({
    queryKey: ['streams', selectedCluster],
    queryFn: () => (selectedCluster ? api.streams.list(selectedCluster) : null),
    enabled: !!selectedCluster,
  });

  // Auto-select first cluster
  if (clustersData?.clusters?.length && !selectedCluster) {
    setSelectedCluster(clustersData.clusters[0].id);
  }

  const clusters = clustersData?.clusters || [];
  const streams = streamsData?.streams || [];

  const connectedClusters = clusters.filter((c: any) => c.status === 'connected').length;
  const totalStreams = streams.length;
  const totalConsumers = streams.reduce(
    (acc: number, s: any) => acc + (s.state?.consumer_count || 0),
    0
  );
  const totalMessages = streams.reduce(
    (acc: number, s: any) => acc + (s.state?.messages || 0),
    0
  );
  const totalBytes = streams.reduce(
    (acc: number, s: any) => acc + (s.state?.bytes || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your NATS JetStream infrastructure</p>
        </div>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedCluster || ''}
          onChange={(e) => setSelectedCluster(e.target.value)}
        >
          <option value="">All clusters</option>
          {clusters.map((cluster: any) => (
            <option key={cluster.id} value={cluster.id}>
              {cluster.name}
            </option>
          ))}
        </select>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clusters</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusters.length}</div>
            <p className="text-xs text-muted-foreground">
              {connectedClusters} connected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Streams</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStreams}</div>
            <p className="text-xs text-muted-foreground">
              {formatBytes(totalBytes)} stored
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consumers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConsumers}</div>
            <p className="text-xs text-muted-foreground">
              Across all streams
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalMessages)}</div>
            <p className="text-xs text-muted-foreground">
              Total in all streams
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cluster Health */}
        <Card>
          <CardHeader>
            <CardTitle>Cluster Health</CardTitle>
            <CardDescription>Status of your connected clusters</CardDescription>
          </CardHeader>
          <CardContent>
            {clustersLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : clusters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No clusters configured</p>
                <Link href="/clusters">
                  <Button variant="outline" className="mt-4">
                    Add Cluster
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {clusters.slice(0, 5).map((cluster: any) => (
                  <div
                    key={cluster.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {cluster.status === 'connected' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">{cluster.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cluster.environment}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        cluster.status === 'connected'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {cluster.status}
                    </span>
                  </div>
                ))}
                {clusters.length > 5 && (
                  <Link href="/clusters" className="block">
                    <Button variant="ghost" className="w-full">
                      View all clusters
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Streams */}
        <Card>
          <CardHeader>
            <CardTitle>Top Streams</CardTitle>
            <CardDescription>Streams by message count</CardDescription>
          </CardHeader>
          <CardContent>
            {streams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No streams found</p>
                <Link href="/streams">
                  <Button variant="outline" className="mt-4">
                    View Streams
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {streams
                  .sort((a: any, b: any) => (b.state?.messages || 0) - (a.state?.messages || 0))
                  .slice(0, 5)
                  .map((stream: any) => (
                    <div
                      key={stream.config.name}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{stream.config.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {stream.config.subjects?.join(', ') || 'No subjects'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {formatNumber(stream.state?.messages || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(stream.state?.bytes || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                {streams.length > 5 && (
                  <Link href="/streams" className="block">
                    <Button variant="ghost" className="w-full">
                      View all streams
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events across your infrastructure</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Stream ORDERS created</p>
                <p className="text-xs text-muted-foreground">Production cluster</p>
              </div>
              <span className="text-xs text-muted-foreground">2m ago</span>
            </div>
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <Users className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Consumer payment-processor added</p>
                <p className="text-xs text-muted-foreground">ORDERS stream</p>
              </div>
              <span className="text-xs text-muted-foreground">15m ago</span>
            </div>
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Cluster staging connected</p>
                <p className="text-xs text-muted-foreground">Health check passed</p>
              </div>
              <span className="text-xs text-muted-foreground">1h ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
