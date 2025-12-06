'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, Search, AlertTriangle, CheckCircle, ChevronRight, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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

export default function ConsumersPage() {
  const queryClient = useQueryClient();
  const { selectedClusterId, setSelectedClusterId } = useClusterStore();
  const [selectedStream, setSelectedStream] = useState<string>('__all__');
  const [search, setSearch] = useState('');
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

  const filteredConsumers = consumersData?.consumers?.filter((consumer: any) =>
    consumer.name.toLowerCase().includes(search.toLowerCase())
  );

  const getHealthStatus = (consumer: any) => {
    const pending = consumer.num_pending || 0;
    if (pending > 10000) return { status: 'critical', icon: AlertTriangle, color: 'text-red-500' };
    if (pending > 1000) return { status: 'warning', icon: AlertTriangle, color: 'text-yellow-500' };
    return { status: 'healthy', icon: CheckCircle, color: 'text-green-500' };
  };

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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search consumers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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

      {!isLoading && isClusterConnected && filteredConsumers && filteredConsumers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No consumers found</h3>
            <p className="text-muted-foreground mb-4">
              {search ? 'No consumers match your search' : 'Create your first consumer to get started'}
            </p>
            {!search && selectedStream !== '__all__' && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                Create Consumer
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {filteredConsumers && filteredConsumers.length > 0 && (
        <div className="border rounded-lg">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Name</th>
                {selectedStream === '__all__' && (
                  <th className="text-left p-4 font-medium">Stream</th>
                )}
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-right p-4 font-medium">Pending</th>
                <th className="text-right p-4 font-medium">Redelivered</th>
                <th className="text-right p-4 font-medium">Ack Pending</th>
                <th className="text-right p-4 font-medium">Ack Wait</th>
                <th className="text-center p-4 font-medium">Health</th>
                <th className="text-center p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConsumers.map((consumer: any) => {
                const health = getHealthStatus(consumer);
                const HealthIcon = health.icon;
                const streamName = consumer.streamName || selectedStream;
                return (
                  <tr key={`${streamName}-${consumer.name}`} className="border-t hover:bg-muted/30">
                    <td className="p-4">
                      <Link
                        href={`/consumers/${selectedClusterId}/${streamName}/${consumer.name}`}
                        className="font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        {consumer.name}
                      </Link>
                    </td>
                    {selectedStream === '__all__' && (
                      <td className="p-4">
                        <Link
                          href={`/streams/${selectedClusterId}/${streamName}`}
                          className="text-muted-foreground hover:text-primary hover:underline"
                        >
                          {streamName}
                        </Link>
                      </td>
                    )}
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          consumer.config?.durable_name
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {consumer.config?.durable_name ? 'Durable' : 'Ephemeral'}
                      </span>
                    </td>
                    <td className="p-4 text-right">{formatNumber(consumer.num_pending || 0)}</td>
                    <td className="p-4 text-right">{formatNumber(consumer.num_redelivered || 0)}</td>
                    <td className="p-4 text-right">{formatNumber(consumer.num_ack_pending || 0)}</td>
                    <td className="p-4 text-right text-muted-foreground">
                      {formatDuration(consumer.config?.ack_wait || 30000000000)}
                    </td>
                    <td className="p-4 text-center">
                      <HealthIcon className={`h-5 w-5 mx-auto ${health.color}`} />
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          setConsumerToDelete({ name: consumer.name, streamName });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
