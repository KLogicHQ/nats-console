'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Database, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, formatNumber } from '@nats-console/shared';

export default function StreamsPage() {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  const { data: streamsData, isLoading } = useQuery({
    queryKey: ['streams', selectedCluster],
    queryFn: () => (selectedCluster ? api.streams.list(selectedCluster) : null),
    enabled: !!selectedCluster,
  });

  // Auto-select first cluster
  if (clustersData?.clusters?.length && !selectedCluster) {
    setSelectedCluster(clustersData.clusters[0].id);
  }

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
        <Button disabled={!selectedCluster}>
          <Plus className="h-4 w-4 mr-2" />
          Create Stream
        </Button>
      </div>

      <div className="flex gap-4">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selectedCluster || ''}
          onChange={(e) => setSelectedCluster(e.target.value)}
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

      {!selectedCluster && (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a cluster</h3>
            <p className="text-muted-foreground">Choose a cluster to view its streams</p>
          </CardContent>
        </Card>
      )}

      {selectedCluster && isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {selectedCluster && filteredStreams && filteredStreams.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No streams found</h3>
            <p className="text-muted-foreground mb-4">
              {search ? 'No streams match your search' : 'Create your first stream to get started'}
            </p>
            {!search && (
              <Button>
                <Plus className="h-4 w-4 mr-2" />
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
                <tr key={stream.config.name} className="border-t hover:bg-muted/30 cursor-pointer">
                  <td className="p-4 font-medium">{stream.config.name}</td>
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
