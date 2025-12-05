'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users, Search, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber, formatDuration } from '@nats-console/shared';
import { CreateConsumerDialog } from '@/components/forms/create-consumer-dialog';

export default function ConsumersPage() {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: streamsData } = useQuery({
    queryKey: ['streams', selectedCluster],
    queryFn: () => (selectedCluster ? api.streams.list(selectedCluster) : null),
    enabled: !!selectedCluster,
  });

  const { data: consumersData, isLoading } = useQuery({
    queryKey: ['consumers', selectedCluster, selectedStream],
    queryFn: () =>
      selectedCluster && selectedStream
        ? api.consumers.list(selectedCluster, selectedStream)
        : null,
    enabled: !!selectedCluster && !!selectedStream,
  });

  // Auto-select first cluster
  if (clustersData?.clusters?.length && !selectedCluster) {
    setSelectedCluster(clustersData.clusters[0].id);
  }

  // Auto-select first stream when cluster changes
  if (streamsData?.streams?.length && !selectedStream) {
    setSelectedStream(streamsData.streams[0].config.name);
  }

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
        <Button disabled={!selectedStream} onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" />
          Create Consumer
        </Button>
        {selectedCluster && selectedStream && (
          <CreateConsumerDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            clusterId={selectedCluster}
            streamName={selectedStream}
          />
        )}
      </div>

      <div className="flex gap-4">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedCluster || ''}
          onChange={(e) => {
            setSelectedCluster(e.target.value);
            setSelectedStream(null);
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
          value={selectedStream || ''}
          onChange={(e) => setSelectedStream(e.target.value)}
          disabled={!selectedCluster}
        >
          <option value="">Select stream...</option>
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

      {!selectedStream && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a stream</h3>
            <p className="text-muted-foreground">Choose a cluster and stream to view consumers</p>
          </CardContent>
        </Card>
      )}

      {selectedStream && isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {selectedStream && filteredConsumers && filteredConsumers.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No consumers found</h3>
            <p className="text-muted-foreground mb-4">
              {search ? 'No consumers match your search' : 'Create your first consumer to get started'}
            </p>
            {!search && (
              <Button>
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
                <th className="text-left p-4 font-medium">Type</th>
                <th className="text-right p-4 font-medium">Pending</th>
                <th className="text-right p-4 font-medium">Redelivered</th>
                <th className="text-right p-4 font-medium">Ack Pending</th>
                <th className="text-right p-4 font-medium">Ack Wait</th>
                <th className="text-center p-4 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {filteredConsumers.map((consumer: any) => {
                const health = getHealthStatus(consumer);
                const HealthIcon = health.icon;
                return (
                  <tr key={consumer.name} className="border-t hover:bg-muted/30">
                    <td className="p-4">
                      <Link
                        href={`/consumers/${selectedCluster}/${selectedStream}/${consumer.name}`}
                        className="font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        {consumer.name}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
