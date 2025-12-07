'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Users, AlertTriangle, CheckCircle, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
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
import { useClusterStore } from '@/stores/cluster';

interface Consumer {
  name: string;
  streamName?: string;
  config?: {
    durableName?: string;
    ackWait?: number;
  };
  numPending?: number;
  numRedelivered?: number;
  numAckPending?: number;
}

export default function ConsumersPage() {
  const queryClient = useQueryClient();
  const { selectedClusterId, setSelectedClusterId } = useClusterStore();
  const [selectedStream, setSelectedStream] = useState<string>('__all__');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [consumerToDelete, setConsumerToDelete] = useState<{ name: string; streamName: string } | null>(null);

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  // Ensure cluster connection before fetching data
  const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['cluster-health', selectedClusterId],
    queryFn: () => (selectedClusterId ? api.clusters.health(selectedClusterId) : null),
    enabled: !!selectedClusterId,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1,
  });

  const isClusterConnected = healthData?.connected === true;
  const isClusterDisconnected = selectedClusterId && healthData && !healthData.connected;

  const { data: streamsData } = useQuery({
    queryKey: ['streams', selectedClusterId],
    queryFn: () => (selectedClusterId ? api.streams.list(selectedClusterId) : null),
    enabled: !!selectedClusterId && isClusterConnected,
  });

  // Fetch all consumers when "All" is selected, or specific stream consumers
  const { data: consumersData, isLoading, refetch } = useQuery({
    queryKey: ['consumers', selectedClusterId, selectedStream],
    queryFn: () => {
      if (!selectedClusterId) return null;
      if (selectedStream === '__all__') {
        return api.consumers.listAll(selectedClusterId);
      }
      return api.consumers.list(selectedClusterId, selectedStream);
    },
    enabled: !!selectedClusterId && isClusterConnected,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ name, streamName }: { name: string; streamName: string }) =>
      api.consumers.delete(selectedClusterId!, streamName, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumers', selectedClusterId, selectedStream] });
      setConsumerToDelete(null);
    },
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

  const consumers = useMemo(() => {
    return consumersData?.consumers || [];
  }, [consumersData?.consumers]);

  const getHealthStatus = (consumer: Consumer) => {
    const pending = consumer.numPending || 0;
    if (pending > 10000) return { status: 'critical', icon: AlertTriangle, color: 'text-red-500' };
    if (pending > 1000) return { status: 'warning', icon: AlertTriangle, color: 'text-yellow-500' };
    return { status: 'healthy', icon: CheckCircle, color: 'text-green-500' };
  };

  const columns: ColumnDef<Consumer>[] = useMemo(() => {
    const cols: ColumnDef<Consumer>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const streamName = row.original.streamName || selectedStream;
          return (
            <Link
              href={`/consumers/${selectedClusterId}/${streamName}/${row.original.name}`}
              className="font-medium text-primary hover:underline"
            >
              {row.original.name}
            </Link>
          );
        },
      },
    ];

    if (selectedStream === '__all__') {
      cols.push({
        accessorKey: 'streamName',
        header: 'Stream',
        cell: ({ row }) => {
          const streamName = row.original.streamName || selectedStream;
          return (
            <Link
              href={`/streams/${selectedClusterId}/${streamName}`}
              className="text-muted-foreground hover:text-primary hover:underline"
            >
              {streamName}
            </Link>
          );
        },
      });
    }

    cols.push(
      {
        accessorKey: 'config.durableName',
        header: 'Type',
        cell: ({ row }) => (
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              row.original.config?.durableName
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {row.original.config?.durableName ? 'Durable' : 'Ephemeral'}
          </span>
        ),
      },
      {
        accessorKey: 'numPending',
        header: 'Pending',
        cell: ({ row }) => formatNumber(row.original.numPending || 0),
        meta: { align: 'right' as const },
      },
      {
        accessorKey: 'numRedelivered',
        header: 'Redelivered',
        cell: ({ row }) => formatNumber(row.original.numRedelivered || 0),
        meta: { align: 'right' as const },
      },
      {
        accessorKey: 'numAckPending',
        header: 'Ack Pending',
        cell: ({ row }) => formatNumber(row.original.numAckPending || 0),
        meta: { align: 'right' as const },
      },
      {
        accessorKey: 'config.ackWait',
        header: 'Ack Wait',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDuration(row.original.config?.ackWait || 30000000000)}
          </span>
        ),
        meta: { align: 'right' as const },
      },
      {
        id: 'health',
        header: 'Health',
        cell: ({ row }) => {
          const health = getHealthStatus(row.original);
          const HealthIcon = health.icon;
          return <HealthIcon className={`h-5 w-5 mx-auto ${health.color}`} />;
        },
        meta: { align: 'center' as const },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const streamName = row.original.streamName || selectedStream;
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConsumerToDelete({ name: row.original.name, streamName });
              }}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          );
        },
        meta: { align: 'center' as const },
        enableSorting: false,
      }
    );

    return cols;
  }, [selectedClusterId, selectedStream]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Consumers</h1>
          <p className="text-muted-foreground">Manage JetStream consumers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={!selectedClusterId}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button disabled={!selectedClusterId || selectedStream === '__all__'} onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Consumer
          </Button>
        </div>
        {selectedClusterId && selectedStream && selectedStream !== '__all__' && (
          <CreateConsumerDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            clusterId={selectedClusterId}
            streamName={selectedStream}
          />
        )}
      </div>

      <div className="flex gap-4">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedClusterId || ''}
          onChange={(e) => {
            setSelectedClusterId(e.target.value);
            setSelectedStream('__all__');
          }}
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
          value={selectedStream}
          onChange={(e) => setSelectedStream(e.target.value)}
          disabled={!selectedClusterId}
        >
          <option value="__all__">All Streams</option>
          {streamsData?.streams?.map((stream: any) => (
            <option key={stream.config.name} value={stream.config.name}>
              {stream.config.name}
            </option>
          ))}
        </select>
      </div>

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

      {(isLoading || isLoadingHealth) && !isClusterDisconnected && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {!isLoading && isClusterConnected && consumers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No consumers found</h3>
            <p className="text-muted-foreground mb-4">
              Create your first consumer to get started
            </p>
            {selectedStream !== '__all__' && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                Create Consumer
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {consumers.length > 0 && (
        <DataTable
          columns={columns}
          data={consumers}
          searchColumn="name"
          searchPlaceholder="Search consumers..."
          emptyMessage="No consumers found"
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!consumerToDelete} onOpenChange={(open) => !open && setConsumerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Consumer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete consumer &quot;{consumerToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => consumerToDelete && deleteMutation.mutate(consumerToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
