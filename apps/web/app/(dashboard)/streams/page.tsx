'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Database, Search, ChevronRight, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, formatNumber } from '@nats-console/shared';
import { CreateStreamDialog } from '@/components/forms/create-stream-dialog';
import { useClusterStore } from '@/stores/cluster';

export default function StreamsPage() {
  const { selectedClusterId, setSelectedClusterId } = useClusterStore();
  const [search, setSearch] = useState('');
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

  const filteredStreams = streamsData?.streams?.filter((stream: any) =>
    stream.config.name.toLowerCase().includes(search.toLowerCase())
  );

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
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search streams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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

      {selectedClusterId && isClusterConnected && filteredStreams && filteredStreams.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No streams found</h3>
            <p className="text-muted-foreground mb-4">
              {search ? 'No streams match your search' : 'Create your first stream to get started'}
            </p>
            {!search && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                Create Stream
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {filteredStreams && filteredStreams.length > 0 && (
        <div className="border rounded-lg">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Name</th>
                <th className="text-left p-4 font-medium">Subjects</th>
                <th className="text-right p-4 font-medium">Messages</th>
                <th className="text-right p-4 font-medium">Size</th>
                <th className="text-right p-4 font-medium">Consumers</th>
                <th className="text-right p-4 font-medium">Storage</th>
              </tr>
            </thead>
            <tbody>
              {filteredStreams.map((stream: any) => (
                <tr key={stream.config.name} className="border-t hover:bg-muted/30">
                  <td className="p-4">
                    <Link
                      href={`/streams/${selectedClusterId}/${stream.config.name}`}
                      className="font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {stream.config.name}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {stream.config.subjects?.join(', ') || '-'}
                  </td>
                  <td className="p-4 text-right">{formatNumber(stream.state?.messages || 0)}</td>
                  <td className="p-4 text-right">{formatBytes(stream.state?.bytes || 0)}</td>
                  <td className="p-4 text-right">{stream.state?.consumer_count || 0}</td>
                  <td className="p-4 text-right">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        stream.config.storage === 'file'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {stream.config.storage}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
