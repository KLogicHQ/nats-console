'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Server, CheckCircle, XCircle, AlertCircle, RefreshCw, Search, Star } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateClusterDialog } from '@/components/forms/create-cluster-dialog';
import { useClusterStore } from '@/stores/cluster';

export default function ClustersPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [search, setSearch] = useState('');
  const { selectedClusterId, setSelectedClusterId } = useClusterStore();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.clusters.list(),
  });

  // Filter and sort clusters alphabetically
  const filteredClusters = useMemo(() => {
    if (!data?.clusters) return [];

    let clusters = [...data.clusters];

    // Filter by search
    if (search) {
      clusters = clusters.filter((cluster: any) =>
        cluster.name.toLowerCase().includes(search.toLowerCase()) ||
        cluster.description?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Sort alphabetically by name
    clusters.sort((a: any, b: any) => a.name.localeCompare(b.name));

    return clusters;
  }, [data?.clusters, search]);

  const showSearch = (data?.clusters?.length || 0) > 3;

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
      production: 'bg-purple-100 text-purple-700',
      staging: 'bg-amber-100 text-amber-700',
      development: 'bg-sky-100 text-sky-700',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[env] || 'bg-gray-100 text-gray-700'}`}>
        {env}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clusters</h1>
          <p className="text-muted-foreground">Manage your NATS JetStream clusters</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Cluster
          </Button>
        </div>
        <CreateClusterDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      </div>

      {/* Search - only show if more than 3 clusters */}
      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clusters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive">Failed to load clusters</p>
          </CardContent>
        </Card>
      )}

      {data?.clusters && data.clusters.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No clusters yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first NATS cluster to get started
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Cluster
            </Button>
          </CardContent>
        </Card>
      )}

      {filteredClusters.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClusters.map((cluster: any) => {
            const isSelected = cluster.id === selectedClusterId;
            return (
              <Link key={cluster.id} href={`/clusters/${cluster.id}`} onClick={() => setSelectedClusterId(cluster.id)}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(cluster.status)}
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {cluster.name}
                          {isSelected && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                        </CardTitle>
                        <CardDescription>{cluster.description || 'No description'}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      {getEnvironmentBadge(cluster.environment)}
                      <span className="text-muted-foreground">
                        {cluster.version || 'Unknown version'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* No results from search */}
      {search && filteredClusters.length === 0 && data?.clusters && data.clusters.length > 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No clusters found</h3>
            <p className="text-muted-foreground">No clusters match "{search}"</p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
