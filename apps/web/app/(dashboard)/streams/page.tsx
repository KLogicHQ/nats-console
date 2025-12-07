'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Database, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { formatBytes, formatNumber } from '@nats-console/shared';
import { CreateStreamDialog } from '@/components/forms/create-stream-dialog';
import { useClusterStore } from '@/stores/cluster';

interface Stream {
  config: {
    name: string;
    subjects?: string[];
    storage: string;
    maxMsgs?: number;
    maxBytes?: number;
  };
  state?: {
    messages?: number;
    bytes?: number;
    consumerCount?: number;
  };
}

export default function StreamsPage() {
  const { selectedClusterId, setSelectedClusterId } = useClusterStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  // Ensure cluster connection before fetching streams
  const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['cluster-health', selectedClusterId],
    queryFn: () => (selectedClusterId ? api.clusters.health(selectedClusterId) : null),
    enabled: !!selectedClusterId,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1,
  });

  const isClusterConnected = healthData?.connected === true;
  const isClusterDisconnected = selectedClusterId && healthData && !healthData.connected;

  const { data: streamsData, isLoading, refetch } = useQuery({
    queryKey: ['streams', selectedClusterId],
    queryFn: () => (selectedClusterId ? api.streams.list(selectedClusterId) : null),
    enabled: !!selectedClusterId && isClusterConnected,
  });

  // Auto-select saved cluster or first cluster
  useEffect(() => {
    if (clustersData?.clusters?.length) {
      // Check if saved cluster still exists
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

  const streams = useMemo(() => {
    return streamsData?.streams || [];
  }, [streamsData?.streams]);

  const columns: ColumnDef<Stream>[] = useMemo(() => [
    {
      id: 'name',
      accessorFn: (row) => row.config.name,
      header: 'Name',
      cell: ({ row }) => (
        <Link
          href={`/streams/${selectedClusterId}/${row.original.config.name}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.config.name}
        </Link>
      ),
    },
    {
      accessorKey: 'config.subjects',
      header: 'Subjects',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.config.subjects?.join(', ') || '-'}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'state.messages',
      header: 'Messages',
      cell: ({ row }) => formatNumber(row.original.state?.messages || 0),
      meta: { align: 'right' as const },
    },
    {
      accessorKey: 'state.bytes',
      header: 'Size',
      cell: ({ row }) => formatBytes(row.original.state?.bytes || 0),
      meta: { align: 'right' as const },
    },
    {
      accessorKey: 'state.consumerCount',
      header: 'Consumers',
      cell: ({ row }) => row.original.state?.consumerCount || 0,
      meta: { align: 'right' as const },
    },
    {
      accessorKey: 'config.storage',
      header: 'Storage',
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 text-xs rounded-full ${
            row.original.config.storage === 'file'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-purple-100 text-purple-700'
          }`}
        >
          {row.original.config.storage}
        </span>
      ),
      meta: { align: 'right' as const },
    },
  ], [selectedClusterId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Streams</h1>
          <p className="text-muted-foreground">Manage JetStream streams</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={!selectedClusterId}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button disabled={!selectedClusterId} onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Stream
          </Button>
        </div>
        {selectedClusterId && (
          <CreateStreamDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            clusterId={selectedClusterId}
          />
        )}
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
      </div>

      {!selectedClusterId && (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a cluster</h3>
            <p className="text-muted-foreground">Choose a cluster to view its streams</p>
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

      {selectedClusterId && isClusterConnected && !isLoading && streams.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No streams found</h3>
            <p className="text-muted-foreground mb-4">
              Create your first stream to get started
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Create Stream
            </Button>
          </CardContent>
        </Card>
      )}

      {streams.length > 0 && (
        <DataTable
          columns={columns}
          data={streams}
          searchColumn="name"
          searchPlaceholder="Search streams..."
          emptyMessage="No streams found"
        />
      )}
    </div>
  );
}
